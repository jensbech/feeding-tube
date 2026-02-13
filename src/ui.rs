use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Row, Scrollbar, ScrollbarOrientation, ScrollbarState, Table, Wrap};
use ratatui::Frame;

use crate::app::{App, Mode, Screen};
use crate::db::{format_views, Video};

// ── Color Palette (mindful-jira inspired) ──────────────────

const ZEBRA_DARK: Color = Color::Rgb(30, 30, 40);
const HIGHLIGHT_BG: Color = Color::Rgb(55, 55, 80);
const DIM_FG: Color = Color::Rgb(100, 100, 110);
const ACCENT: Color = Color::Rgb(180, 180, 255);
const CYAN: Color = Color::Rgb(100, 200, 255);
const YELLOW: Color = Color::Rgb(230, 200, 80);
const GREEN: Color = Color::Rgb(99, 186, 60);
const RED: Color = Color::Rgb(229, 73, 58);
const MAGENTA: Color = Color::Rgb(200, 120, 220);
const GRAY: Color = Color::Rgb(120, 120, 140);
const DARK_GRAY: Color = Color::Rgb(70, 70, 85);
const LIGHT_GRAY: Color = Color::Rgb(200, 200, 210);
const BODY_BG: Color = Color::Rgb(18, 18, 28);
const STATUS_BAR_BG: Color = Color::Rgb(30, 30, 50);

// ── Main Draw ──────────────────────────────────────────────

pub fn draw(f: &mut Frame, app: &App) {
    let area = f.area();

    // Fill background
    f.render_widget(
        Block::default().style(Style::default().bg(BODY_BG)),
        area,
    );

    let chunks = Layout::vertical([
        Constraint::Length(3),  // Header
        Constraint::Min(3),    // Content
        Constraint::Length(2), // Status bar
    ])
    .split(area);

    draw_header(f, app, chunks[0]);

    match app.screen {
        Screen::Channels => draw_channel_list(f, app, chunks[1]),
        Screen::Videos => draw_video_list(f, app, chunks[1]),
        Screen::Search => draw_search_results(f, app, chunks[1]),
    }

    draw_status_bar(f, app, chunks[2]);

    // Modal overlays
    if app.show_description {
        dim_background(f);
        draw_description_panel(f, app);
    }

    match app.mode {
        Mode::Add | Mode::GlobalSearch | Mode::NewSearch => {
            draw_input_overlay(f, app);
        }
        Mode::ConfirmDelete
        | Mode::ConfirmPrime
        | Mode::ConfirmPrimeAll
        | Mode::ConfirmMarkAll
        | Mode::ConfirmMarkAllVideos
        | Mode::ConfirmAddChannel => {
            draw_confirm_overlay(f, app);
        }
        _ => {}
    }
}

// ── Header ─────────────────────────────────────────────────

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::vertical([Constraint::Length(2), Constraint::Length(1)]).split(area);

    let mut spans = vec![
        Span::styled(
            "youtube-cli",
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        ),
    ];

    let title = match app.screen {
        Screen::Channels => "Channels".to_string(),
        Screen::Videos => {
            if let Some(ref ch) = app.current_channel {
                ch.name.clone()
            } else {
                "All Videos".to_string()
            }
        }
        Screen::Search => "Search YouTube".to_string(),
    };

    spans.push(Span::styled(" - ", Style::default().fg(GRAY)));
    spans.push(Span::styled(
        title,
        Style::default().fg(LIGHT_GRAY).add_modifier(Modifier::BOLD),
    ));

    // Subtitle
    let subtitle = build_subtitle(app);
    if !subtitle.is_empty() {
        spans.push(Span::styled(
            format!(" ({})", subtitle),
            Style::default().fg(GRAY),
        ));
    }

    // Shorts indicator
    spans.push(Span::styled(" │ ", Style::default().fg(DARK_GRAY)));
    if app.hide_shorts {
        spans.push(Span::styled(
            "shorts hidden",
            Style::default().fg(YELLOW),
        ));
    } else {
        spans.push(Span::styled(
            "shorts shown",
            Style::default().fg(GRAY),
        ));
    }

    // Loading indicator
    if app.loading {
        spans.push(Span::styled(" │ ", Style::default().fg(DARK_GRAY)));
        spans.push(Span::styled("⟳ ", Style::default().fg(CYAN)));
        if !app.loading_message.is_empty() {
            spans.push(Span::styled(
                &app.loading_message,
                Style::default().fg(GREEN),
            ));
        }
    }

    let header_line = Line::from(spans);
    f.render_widget(
        Paragraph::new(header_line).style(Style::default().bg(BODY_BG)),
        chunks[0],
    );

    // Separator line
    let sep = "─".repeat(area.width as usize);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(&sep, Style::default().fg(DARK_GRAY)))),
        chunks[1],
    );
}

