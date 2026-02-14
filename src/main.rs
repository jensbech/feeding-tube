#![allow(dead_code)]

mod app;
mod db;
mod player;
mod ui;
mod ytdlp;

use std::collections::HashSet;
use std::io;
use std::time::Duration;

use clap::Parser;
use crossterm::event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, MouseButton, MouseEventKind};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use app::{App, Mode, Screen};
use db::Database;

// ── CLI Arguments ──────────────────────────────────────────

#[derive(Parser)]
#[command(name = "feeding-tube", version, about = "A terminal UI for managing YouTube subscriptions")]
struct Cli {
    /// Add a channel URL directly
    #[arg(short, long)]
    add: Option<String>,

    /// List all subscriptions (non-interactive)
    #[arg(short, long)]
    list: bool,

    /// Start viewing a specific channel (1-indexed)
    #[arg(short, long)]
    channel: Option<usize>,

    /// Fetch full history (all or specific channel by index/name)
    #[arg(short, long)]
    prime: Option<Option<String>>,
}

// ── Non-interactive Commands ───────────────────────────────

async fn handle_add(url: &str) {
    let db = Database::open().expect("Failed to open database");
    println!("Fetching channel info for: {}", url);

    match ytdlp::get_channel_info(url).await {
        Ok(info) => {
            let sub = db::Subscription {
                id: info.id.clone(),
                name: info.name.clone(),
                url: info.url.clone(),
                added_at: None,
            };
            match db.add_subscription(&sub) {
                Ok(()) => {
                    println!("Added: {}", info.name);
                    print!("Prime historical videos? (Y/n) ");
                    io::Write::flush(&mut io::stdout()).unwrap();
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).unwrap();
                    if input.trim().to_lowercase() != "n" {
                        println!();
                        let existing = db.get_stored_videos(&info.id);
                        let existing_ids: HashSet<String> = existing.iter().filter(|v| v.duration.is_some()).map(|v| v.id.clone()).collect();
                        let name = info.name.clone();
                        match ytdlp::prime_channel(
                            &info.id, &info.name, &info.url, &existing_ids, |_| {},
                        ).await {
                            Ok(result) => {
                                if !result.videos.is_empty() {
                                    db.store_videos(&result.videos);
                                }
                                println!("{}: {} new videos ({} total)", name, result.added, result.total);
                            }
                            Err(e) => println!("{}: failed - {}", name, e),
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to add channel: {}", e);
            std::process::exit(1);
        }
    }
}

fn handle_list() {
    let db = Database::open().expect("Failed to open database");
    let subs = db.get_subscriptions();
    if subs.is_empty() {
        println!("No subscriptions yet. Use --add <url> to add one.");
        return;
    }
    println!("Subscriptions:");
    for (i, sub) in subs.iter().enumerate() {
        println!("  {}. {}", i + 1, sub.name);
        println!("     {}", sub.url);
    }
}

async fn handle_prime(query: Option<String>) {
    let db = Database::open().expect("Failed to open database");
    let subs = db.get_subscriptions();
    if subs.is_empty() {
        println!("No subscriptions yet. Use --add <url> to add one.");
        return;
    }

    let channels_to_prime: Vec<&db::Subscription> = match query {
        Some(ref q) if !q.is_empty() => {
            // Try as index first
            if let Ok(idx) = q.parse::<usize>() {
                if idx >= 1 && idx <= subs.len() {
                    vec![&subs[idx - 1]]
                } else {
                    eprintln!("Invalid index: {}", idx);
                    std::process::exit(1);
                }
            } else {
                let search = q.to_lowercase();
                let matches: Vec<&db::Subscription> = subs
                    .iter()
                    .filter(|s| s.name.to_lowercase().contains(&search))
                    .collect();
                if matches.is_empty() {
                    eprintln!("No channel found matching \"{}\"", q);
                    std::process::exit(1);
                }
                if matches.len() > 1 {
                    println!("Multiple channels match \"{}\":", q);
                    for (i, m) in matches.iter().enumerate() {
                        println!("  {}. {}", i + 1, m.name);
                    }
                    println!("\nBe more specific or use the index number.");
                    std::process::exit(1);
                }
                matches
            }
        }
        _ => subs.iter().collect(),
    };

    let total_channels = channels_to_prime.len();
    println!("Priming {} channel(s) with full history...\n", total_channels);

    // Gather existing IDs and channel data up front (only skip videos that already have duration)
    let channel_data: Vec<(String, String, String, HashSet<String>)> = channels_to_prime
        .iter()
        .map(|ch| {
            let existing = db.get_stored_videos(&ch.id);
            let existing_ids: HashSet<String> = existing.iter().filter(|v| v.duration.is_some()).map(|v| v.id.clone()).collect();
            (ch.id.clone(), ch.name.clone(), ch.url.clone(), existing_ids)
        })
        .collect();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(String, Result<ytdlp::PrimeResult, String>)>();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(5));

    for (ch_id, ch_name, ch_url, existing_ids) in channel_data {
        let tx = tx.clone();
        let sem = semaphore.clone();
        let name = ch_name.clone();
        tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            let result = ytdlp::prime_channel(
                &ch_id,
                &ch_name,
                &ch_url,
                &existing_ids,
                |_| {},
            )
            .await;
            let _ = tx.send((name, result));
        });
    }
    drop(tx);

    let mut completed = 0usize;
    let mut total_added = 0usize;
    let mut failures = 0usize;

    while let Some((name, result)) = rx.recv().await {
        completed += 1;
        match result {
            Ok(r) => {
                if !r.videos.is_empty() {
                    db.store_videos(&r.videos);
                }
                println!(
                    "[{}/{}] {}: {} new videos ({} total, {} cached)",
                    completed, total_channels, name, r.added, r.total, r.skipped
                );
                total_added += r.added;
            }
            Err(e) => {
                println!("[{}/{}] {}: failed - {}", completed, total_channels, name, e);
                failures += 1;
            }
        }
    }

    let fail_info = if failures > 0 { format!(", {} failed", failures) } else { String::new() };
    println!("\nDone! {} videos added{}", total_added, fail_info);
}

