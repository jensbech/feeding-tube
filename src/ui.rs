use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Row, Scrollbar, ScrollbarOrientation, ScrollbarState, Table, Wrap};
use ratatui::Frame;
use unicode_width::UnicodeWidthStr;

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
        | Mode::ConfirmAddChannel
        | Mode::ConfirmChannelWatched => {
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

    // Watched progress (channel video view only)
    if app.screen == Screen::Videos {
        let filtered = app.filtered_videos();
        let total = filtered.len();
        let watched = filtered.iter().filter(|v| app.watched_ids.contains(&v.id)).count();
        spans.push(Span::styled(" │ ", Style::default().fg(DARK_GRAY)));
        spans.push(Span::styled(
            format!("{}/{}", watched, total),
            Style::default().fg(if watched == total && total > 0 { GREEN } else { GRAY }),
        ));
        spans.push(Span::styled(
            " watched",
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

    // Split area into header row + content
    let chunks = Layout::vertical([Constraint::Length(1), Constraint::Min(1)]).split(area);
    let header_area = chunks[0];
    let content_area = chunks[1];

    let width = area.width as usize;
    let pointer_col = 2;
    let videos_col = 7;
    let latest_col = 8;
    let name_col = width.saturating_sub(pointer_col + videos_col + latest_col);

    // Header row
    let header = Row::new(vec![
        ratatui::widgets::Cell::from(Span::styled(
            pad_str("", pointer_col),
            Style::default().fg(DIM_FG),
        )),
        ratatui::widgets::Cell::from(Span::styled(
            pad_str("Channel", name_col),
            Style::default().fg(DIM_FG),
        )),
        ratatui::widgets::Cell::from(Span::styled(
            pad_str("Videos", videos_col),
            Style::default().fg(DIM_FG),
        )),
        ratatui::widgets::Cell::from(Span::styled(
            pad_str("Latest", latest_col),
            Style::default().fg(DIM_FG),
        )),
    ])
    .style(Style::default().bg(BODY_BG));

    let header_table = Table::new(vec![header], [
        Constraint::Length(pointer_col as u16),
        Constraint::Length(name_col as u16),
        Constraint::Length(videos_col as u16),
        Constraint::Length(latest_col as u16),
    ])
    .style(Style::default().bg(BODY_BG));

    f.render_widget(header_table, header_area);

    let visible_count = content_area.height as usize;
    let scroll = app.channel_scroll;
    let selected = app.channel_selected;

    let rows: Vec<Row> = filtered
        .iter()
        .enumerate()
        .skip(scroll)
        .take(visible_count)
        .map(|(i, sub)| {
            let is_selected = i == selected;
            let new_count = app.new_counts.get(&sub.id).copied().unwrap_or(0);
            let is_fully_watched = app.fully_watched.contains(&sub.id);

            let pointer = if is_selected { "▶" } else { " " };

            let name_style = if is_selected {
                Style::default().fg(CYAN).add_modifier(Modifier::BOLD)
            } else if new_count > 0 {
                Style::default().fg(GREEN)
            } else if is_fully_watched {
                Style::default().fg(DIM_FG)
            } else {
                Style::default().fg(LIGHT_GRAY)
            };

            // Build name cell with (+N) suffix when there are new videos
            let new_suffix = if new_count > 999 {
                " (+999)".to_string()
            } else if new_count > 0 {
                format!(" (+{})", new_count)
            } else {
                String::new()
            };
            let suffix_width = new_suffix.len();
            let available_name = name_col.saturating_sub(suffix_width);
            let name_display = truncate_str(&sub.name, available_name.saturating_sub(1));
            let name_cell = if new_count > 0 {
                ratatui::widgets::Cell::from(Line::from(vec![
                    Span::styled(name_display.clone(), name_style),
                    Span::styled(
                        pad_str(&new_suffix, name_col.saturating_sub(name_display.len())),
                        Style::default().fg(GREEN),
                    ),
                ]))
            } else {
                ratatui::widgets::Cell::from(Span::styled(
                    pad_str(&name_display, name_col),
                    name_style,
                ))
            };

            let stats = app.channel_stats.get(&sub.id);
            let video_count_display = stats
                .map(|s| s.video_count.to_string())
                .unwrap_or_default();
            let latest_display = stats
                .and_then(|s| s.latest_date.as_ref())
                .and_then(|d| {
                    chrono::DateTime::parse_from_rfc3339(d)
                        .ok()
                        .map(|dt| crate::db::get_relative_date(dt.with_timezone(&chrono::Utc)))
                })
                .unwrap_or_default();

            let bg = if is_selected {
                HIGHLIGHT_BG
            } else if i % 2 == 0 {
                BODY_BG
            } else {
                ZEBRA_DARK
            };

            Row::new(vec![
                ratatui::widgets::Cell::from(Span::styled(
                    pointer,
                    Style::default().fg(if is_selected { ACCENT } else { BODY_BG }),
                )),
                name_cell,
                ratatui::widgets::Cell::from(Span::styled(
                    pad_str(&video_count_display, videos_col),
                    Style::default().fg(if is_selected { CYAN } else { GRAY }),
                )),
                ratatui::widgets::Cell::from(Span::styled(
                    pad_str(&latest_display, latest_col),
                    Style::default().fg(if is_selected { CYAN } else { GRAY }),
                )),
            ])
            .style(Style::default().bg(bg))
        })
        .collect();

    let table = Table::new(rows, [
        Constraint::Length(pointer_col as u16),
        Constraint::Length(name_col as u16),
        Constraint::Length(videos_col as u16),
        Constraint::Length(latest_col as u16),
    ])
    .style(Style::default().bg(BODY_BG));

    f.render_widget(table, content_area);

    // Scrollbar
    if filtered.len() > visible_count {
        let mut scrollbar_state = ScrollbarState::new(filtered.len())
            .position(scroll);
        f.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .thumb_style(Style::default().fg(ACCENT))
                .track_style(Style::default().fg(DARK_GRAY)),
            content_area,
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
    // Split area into header row + content
    let chunks = Layout::vertical([Constraint::Length(1), Constraint::Min(1)]).split(area);
    let header_area = chunks[0];
    let content_area = chunks[1];

    let width = area.width as usize;

    let channel_col = if show_channel { 32.min(width / 3) } else { 0 };
    let date_col = 8;
    let duration_col = 8;
    let views_col = 8;
    let pointer_col = 3;
    let title_col = width
        .saturating_sub(pointer_col + channel_col + date_col + duration_col + views_col + 2);

    // Header row
    let mut header_cells: Vec<ratatui::widgets::Cell> = Vec::new();
    header_cells.push(ratatui::widgets::Cell::from(Span::styled(
        pad_str("", pointer_col),
        Style::default().fg(DIM_FG),
    )));
    if show_channel {
        header_cells.push(ratatui::widgets::Cell::from(Span::styled(
            pad_str("Channel", channel_col),
            Style::default().fg(DIM_FG),
        )));
    }
    header_cells.push(ratatui::widgets::Cell::from(Span::styled(
        pad_str("Title", title_col),
        Style::default().fg(DIM_FG),
    )));
    header_cells.push(ratatui::widgets::Cell::from(Span::styled(
        pad_str("Dur", duration_col),
        Style::default().fg(DIM_FG),
    )));
    header_cells.push(ratatui::widgets::Cell::from(Span::styled(
        pad_str("Views", views_col),
        Style::default().fg(DIM_FG),
    )));
    header_cells.push(ratatui::widgets::Cell::from(Span::styled(
        pad_str("Date", date_col),
        Style::default().fg(DIM_FG),
    )));

    let mut header_widths: Vec<Constraint> = vec![Constraint::Length(pointer_col as u16)];
    if show_channel {
        header_widths.push(Constraint::Length(channel_col as u16));
    }
    header_widths.push(Constraint::Length(title_col as u16));
    header_widths.push(Constraint::Length(duration_col as u16));
    header_widths.push(Constraint::Length(views_col as u16));
    header_widths.push(Constraint::Length(date_col as u16));

    let header_table = Table::new(vec![Row::new(header_cells)], header_widths.clone())
        .style(Style::default().bg(BODY_BG));

    f.render_widget(header_table, header_area);

    let visible_count = content_area.height as usize;

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

            // Duration + short tag
            let dur = video
                .duration_string
                .as_deref()
                .unwrap_or("--:--");
            let dur_display = if video.is_short {
                format!("{}S", dur.trim_end())
            } else {
                dur.to_string()
            };
            let dur_color = if is_selected {
                CYAN
            } else if video.is_short {
                DIM_FG
            } else {
                GRAY
            };
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pad_str(&dur_display, duration_col),
                Style::default().fg(dur_color),
            )));

            // Views (always shown)
            let views = format_views(video.view_count);
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pad_str(&views, views_col),
                Style::default().fg(if is_selected { CYAN } else { MAGENTA }),
            )));

            // Date
            let date_display = &video.relative_date;
            cells.push(ratatui::widgets::Cell::from(Span::styled(
                pad_str(date_display, date_col),
                Style::default().fg(if is_selected { CYAN } else { GRAY }),
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

    let table = Table::new(rows, header_widths)
        .style(Style::default().bg(BODY_BG));

    f.render_widget(table, content_area);

    // Scrollbar
    if videos.len() > visible_count {
        let mut scrollbar_state = ScrollbarState::new(videos.len())
            .position(scroll);
        f.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight)
                .thumb_style(Style::default().fg(ACCENT))
                .track_style(Style::default().fg(DARK_GRAY)),
            content_area,
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

// ── Modal Helpers ──────────────────────────────────────────

fn modal_area(f: &Frame, width: u16, height: u16) -> Rect {
    let area = f.area();
    let w = width.min(area.width.saturating_sub(4));
    let x = (area.width.saturating_sub(w)) / 2;
    let y = area.height / 3;
    Rect::new(x, y, w, height)
}

fn modal_block(title: &str) -> Block<'_> {
    Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ACCENT))
        .title(Span::styled(
            format!(" {} ", title),
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        ))
        .padding(ratatui::widgets::Padding::new(2, 2, 1, 1))
        .style(Style::default().bg(BODY_BG))
}