fn build_subtitle(app: &App) -> String {
    match app.screen {
        Screen::Channels => {
            let count = app.subscriptions.len();
            let filter_info = if app.filter_text.is_empty() {
                String::new()
            } else {
                format!(" filter: \"{}\"", app.filter_text)
            };
            format!(
                "{} subscription{}{}",
                count,
                if count != 1 { "s" } else { "" },
                filter_info
            )
        }
        Screen::Videos => {
            let filtered = app.filtered_videos();
            let count = filtered.len();
            let filter_info = if app.filter_text.is_empty() {
                String::new()
            } else {
                format!(" filter: \"{}\"", app.filter_text)
            };
            let page_info = if app.current_channel.is_none() && app.total_pages() > 1 {
                format!(" [{}/{}]", app.current_page + 1, app.total_pages())
            } else {
                String::new()
            };
            format!(
                "{} video{}{}{}",
                count,
                if count != 1 { "s" } else { "" },
                filter_info,
                page_info
            )
        }
        Screen::Search => {
            if app.loading {
                String::new()
            } else {
                let count = app.search_results.len();
                format!(
                    "{} result{} for \"{}\"",
                    count,
                    if count != 1 { "s" } else { "" },
                    app.search_query
                )
            }
        }
    }
}

// ── Channel List ───────────────────────────────────────────

fn draw_channel_list(f: &mut Frame, app: &App, area: Rect) {
    let filtered = app.filtered_subscriptions();

    if app.subscriptions.is_empty() {
        let empty = Paragraph::new(vec![
            Line::from(Span::styled("No subscriptions yet.", Style::default().fg(GRAY))),
            Line::from(Span::styled(
                "Press (a) to add a channel.",
                Style::default().fg(GRAY),
            )),
        ])
        .style(Style::default().bg(BODY_BG));
        f.render_widget(empty, area);
        return;
    }

    if filtered.is_empty() {
        let empty = Paragraph::new(Line::from(Span::styled(
            "No channels match filter.",
            Style::default().fg(GRAY),
        )))
        .style(Style::default().bg(BODY_BG));
        f.render_widget(empty, area);
        return;
    }

    let visible_count = area.height as usize;
    let scroll = app.channel_scroll;
    let selected = app.channel_selected;

    let rows: Vec<Row> = filtered
        .iter()
        .enumerate()
        .skip(scroll)
        .take(visible_count)
        .map(|(i, sub)| {
            let is_selected = i == selected;
            let has_new = app.new_counts.get(&sub.id).copied().unwrap_or(0) > 0;
            let is_fully_watched = app.fully_watched.contains(&sub.id);

            let pointer = if is_selected { "▶ " } else { "  " };

            let mut spans = vec![
                Span::styled(
                    pointer,
                    Style::default().fg(if is_selected { ACCENT } else { BODY_BG }),
                ),
                Span::styled(
                    &sub.name,
                    if is_selected {
                        Style::default().fg(CYAN).add_modifier(Modifier::BOLD)
                    } else if is_fully_watched {
                        Style::default().fg(DIM_FG)
                    } else {
                        Style::default().fg(LIGHT_GRAY)
                    },
                ),
            ];

            if has_new {
                let count = app.new_counts.get(&sub.id).copied().unwrap_or(0);
                spans.push(Span::styled(
                    format!(" ● {}", count),
                    Style::default().fg(GREEN),
                ));
            }

            let bg = if is_selected {
                HIGHLIGHT_BG
            } else if i % 2 == 0 {
                BODY_BG
            } else {
                ZEBRA_DARK
            };

            Row::new(vec![ratatui::widgets::Cell::from(Line::from(spans))])
                .style(Style::default().bg(bg))
        })
        .collect();

    let table = Table::new(rows, [Constraint::Percentage(100)])
        .style(Style::default().bg(BODY_BG));

    f.render_widget(table, area);

    // Scrollbar
    if filtered.len() > visible_count {
        let mut scrollbar_state = ScrollbarState::new(filtered.len())
            .position(scroll);
        f.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .thumb_style(Style::default().fg(ACCENT))
                .track_style(Style::default().fg(DARK_GRAY)),
            area,
            &mut scrollbar_state,
        );
    }
}