// ── TUI Event Loop ─────────────────────────────────────────

async fn run_tui(initial_channel: Option<db::Subscription>) -> Result<(), Box<dyn std::error::Error>> {
    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(EnableMouseCapture)?;

    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend)?;

    let db = Database::open()?;
    let mut app = if let Some(channel) = initial_channel {
        App::with_initial_channel(db, channel)
    } else {
        App::new(db)
    };

    // Initial load
    app.load_subscriptions();

    // Background refresh for channels screen
    let mut bg_refresh: Option<tokio::task::JoinHandle<Vec<db::Video>>> = None;
    if app.screen == Screen::Channels && !app.subscriptions.is_empty() {
        app.loading_message = "Checking for new videos...".to_string();

        let sub_pairs: Vec<(String, String)> = app
            .subscriptions
            .iter()
            .map(|s| (s.id.clone(), s.name.clone()))
            .collect();

        bg_refresh = Some(tokio::spawn(async move {
            ytdlp::refresh_all_videos(&sub_pairs).await
        }));
    }

    // If starting on videos screen, load videos
    if app.screen == Screen::Videos {
        load_videos_for_screen(&mut app).await;
    }

    // Main event loop
    loop {
        // Check if background refresh completed
        if let Some(ref handle) = bg_refresh {
            if handle.is_finished() {
                if let Some(handle) = bg_refresh.take() {
                    if let Ok(fresh) = handle.await {
                        app.db.store_videos(&fresh);
                        app.refresh_counts();
                        app.has_checked_for_new = true;
                    }
                    app.loading_message.clear();
                }
            }
        }

        app.clear_expired_messages();
        terminal.draw(|f| ui::draw(f, &app))?;

        if event::poll(Duration::from_millis(100))? {
            match event::read()? {
                Event::Key(key) if key.kind == KeyEventKind::Press => {
                    if handle_key_event(&mut app, key.code, &mut terminal).await? {
                        break;
                    }
                }
                Event::Mouse(mouse) => {
                    handle_mouse_event(&mut app, mouse);
                }
                _ => {}
            }
        }
    }

    // Cleanup
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;
    io::stdout().execute(DisableMouseCapture)?;
    terminal.show_cursor()?;

    Ok(())
}

// ── Key Event Handler ──────────────────────────────────────