// ── Input Overlay ──────────────────────────────────────────

fn draw_input_overlay(f: &mut Frame, app: &App) {
    let area = modal_area(f, 60, 6);
    f.render_widget(Clear, area);

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

    let content = vec![
        Line::from(Span::styled(display_text, text_style)),
        Line::from(Span::styled(
            "Esc:cancel  Enter:submit",
            Style::default().fg(GRAY),
        )),
    ];

    let paragraph = Paragraph::new(content).block(modal_block(title));
    f.render_widget(paragraph, area);
}

// ── Confirm Overlay ────────────────────────────────────────

fn draw_confirm_overlay(f: &mut Frame, app: &App) {
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
            "Mark all channels as read?".to_string(),
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
        Mode::ConfirmChannelWatched => {
            let name = app
                .filtered_subscriptions()
                .get(app.channel_selected)
                .map(|s| s.name.as_str())
                .unwrap_or("?");
            (
                "Mark Watched",
                format!("Mark all videos in \"{}\" as watched?", name),
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

    let area = modal_area(f, 56, 7);
    f.render_widget(Clear, area);

    let content = vec![
        Line::from(Span::styled(message, Style::default().fg(LIGHT_GRAY))),
        Line::from(""),
        Line::from(Span::styled(hint, Style::default().fg(GRAY))),
    ];

    let paragraph = Paragraph::new(content).block(modal_block(title));
    f.render_widget(paragraph, area);
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
    let display_width = UnicodeWidthStr::width(s);
    if display_width <= max_len {
        s.to_string()
    } else if max_len <= 1 {
        ".".to_string()
    } else {
        let mut width = 0;
        let mut result = String::new();
        for c in s.chars() {
            let cw = unicode_width::UnicodeWidthChar::width(c).unwrap_or(0);
            if width + cw > max_len - 1 {
                break;
            }
            result.push(c);
            width += cw;
        }
        format!("{}…", result)
    }
}

fn pad_str(s: &str, width: usize) -> String {
    let display_width = UnicodeWidthStr::width(s);
    if display_width >= width {
        // Truncate to fit
        let mut w = 0;
        let mut result = String::new();
        for c in s.chars() {
            let cw = unicode_width::UnicodeWidthChar::width(c).unwrap_or(0);
            if w + cw > width {
                break;
            }
            result.push(c);
            w += cw;
        }
        if w < width {
            result.push_str(&" ".repeat(width - w));
        }
        result
    } else {
        format!("{}{}", s, " ".repeat(width - display_width))
    }
}

fn word_wrap(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut current_width: usize = 0;

    for word in text.split_whitespace() {
        let word_width = UnicodeWidthStr::width(word);
        if current.is_empty() {
            current = word.to_string();
            current_width = word_width;
        } else if current_width + 1 + word_width <= max_width {
            current.push(' ');
            current.push_str(word);
            current_width += 1 + word_width;
        } else {
            lines.push(current);
            current = word.to_string();
            current_width = word_width;
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── truncate_str tests ───────────────────────────────────

    #[test]
    fn test_truncate_str_short_string() {
        assert_eq!(truncate_str("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_str_exact_fit() {
        assert_eq!(truncate_str("hello", 5), "hello");
    }

    #[test]
    fn test_truncate_str_too_long() {
        let result = truncate_str("hello world", 8);
        assert_eq!(result, "hello w…");
    }

    #[test]
    fn test_truncate_str_very_small_max() {
        assert_eq!(truncate_str("hello", 1), ".");
        assert_eq!(truncate_str("hello", 0), ".");
    }

    #[test]
    fn test_truncate_str_max_two() {
        let result = truncate_str("hello", 2);
        assert_eq!(result, "h…");
    }

    #[test]
    fn test_truncate_str_empty() {
        assert_eq!(truncate_str("", 10), "");
    }

    #[test]
    fn test_truncate_str_unicode() {
        // CJK characters are double-width
        let result = truncate_str("日本語テスト", 8);
        // Each CJK char = 2 width, so 3 chars = 6 width + ellipsis = 7
        assert!(UnicodeWidthStr::width(result.as_str()) <= 8);
        assert!(result.ends_with('…'));
    }

    // ── pad_str tests ────────────────────────────────────────

    #[test]
    fn test_pad_str_needs_padding() {
        let result = pad_str("hi", 5);
        assert_eq!(result, "hi   ");
    }

    #[test]
    fn test_pad_str_exact_width() {
        let result = pad_str("hello", 5);
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_pad_str_too_long() {
        let result = pad_str("hello world", 5);
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_pad_str_empty() {
        let result = pad_str("", 3);
        assert_eq!(result, "   ");
    }

    #[test]
    fn test_pad_str_unicode() {
        // "日" is 2 display width
        let result = pad_str("日", 4);
        assert_eq!(result, "日  "); // 2 char width + 2 spaces = 4
    }

    // ── word_wrap tests ──────────────────────────────────────

    #[test]
    fn test_word_wrap_short_line() {
        let result = word_wrap("hello world", 20);
        assert_eq!(result, vec!["hello world"]);
    }

    #[test]
    fn test_word_wrap_wraps() {
        let result = word_wrap("hello world foo bar", 11);
        assert_eq!(result, vec!["hello world", "foo bar"]);
    }

    #[test]
    fn test_word_wrap_each_word() {
        let result = word_wrap("aaa bbb ccc", 3);
        assert_eq!(result, vec!["aaa", "bbb", "ccc"]);
    }

    #[test]
    fn test_word_wrap_empty() {
        let result = word_wrap("", 10);
        assert_eq!(result, vec![""]);
    }

    #[test]
    fn test_word_wrap_zero_width() {
        let result = word_wrap("hello world", 0);
        assert_eq!(result, vec!["hello world"]);
    }

    #[test]
    fn test_word_wrap_single_long_word() {
        let result = word_wrap("superlongword", 5);
        assert_eq!(result, vec!["superlongword"]); // word too long, kept as-is
    }
}