// ── Video List ─────────────────────────────────────────────

fn draw_video_list(f: &mut Frame, app: &App, area: Rect) {
    let filtered = app.filtered_videos();

    if filtered.is_empty() {
        let msg = if app.loading {
            ""
        } else {
            "No videos found."
        };
        let empty = Paragraph::new(Line::from(Span::styled(
            msg,
            Style::default().fg(GRAY),
        )))
        .style(Style::default().bg(BODY_BG));
        f.render_widget(empty, area);
        return;
    }

    let show_channel = app.current_channel.is_none();
    draw_video_table(f, app, area, &filtered, show_channel, app.video_selected, app.video_scroll);
}

// ── Search Results ─────────────────────────────────────────

fn draw_search_results(f: &mut Frame, app: &App, area: Rect) {
    let filtered = app.filtered_videos();

    if filtered.is_empty() && !app.loading {
        let msg = if app.search_results.is_empty() {
            "No results found."
        } else {
            "No videos match filter."
        };
        let empty = Paragraph::new(Line::from(Span::styled(
            msg,
            Style::default().fg(GRAY),
        )))
        .style(Style::default().bg(BODY_BG));
        f.render_widget(empty, area);
        return;
    }

    draw_video_table(f, app, area, &filtered, true, app.search_selected, app.search_scroll);
}

// ── Shared Video Table ─────────────────────────────────────

fn draw_video_table(
    f: &mut Frame,
    app: &App,
    area: Rect,
    videos: &[&Video],
    show_channel: bool,
    selected: usize,
    scroll: usize,
) {
    let width = area.width as usize;
    let visible_count = area.height as usize;

    let channel_col = if show_channel { 32.min(width / 3) } else { 0 };
    let date_col = 8;
    let is_search = app.screen == Screen::Search;
    let duration_col = if is_search { 8 } else { 0 };
    let views_col = if is_search { 8 } else { 0 };
    let indicator_col = 2;
    let pointer_col = 3;
    let title_col = width
        .saturating_sub(pointer_col + channel_col + date_col + duration_col + views_col + indicator_col + 2);

    let rows: Vec<Row> = videos
        .iter()
        .enumerate()
        .skip(scroll)
        .take(visible_count)
        .map(|(i, video)| {
            let is_selected = i == selected;
            let is_watched = app.watched_ids.contains(&video.id);

            let pointer = if is_selected { "▶ " } else { "  " };

            let mut cells: Vec<ratatui::widgets::Cell> = Vec::new();

            // Pointer
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pointer,
                Style::default().fg(if is_selected { ACCENT } else { BODY_BG }),
            )));

            // Channel name
            if show_channel {
                let ch_name = video
                    .channel_name
                    .as_deref()
                    .unwrap_or("");
                let ch_display = truncate_str(ch_name, channel_col.saturating_sub(1));
                cells.push(ratatui::widgets::Cell::from(Span::styled(
                    pad_str(&ch_display, channel_col),
                    if is_selected {
                        Style::default().fg(CYAN)
                    } else if is_watched {
                        Style::default().fg(DIM_FG)
                    } else {
                        Style::default().fg(YELLOW)
                    },
                )));
            }

            // Title
            let title_display = truncate_str(&video.title, title_col.saturating_sub(1));
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pad_str(&title_display, title_col),
                if is_selected {
                    Style::default().fg(CYAN).add_modifier(Modifier::BOLD)
                } else if is_watched {
                    Style::default().fg(DIM_FG)
                } else {
                    Style::default().fg(LIGHT_GRAY)
                },
            )));

            // Duration (search only)
            if is_search {
                let dur = video
                    .duration_string
                    .as_deref()
                    .unwrap_or("--:--");
                cells.push(ratatui::widgets::Cell::from(Span::styled(
                    pad_str(dur, duration_col),
                    Style::default().fg(if is_selected { CYAN } else { GRAY }),
                )));
            }

            // Views (search only)
            if is_search {
                let views = format_views(video.view_count);
                cells.push(ratatui::widgets::Cell::from(Span::styled(
                    pad_str(&views, views_col),
                    Style::default().fg(if is_selected { CYAN } else { MAGENTA }),
                )));
            }

            // Date
            let date_display = &video.relative_date;
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pad_str(date_display, date_col),
                Style::default().fg(if is_selected { CYAN } else { GRAY }),
            )));

            // Unwatched indicator
            let indicator = if !is_watched { "●" } else { " " };
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                indicator,
                Style::default().fg(GREEN),
            )));

            let bg = if is_selected {
                HIGHLIGHT_BG
            } else if i % 2 == 0 {
                BODY_BG
            } else {
                ZEBRA_DARK
            };

            Row::new(cells).style(Style::default().bg(bg))
        })
        .collect();

    let mut widths: Vec<Constraint> = vec![Constraint::Length(pointer_col as u16)];
    if show_channel {
        widths.push(Constraint::Length(channel_col as u16));
    }
    widths.push(Constraint::Length(title_col as u16));
    if is_search {
        widths.push(Constraint::Length(duration_col as u16));
        widths.push(Constraint::Length(views_col as u16));
    }
    widths.push(Constraint::Length(date_col as u16));
    widths.push(Constraint::Length(indicator_col as u16));

    let table = Table::new(rows, widths)
        .style(Style::default().bg(BODY_BG));

    f.render_widget(table, area);

    // Scrollbar
    if videos.len() > visible_count {
        let mut scrollbar_state = ScrollbarState::new(videos.len())
            .position(scroll);
        f.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .thumb_style(Style::default().fg(ACCENT))
                .track_style(Style::default().fg(DARK_GRAY)),
            area,
            &mut scrollbar_state,
        );
    }
}