async fn handle_key_event(
    app: &mut App,
    key: KeyCode,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> Result<bool, Box<dyn std::error::Error>> {
    if app.playing {
        return Ok(false);
    }

    // Filter mode input handling
    if app.mode == Mode::Filter {
        match key {
            KeyCode::Esc => {
                app.mode = Mode::List;
                app.filter_text.clear();
                app.reset_scroll();
            }
            KeyCode::Enter => {
                app.mode = Mode::List;
            }
            KeyCode::Backspace => {
                app.filter_text.pop();
                app.reset_scroll();
            }
            KeyCode::Char(c) => {
                app.filter_text.push(c);
                app.reset_scroll();
            }
            _ => {}
        }
        return Ok(false);
    }

    // Input mode handling (Add, GlobalSearch, NewSearch)
    if matches!(app.mode, Mode::Add | Mode::GlobalSearch | Mode::NewSearch) {
        match key {
            KeyCode::Esc => {
                app.mode = Mode::List;
                app.input_clear();
            }
            KeyCode::Enter => {
                let text = app.input_text.clone();
                let text = text.trim().to_string();
                if !text.is_empty() {
                    match app.mode {
                        Mode::Add => {
                            handle_add_channel(app, &text, terminal).await;
                        }
                        Mode::GlobalSearch => {
                            app.input_clear();
                            app.mode = Mode::List;
                            handle_global_search(app, &text, terminal).await;
                        }
                        Mode::NewSearch => {
                            app.input_clear();
                            app.mode = Mode::List;
                            handle_global_search(app, &text, terminal).await;
                        }
                        _ => {}
                    }
                } else {
                    app.mode = Mode::List;
                    app.input_clear();
                }
            }
            KeyCode::Backspace => {
                app.input_backspace();
            }
            KeyCode::Char(c) => {
                app.input_insert(c);
            }
            _ => {}
        }
        return Ok(false);
    }

    // Confirm mode handling
    match app.mode {
        Mode::ConfirmDelete => {
            match key {
                KeyCode::Char('y') | KeyCode::Char('Y') => {
                    handle_delete_channel(app);
                }
                _ => {
                    app.mode = Mode::List;
                }
            }
            return Ok(false);
        }
        Mode::ConfirmPrime => {
            match key {
                KeyCode::Char('n') | KeyCode::Char('N') => {
                    app.pending_channel = None;
                    app.mode = Mode::List;
                }
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    handle_prime_channel(app, terminal).await;
                }
                _ => {}
            }
            return Ok(false);
        }
        Mode::ConfirmPrimeAll => {
            match key {
                KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                    app.mode = Mode::List;
                }
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    handle_prime_all(app, terminal).await;
                }
                _ => {}
            }
            return Ok(false);
        }
        Mode::ConfirmMarkAll => {
            match key {
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    let ids: Vec<String> = app.subscriptions.iter().map(|s| s.id.clone()).collect();
                    app.db.mark_all_channels_viewed(&ids);
                    app.new_counts.clear();
                    app.set_message("Marked all channels as read");
                    app.mode = Mode::List;
                }
                _ => {
                    app.mode = Mode::List;
                }
            }
            return Ok(false);
        }
        Mode::ConfirmMarkAllVideos => {
            match key {
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    let ids: Vec<String> = app.videos.iter().map(|v| v.id.clone()).collect();
                    let count = app.db.mark_channel_all_watched(&ids);
                    app.refresh_watched();
                    app.set_message(&format!("Marked {} videos as watched", count));
                    app.mode = Mode::List;
                }
                _ => {
                    app.mode = Mode::List;
                }
            }
            return Ok(false);
        }
        Mode::ConfirmAddChannel => {
            match key {
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    handle_subscribe_from_search(app);
                }
                _ => {
                    app.mode = Mode::List;
                }
            }
            return Ok(false);
        }
        Mode::ConfirmChannelWatched => {
            match key {
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                    app.mark_channel_watched();
                    app.mode = Mode::List;
                }
                _ => {
                    app.mode = Mode::List;
                }
            }
            return Ok(false);
        }
        _ => {}
    }

    // Screen-specific key handling
    match app.screen {
        Screen::Channels => handle_channel_keys(app, key, terminal).await,
        Screen::Videos => handle_video_keys(app, key, terminal).await,
        Screen::Search => handle_search_keys(app, key, terminal).await,
    }
}