// ── Status Bar ─────────────────────────────────────────────

fn draw_status_bar(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).split(area);

    // Separator
    let sep = "─".repeat(area.width as usize);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(&sep, Style::default().fg(DARK_GRAY)))),
        chunks[0],
    );

    // Status content
    let mut spans: Vec<Span> = Vec::new();

    // Mode indicator
    let (mode_label, mode_bg) = match app.mode {
        Mode::Filter => ("FILTER", Color::Rgb(180, 130, 50)),
        Mode::Add => ("ADD", Color::Rgb(60, 140, 60)),
        Mode::GlobalSearch | Mode::NewSearch => ("SEARCH", Color::Rgb(60, 140, 60)),
        Mode::Description => ("INFO", Color::Rgb(80, 120, 180)),
        _ => match app.screen {
            Screen::Channels => ("CHANNELS", Color::Rgb(60, 60, 120)),
            Screen::Videos => ("VIDEOS", Color::Rgb(60, 60, 120)),
            Screen::Search => ("SEARCH", Color::Rgb(80, 120, 180)),
        },
    };
    spans.push(Span::styled(
        format!(" {} ", mode_label),
        Style::default()
            .fg(Color::White)
            .bg(mode_bg)
            .add_modifier(Modifier::BOLD),
    ));
    spans.push(Span::raw(" "));

    // Filter mode display
    if app.mode == Mode::Filter {
        spans.push(Span::styled("Filter: ", Style::default().fg(YELLOW)));
        spans.push(Span::styled(&app.filter_text, Style::default().fg(LIGHT_GRAY)));
        spans.push(Span::styled("│", Style::default().fg(ACCENT)));
        spans.push(Span::styled(
            "  Enter:confirm  Esc:cancel",
            Style::default().fg(GRAY),
        ));
    } else if app.show_description {
        spans.push(key_hint("i", "close info"));
    } else {
        // Key hints based on screen and mode
        match app.screen {
            Screen::Channels => {
                if app.mode == Mode::List {
                    spans.push(key_hint("a", "dd"));
                    if !app.subscriptions.is_empty() {
                        spans.push(key_hint("d", "elete"));
                        spans.push(key_hint("w", "atched"));
                        spans.push(key_hint("p", "rime all"));
                    }
                    spans.push(key_hint("v", "iew all"));
                    spans.push(key_hint("g", "lobal"));
                    spans.push(key_hint("/", "filter"));
                    spans.push(key_hint(
                        "s",
                        if app.hide_shorts { "+shorts" } else { "-shorts" },
                    ));
                    spans.push(key_hint("r", "efresh"));
                    spans.push(key_hint("m", "ark all"));
                    spans.push(key_hint("q", "uit"));
                }
            }
            Screen::Videos => {
                if app.mode == Mode::List {
                    spans.push(key_hint("Enter", "play"));
                    spans.push(key_hint("i", "nfo"));
                    spans.push(key_hint("w", "atched"));
                    if app.current_channel.is_some() {
                        spans.push(key_hint("m", "ark all"));
                    }
                    spans.push(key_hint("/", "filter"));
                    spans.push(key_hint(
                        "s",
                        if app.hide_shorts { "+shorts" } else { "-shorts" },
                    ));
                    if app.current_channel.is_none() && app.total_pages() > 1 {
                        spans.push(key_hint("n", "ext"));
                        spans.push(key_hint("p", "rev"));
                    }
                    spans.push(key_hint("r", "efresh"));
                    spans.push(key_hint("b", "ack"));
                    spans.push(key_hint("q", "uit"));
                }
            }
            Screen::Search => {
                if app.mode == Mode::List {
                    spans.push(key_hint("Enter", "play"));
                    spans.push(key_hint("i", "nfo"));
                    spans.push(key_hint("a", "dd channel"));
                    spans.push(key_hint("g", "new search"));
                    spans.push(key_hint("b", "ack"));
                    spans.push(key_hint("q", "uit"));
                }
            }
        }
    }

    // Status message
    if let Some(ref msg) = app.status_message {
        spans.push(Span::styled(" │ ", Style::default().fg(DARK_GRAY)));
        let color = if msg.is_error { RED } else { GREEN };
        spans.push(Span::styled(&msg.text, Style::default().fg(color)));
    }

    let status_line = Line::from(spans);
    f.render_widget(
        Paragraph::new(status_line).style(Style::default().bg(STATUS_BAR_BG)),
        chunks[1],
    );
}

fn key_hint<'a>(key: &'a str, desc: &'a str) -> Span<'a> {
    // We'll return a styled span with the key hint format
    // For proper styling we need multiple spans, but as a single Span we'll
    // use a consistent format
    Span::styled(
        format!("({}){} ", key, desc),
        Style::default().fg(GRAY),
    )
}

// ── Input Overlay ──────────────────────────────────────────

fn draw_input_overlay(f: &mut Frame, app: &App) {
    let area = f.area();
    let width = 60.min(area.width.saturating_sub(4));
    let height = 4;
    let x = (area.width.saturating_sub(width)) / 2;
    let y = area.height / 3;
    let modal_area = Rect::new(x, y, width, height);

    f.render_widget(Clear, modal_area);

    let (title, placeholder) = match app.mode {
        Mode::Add => ("Add Channel", "https://youtube.com/@channel"),
        Mode::GlobalSearch => ("Search YouTube", "enter search query"),
        Mode::NewSearch => ("New Search", "enter search query"),
        _ => ("Input", ""),
    };

    let display_text = if app.input_text.is_empty() {
        placeholder.to_string()
    } else {
        app.input_text.clone()
    };

    let text_style = if app.input_text.is_empty() {
        Style::default().fg(DIM_FG)
    } else {
        Style::default().fg(LIGHT_GRAY)
    };

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ACCENT))
        .title(Span::styled(
            format!(" {} ", title),
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        ))
        .style(Style::default().bg(BODY_BG));

    let content = vec![
        Line::from(Span::styled(display_text, text_style)),
        Line::from(Span::styled(
            "Esc:cancel  Enter:submit",
            Style::default().fg(GRAY),
        )),
    ];

    let paragraph = Paragraph::new(content).block(block);
    f.render_widget(paragraph, modal_area);
}

// ── Confirm Overlay ────────────────────────────────────────