async fn handle_channel_keys(
    app: &mut App,
    key: KeyCode,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> Result<bool, Box<dyn std::error::Error>> {
    let filtered_len = app.filtered_subscriptions().len();
    let visible_count = terminal.size()?.height.saturating_sub(7) as usize;

    match key {
        KeyCode::Char('q') => return Ok(true),
        KeyCode::Esc | KeyCode::Char('b') => {
            if !app.filter_text.is_empty() {
                app.filter_text.clear();
                app.reset_scroll();
            }
        }
        KeyCode::Up | KeyCode::Char('k') => {
            app.move_up();
        }
        KeyCode::Down | KeyCode::Char('j') => {
            app.move_down(filtered_len, visible_count);
        }
        KeyCode::Enter => {
            if filtered_len > 0 {
                let filtered = app.filtered_subscriptions();
                let channel = filtered[app.channel_selected].clone();
                let idx = app.channel_selected;
                app.db.update_channel_last_viewed(&channel.id);
                app.new_counts.remove(&channel.id);
                app.navigate_to_videos(Some(channel), idx);
                load_videos_for_screen(app).await;
            }
        }
        KeyCode::Char('a') => {
            app.mode = Mode::Add;
            app.input_clear();
        }
        KeyCode::Char('g') => {
            app.mode = Mode::GlobalSearch;
            app.input_clear();
        }
        KeyCode::Char('/') => {
            app.mode = Mode::Filter;
            app.filter_text.clear();
        }
        KeyCode::Char('d') => {
            if filtered_len > 0 {
                app.mode = Mode::ConfirmDelete;
            }
        }
        KeyCode::Char('v') => {
            app.navigate_to_videos(None, app.channel_selected);
            load_videos_for_screen(app).await;
        }
        KeyCode::Char('r') => {
            if !app.subscriptions.is_empty() && !app.loading {
                handle_refresh(app, terminal).await;
            }
        }
        KeyCode::Char('s') => {
            app.toggle_shorts();
        }
        KeyCode::Char('w') => {
            if filtered_len > 0 {
                let filtered = app.filtered_subscriptions();
                if let Some(s) = filtered.get(app.channel_selected) {
                    let is_all_watched = app.fully_watched.contains(&s.id);
                    let has_new = app.new_counts.get(&s.id).copied().unwrap_or(0) > 0;
                    let has_upcoming = app.upcoming_counts.get(&s.id).copied().unwrap_or(0) > 0;
                    if !is_all_watched || has_new || has_upcoming {
                        app.mode = Mode::ConfirmChannelWatched;
                    }
                }
            }
        }
        KeyCode::Char('p') => {
            if !app.subscriptions.is_empty() {
                app.mode = Mode::ConfirmPrimeAll;
            }
        }
        KeyCode::Char('m') => {
            app.mode = Mode::ConfirmMarkAll;
        }
        _ => {}
    }
    Ok(false)
}

async fn handle_video_keys(
    app: &mut App,
    key: KeyCode,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> Result<bool, Box<dyn std::error::Error>> {
    let filtered_len = app.filtered_videos().len();
    let visible_count = terminal.size()?.height.saturating_sub(7) as usize;

    match key {
        KeyCode::Char('q') => return Ok(true),
        KeyCode::Esc | KeyCode::Char('b') => {
            if !app.filter_text.is_empty() {
                app.filter_text.clear();
                app.reset_scroll();
            } else {
                app.navigate_back();
            }
        }
        KeyCode::Up | KeyCode::Char('k') => {
            app.move_up();
        }
        KeyCode::Down | KeyCode::Char('j') => {
            app.move_down(filtered_len, visible_count);
        }
        KeyCode::Enter => {
            if !app.loading {
                handle_play_video(app).await;
            }
        }
        KeyCode::Char('/') => {
            app.mode = Mode::Filter;
            app.filter_text.clear();
        }
        KeyCode::Char('i') => {
            if app.show_description {
                app.show_description = false;
                app.description = None;
            } else if filtered_len > 0 {
                handle_fetch_description(app, terminal).await;
            }
        }
        KeyCode::Char('w') => {
            app.toggle_watched_current();
        }
        KeyCode::Char('m') => {
            if app.current_channel.is_some() && filtered_len > 0 {
                app.mode = Mode::ConfirmMarkAllVideos;
            }
        }
        KeyCode::Char('s') => {
            app.toggle_shorts();
            app.reset_scroll();
        }
        KeyCode::Char('n') => {
            if app.current_channel.is_none() && app.current_page < app.total_pages().saturating_sub(1) {
                app.current_page += 1;
                app.load_video_page();
            }
        }
        KeyCode::Char('p') => {
            if app.current_channel.is_none() && app.current_page > 0 {
                app.current_page -= 1;
                app.load_video_page();
            }
        }
        KeyCode::Char('r') => {
            if !app.loading {
                load_videos_for_screen(app).await;
            }
        }
        _ => {}
    }
    Ok(false)
}

async fn handle_search_keys(
    app: &mut App,
    key: KeyCode,
    _terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> Result<bool, Box<dyn std::error::Error>> {
    let results_len = app.filtered_videos().len();
    let visible_count = _terminal.size()?.height.saturating_sub(7) as usize;

    match key {
        KeyCode::Char('q') => return Ok(true),
        KeyCode::Esc | KeyCode::Char('b') => {
            app.navigate_back();
        }
        KeyCode::Up | KeyCode::Char('k') => {
            app.move_up();
        }
        KeyCode::Down | KeyCode::Char('j') => {
            app.move_down(results_len, visible_count);
        }
        KeyCode::Enter => {
            if !app.loading {
                handle_play_search_result(app).await;
            }
        }
        KeyCode::Char('g') => {
            app.mode = Mode::NewSearch;
            app.input_clear();
        }
        KeyCode::Char('a') => {
            if results_len > 0 {
                let filtered = app.filtered_videos();
                if let Some(video) = filtered.get(app.search_selected) {
                    if video.channel_id.is_some() {
                        app.mode = Mode::ConfirmAddChannel;
                    } else {
                        app.set_error("Cannot add channel - no channel ID available");
                    }
                }
            }
        }
        KeyCode::Char('i') => {
            if app.show_description {
                app.show_description = false;
                app.description = None;
            } else if results_len > 0 {
                handle_fetch_description_search(app, _terminal).await;
            }
        }
        _ => {}
    }
    Ok(false)
}

// ── Mouse Event Handler ────────────────────────────────────

fn handle_mouse_event(app: &mut App, mouse: crossterm::event::MouseEvent) {
    match mouse.kind {
        MouseEventKind::ScrollUp => {
            app.move_up();
        }
        MouseEventKind::ScrollDown => {
            let len = match app.screen {
                Screen::Channels => app.filtered_subscriptions().len(),
                Screen::Videos => app.filtered_videos().len(),
                Screen::Search => app.filtered_videos().len(),
            };
            // Use a reasonable visible count estimate
            app.move_down(len, 30);
        }
        MouseEventKind::Down(MouseButton::Left) => {
            // Calculate which row was clicked
            let row = mouse.row as usize;
            if row >= 3 {
                // After header
                let click_index = row - 3;
                let scroll = app.current_scroll();
                let target = scroll + click_index;
                let len = match app.screen {
                    Screen::Channels => app.filtered_subscriptions().len(),
                    Screen::Videos => app.filtered_videos().len(),
                    Screen::Search => app.filtered_videos().len(),
                };
                if target < len {
                    match app.screen {
                        Screen::Channels => app.channel_selected = target,
                        Screen::Videos => app.video_selected = target,
                        Screen::Search => app.search_selected = target,
                    }
                }
            }
        }
        _ => {}
    }
}

// ── Action Handlers ────────────────────────────────────────

async fn handle_add_channel(
    app: &mut App,
    url: &str,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    app.loading = true;
    app.loading_message = "Fetching channel info...".to_string();
    app.mode = Mode::List;
    terminal.draw(|f| ui::draw(f, app)).ok();

    match ytdlp::get_channel_info(url).await {
        Ok(info) => {
            let sub = db::Subscription {
                id: info.id.clone(),
                name: info.name.clone(),
                url: info.url.clone(),
                added_at: None,
            };
            match app.db.add_subscription(&sub) {
                Ok(()) => {
                    app.load_subscriptions();
                    app.set_message(&format!("Added: {}", info.name));
                    app.pending_channel = Some(info);
                    app.mode = Mode::ConfirmPrime;
                }
                Err(e) => {
                    app.set_error(&e);
                }
            }
        }
        Err(e) => {
            app.set_error(&e);
        }
    }

    app.loading = false;
    app.loading_message.clear();
    app.input_clear();
}

fn handle_delete_channel(app: &mut App) {
    let filtered = app.filtered_subscriptions();
    if let Some(sub) = filtered.get(app.channel_selected) {
        let id = sub.id.clone();
        let name = sub.name.clone();
        match app.db.remove_subscription(&id) {
            Ok(()) => {
                app.load_subscriptions();
                app.set_message(&format!("Removed: {}", name));
                let filtered_len = app.filtered_subscriptions().len();
                if app.channel_selected >= filtered_len && filtered_len > 0 {
                    app.channel_selected = filtered_len - 1;
                }
            }
            Err(e) => {
                app.set_error(&e);
            }
        }
    }
    app.mode = Mode::List;
}

async fn handle_prime_channel(
    app: &mut App,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    if let Some(ref channel) = app.pending_channel.clone() {
        app.loading = true;
        app.loading_message = format!("Priming {}...", channel.name);
        terminal.draw(|f| ui::draw(f, app)).ok();

        let existing = app.db.get_stored_videos(&channel.id);
        let existing_ids: HashSet<String> = existing.iter().filter(|v| v.duration.is_some()).map(|v| v.id.clone()).collect();

        let name = channel.name.clone();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ytdlp::PrimeProgress>();

        let ch_id = channel.id.clone();
        let ch_name = channel.name.clone();
        let ch_url = channel.url.clone();

        let handle = tokio::spawn(async move {
            ytdlp::prime_channel(
                &ch_id,
                &ch_name,
                &ch_url,
                &existing_ids,
                move |p| {
                    let _ = tx.send(p);
                },
            )
            .await
        });

        // Poll for progress
        loop {
            while let Ok(p) = rx.try_recv() {
                app.loading_message = format!(
                    "Priming {}: scanned {} | {} new",
                    name, p.scanned, p.new
                );
            }
            terminal.draw(|f| ui::draw(f, app)).ok();

            if handle.is_finished() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        match handle.await {
            Ok(Ok(result)) => {
                if !result.videos.is_empty() {
                    app.db.store_videos(&result.videos);
                }
                let skipped_info = if result.skipped > 0 {
                    format!(" ({} already cached)", result.skipped)
                } else {
                    String::new()
                };
                app.set_message(&format!(
                    "Primed {}: {} new videos added{}",
                    name, result.added, skipped_info
                ));
                app.refresh_counts();
            }
            Ok(Err(e)) => {
                app.set_error(&format!("Prime failed: {}", e));
            }
            Err(e) => {
                app.set_error(&format!("Prime task failed: {}", e));
            }
        }

        app.loading = false;
        app.loading_message.clear();
        app.pending_channel = None;
        app.mode = Mode::List;
    }
}

async fn handle_prime_all(
    app: &mut App,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    if app.subscriptions.is_empty() {
        return;
    }

    app.loading = true;
    app.mode = Mode::List;
    let subs: Vec<db::Subscription> = app.subscriptions.clone();
    let total_channels = subs.len();

    app.loading_message = format!("Priming 0/{}", total_channels);
    terminal.draw(|f| ui::draw(f, app)).ok();

    // Gather existing IDs per channel up front (only skip videos that already have duration)
    let channel_data: Vec<(String, String, String, HashSet<String>)> = subs
        .iter()
        .map(|ch| {
            let existing = app.db.get_stored_videos(&ch.id);
            let existing_ids: HashSet<String> = existing.iter().filter(|v| v.duration.is_some()).map(|v| v.id.clone()).collect();
            (ch.id.clone(), ch.name.clone(), ch.url.clone(), existing_ids)
        })
        .collect();

    // Channel for completed results
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Result<ytdlp::PrimeResult, String>>();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(5));

    for (ch_id, ch_name, ch_url, existing_ids) in channel_data {
        let tx = tx.clone();
        let sem = semaphore.clone();
        tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            let result = ytdlp::prime_channel(
                &ch_id,
                &ch_name,
                &ch_url,
                &existing_ids,
                |_| {},
            )
            .await;
            let _ = tx.send(result);
        });
    }
    drop(tx);

    let mut completed = 0usize;
    let mut total_added = 0usize;
    let mut total_skipped = 0usize;
    let mut failures = 0usize;

    loop {
        // Drain all available results
        let mut got_any = true;
        while got_any {
            match rx.try_recv() {
                Ok(Ok(result)) => {
                    completed += 1;
                    if !result.videos.is_empty() {
                        app.db.store_videos(&result.videos);
                    }
                    total_added += result.added;
                    total_skipped += result.skipped;
                    app.loading_message = format!("Priming {}/{}", completed, total_channels);
                }
                Ok(Err(_)) => {
                    completed += 1;
                    failures += 1;
                    app.loading_message = format!("Priming {}/{}", completed, total_channels);
                }
                Err(_) => {
                    got_any = false;
                }
            }
        }

        terminal.draw(|f| ui::draw(f, app)).ok();

        if completed >= total_channels {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    app.loading = false;
    app.loading_message.clear();
    app.refresh_counts();

    let fail_info = if failures > 0 {
        format!(", {} failed", failures)
    } else {
        String::new()
    };
    app.set_message(&format!(
        "Primed all: {} videos added ({} cached{})",
        total_added, total_skipped, fail_info
    ));
}

async fn handle_refresh(
    app: &mut App,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    app.loading = true;
    app.loading_message = "Checking for new videos...".to_string();
    terminal.draw(|f| ui::draw(f, app)).ok();

    let sub_pairs: Vec<(String, String)> = app
        .subscriptions
        .iter()
        .map(|s| (s.id.clone(), s.name.clone()))
        .collect();

    let fresh = ytdlp::refresh_all_videos(&sub_pairs).await;
    app.db.store_videos(&fresh);
    app.refresh_counts();
    app.loading = false;
    app.loading_message.clear();
    app.set_message("Refreshed");
}

async fn handle_global_search(
    app: &mut App,
    query: &str,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    app.navigate_to_search(query.to_string());
    app.loading = true;
    app.loading_message = "Searching...".to_string();
    terminal.draw(|f| ui::draw(f, app)).ok();

    match ytdlp::search_youtube(query, 50).await {
        Ok(results) => {
            app.search_results = results;
            app.refresh_watched();
        }
        Err(e) => {
            app.set_error(&e);
        }
    }

    app.loading = false;
    app.loading_message.clear();
}

async fn handle_play_video(app: &mut App) {
    let filtered = app.filtered_videos();
    if filtered.is_empty() {
        return;
    }
    let selected = app.video_selected;
    if let Some(video) = filtered.get(selected) {
        let url = video.url.clone();
        let id = video.id.clone();
        let title = video.title.clone();

        // Mark as watched BEFORE launching player (matching JS behavior)
        app.db.mark_as_watched(&id);
        app.refresh_watched();

        app.playing = true;
        app.set_message(&format!("Opening: {}", title));

        let (result, _video_id) =
            player::play_video(&url, Some(&id), &app.settings.player).await;

        if result.success {
            app.set_message(&format!("Playing in {}", result.player));
        } else if let Some(err) = result.error {
            app.set_error(&format!("Failed to play: {}", err));
        }

        app.playing = false;
    }
}

async fn handle_play_search_result(app: &mut App) {
    let filtered = app.filtered_videos();
    if filtered.is_empty() {
        return;
    }
    let selected = app.search_selected;
    if let Some(video) = filtered.get(selected) {
        let url = video.url.clone();
        let id = video.id.clone();
        let title = video.title.clone();

        // Mark as watched BEFORE launching player (matching JS behavior)
        app.db.mark_as_watched(&id);
        app.refresh_watched();

        app.playing = true;
        app.set_message(&format!("Opening: {}", title));

        let (result, _video_id) =
            player::play_video(&url, Some(&id), &app.settings.player).await;

        if result.success {
            app.set_message(&format!("Playing in {}", result.player));
        } else if let Some(err) = result.error {
            app.set_error(&format!("Failed to play: {}", err));
        }

        app.playing = false;
    }
}

async fn handle_fetch_description(
    app: &mut App,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    let filtered = app.filtered_videos();
    if filtered.is_empty() {
        return;
    }
    let video = filtered[app.video_selected];
    let video_id = video.id.clone();
    let video_title = video.title.clone();
    let ch_name = video.channel_name.clone().unwrap_or_default();

    app.show_description = true;
    app.loading_description = true;
    app.description = None;
    terminal.draw(|f| ui::draw(f, app)).ok();

    match ytdlp::get_video_description(&video_id).await {
        Ok(desc) => {
            app.description = Some(desc);
        }
        Err(e) => {
            app.description = Some(ytdlp::VideoDescription {
                title: video_title,
                description: format!("Error: {}", e),
                channel_name: ch_name,
            });
        }
    }
    app.loading_description = false;
}

async fn handle_fetch_description_search(
    app: &mut App,
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) {
    let filtered = app.filtered_videos();
    if filtered.is_empty() {
        return;
    }
    let video = filtered[app.search_selected];
    let video_id = video.id.clone();
    let video_title = video.title.clone();
    let ch_name = video.channel_name.clone().unwrap_or_default();

    app.show_description = true;
    app.loading_description = true;
    app.description = None;
    terminal.draw(|f| ui::draw(f, app)).ok();

    match ytdlp::get_video_description(&video_id).await {
        Ok(desc) => {
            app.description = Some(desc);
        }
        Err(e) => {
            app.description = Some(ytdlp::VideoDescription {
                title: video_title,
                description: format!("Error: {}", e),
                channel_name: ch_name,
            });
        }
    }
    app.loading_description = false;
}

fn handle_subscribe_from_search(app: &mut App) {
    let filtered = app.filtered_videos();
    if let Some(video) = filtered.get(app.search_selected) {
        if let Some(ref channel_id) = video.channel_id {
            let subs = app.db.get_subscriptions();
            if subs.iter().any(|s| s.id == *channel_id) {
                let name = video.channel_name.as_deref().unwrap_or("?");
                app.set_message(&format!("Already subscribed to {}", name));
            } else {
                let sub = db::Subscription {
                    id: channel_id.clone(),
                    name: video
                        .channel_name
                        .as_deref()
                        .unwrap_or("Unknown")
                        .to_string(),
                    url: format!("https://www.youtube.com/channel/{}", channel_id),
                    added_at: None,
                };
                match app.db.add_subscription(&sub) {
                    Ok(()) => {
                        app.load_subscriptions();
                        app.set_message(&format!("Added: {}", sub.name));
                    }
                    Err(e) => {
                        app.set_error(&e);
                    }
                }
            }
        }
    }
    app.mode = Mode::List;
}

async fn load_videos_for_screen(app: &mut App) {
    app.loading = true;
    app.loading_message = "Refreshing...".to_string();

    if let Some(ref channel) = app.current_channel.clone() {
        // Single channel view
        let fresh = ytdlp::get_channel_videos(&channel.id, &channel.name).await;
        app.db.store_videos(&fresh);

        let stored = app.db.get_stored_videos(&channel.id);
        // Merge: stored + fresh, deduplicated (prefer stored to preserve DB metadata)
        let mut video_map: std::collections::HashMap<String, db::Video> = std::collections::HashMap::new();
        for v in stored {
            video_map.insert(v.id.clone(), v);
        }
        for v in fresh {
            video_map.entry(v.id.clone()).or_insert(v);
        }
        let mut videos: Vec<db::Video> = video_map.into_values().collect();
        videos.sort_by(|a, b| {
            b.published_date
                .unwrap_or(chrono::DateTime::UNIX_EPOCH)
                .cmp(&a.published_date.unwrap_or(chrono::DateTime::UNIX_EPOCH))
        });
        app.videos = videos;
        app.total_videos = app.videos.len();
    } else {
        // All videos view
        let subs = app.db.get_subscriptions();
        if subs.is_empty() {
            app.videos.clear();
            app.total_videos = 0;
        } else {
            let sub_pairs: Vec<(String, String)> =
                subs.iter().map(|s| (s.id.clone(), s.name.clone())).collect();
            let fresh = ytdlp::refresh_all_videos(&sub_pairs).await;
            app.db.store_videos(&fresh);

            app.all_channel_ids = subs.iter().map(|s| s.id.clone()).collect();
            let result = app.db.get_stored_videos_paginated(
                Some(&app.all_channel_ids),
                0,
                100,
            );
            app.videos = result.videos;
            app.total_videos = result.total;
            app.page_size = result.page_size;
            app.current_page = 0;
        }
    }

    app.refresh_watched();
    app.video_selected = 0;
    app.video_scroll = 0;
    app.loading = false;
    app.loading_message.clear();
}

// ── Main ───────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    if let Some(ref url) = cli.add {
        handle_add(url).await;
        return Ok(());
    }

    if cli.list {
        handle_list();
        return Ok(());
    }

    if let Some(ref prime_arg) = cli.prime {
        handle_prime(prime_arg.clone()).await;
        return Ok(());
    }

    let initial_channel = if let Some(index) = cli.channel {
        let db = Database::open()?;
        let subs = db.get_subscriptions();
        let idx = index.saturating_sub(1);
        if idx >= subs.len() {
            eprintln!(
                "Invalid channel index. You have {} subscription(s).",
                subs.len()
            );
            std::process::exit(1);
        }
        Some(subs[idx].clone())
    } else {
        None
    };

    run_tui(initial_channel).await
}