fn draw_confirm_overlay(f: &mut Frame, app: &App) {
    let area = f.area();
    let width = 56.min(area.width.saturating_sub(4));
    let height = 5;
    let x = (area.width.saturating_sub(width)) / 2;
    let y = area.height / 3;
    let modal_area = Rect::new(x, y, width, height);

    f.render_widget(Clear, modal_area);

    let (title, message, hint) = match app.mode {
        Mode::ConfirmDelete => {
            let filtered = app.filtered_subscriptions();
            let name = filtered
                .get(app.channel_selected)
                .map(|s| s.name.as_str())
                .unwrap_or("?");
            (
                "Delete Channel",
                format!("Delete \"{}\"?", name),
                "y:Yes  n:No",
            )
        }
        Mode::ConfirmPrime => {
            let name = app
                .pending_channel
                .as_ref()
                .map(|c| c.name.as_str())
                .unwrap_or("?");
            (
                "Prime Channel",
                format!("Fetch historical videos for \"{}\"?", name),
                "Y:Yes  n:No",
            )
        }
        Mode::ConfirmPrimeAll => {
            let count = app.subscriptions.len();
            (
                "Prime All",
                format!("Prime historical videos for all {} channels?", count),
                "Y:Yes  n:No",
            )
        }
        Mode::ConfirmMarkAll => (
            "Mark All Read",
            "Clear all new video indicators?".to_string(),
            "y:Yes  n:No",
        ),
        Mode::ConfirmMarkAllVideos => {
            let count = app.videos.len();
            (
                "Mark All Watched",
                format!("Mark all {} videos as watched?", count),
                "y:Yes  n:No",
            )
        }
        Mode::ConfirmAddChannel => {
            let name = app
                .filtered_videos()
                .get(app.search_selected)
                .and_then(|v| v.channel_name.as_deref())
                .unwrap_or("?");
            (
                "Subscribe",
                format!("Subscribe to \"{}\"?", name),
                "Y:Yes  n:No",
            )
        }
        _ => ("Confirm", String::new(), ""),
    };

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ACCENT))
        .title(Span::styled(
            format!(" {} ", title),
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        ))
        .style(Style::default().bg(BODY_BG));

    let content = vec![
        Line::from(Span::styled(message, Style::default().fg(LIGHT_GRAY))),
        Line::from(""),
        Line::from(Span::styled(hint, Style::default().fg(GRAY))),
    ];

    let paragraph = Paragraph::new(content).block(block);
    f.render_widget(paragraph, modal_area);
}

// ── Description Panel (Modal) ──────────────────────────────

fn draw_description_panel(f: &mut Frame, app: &App) {
    let area = f.area();
    let width = 80.min(area.width.saturating_sub(6));
    let height = (area.height * 2 / 3).max(10);
    let x = (area.width.saturating_sub(width)) / 2;
    let y = (area.height.saturating_sub(height)) / 2;
    let modal_area = Rect::new(x, y, width, height);

    f.render_widget(Clear, modal_area);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ACCENT))
        .title(Span::styled(
            " Video Info ",
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        ))
        .style(Style::default().bg(BODY_BG));

    if app.loading_description {
        let content = Paragraph::new(Line::from(Span::styled(
            "Loading description...",
            Style::default().fg(GRAY),
        )))
        .block(block);
        f.render_widget(content, modal_area);
        return;
    }

    if let Some(ref desc) = app.description {
        let inner_width = width.saturating_sub(4) as usize;
        let mut lines = vec![
            Line::from(Span::styled(
                &desc.title,
                Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
            )),
            Line::from(Span::styled(
                &desc.channel_name,
                Style::default().fg(YELLOW),
            )),
            Line::from(""),
        ];

        // Word-wrap description
        let desc_text = if desc.description.len() > 500 {
            format!("{}...", &desc.description[..500])
        } else {
            desc.description.clone()
        };

        for line in desc_text.lines() {
            if line.is_empty() {
                lines.push(Line::from(""));
            } else {
                for wrapped in word_wrap(line, inner_width) {
                    lines.push(Line::from(Span::styled(
                        wrapped,
                        Style::default().fg(LIGHT_GRAY),
                    )));
                }
            }
        }

        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "Press (i) to close",
            Style::default().fg(GRAY),
        )));

        let paragraph = Paragraph::new(lines).block(block).wrap(Wrap { trim: false });
        f.render_widget(paragraph, modal_area);
    } else {
        let content = Paragraph::new(Line::from("")).block(block);
        f.render_widget(content, modal_area);
    }
}

// ── Dim Background ─────────────────────────────────────────

fn dim_background(f: &mut Frame) {
    let area = f.area();
    let buf = f.buffer_mut();
    for y in area.top()..area.bottom() {
        for x in area.left()..area.right() {
            if let Some(cell) = buf.cell_mut((x, y)) {
                cell.set_fg(Color::Rgb(50, 50, 60));
                cell.set_bg(Color::Rgb(10, 10, 15));
            }
        }
    }
}

// ── Utility Functions ──────────────────────────────────────

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else if max_len <= 1 {
        ".".to_string()
    } else {
        let truncated: String = s.chars().take(max_len - 1).collect();
        format!("{}…", truncated)
    }
}

fn pad_str(s: &str, width: usize) -> String {
    if s.len() >= width {
        s.chars().take(width).collect()
    } else {
        format!("{}{}", s, " ".repeat(width - s.len()))
    }
}

fn word_wrap(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        if current.is_empty() {
            current = word.to_string();
        } else if current.len() + 1 + word.len() <= max_width {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(current);
            current = word.to_string();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}
