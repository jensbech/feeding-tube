use std::collections::{HashMap, HashSet};
use std::time::Instant;

use crate::db::{Database, Settings, Subscription, Video};
use crate::ytdlp::{ChannelInfo, VideoDescription};

// ── Screens & Modes ────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    Channels,
    Videos,
    Search,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Mode {
    List,
    Filter,
    Add,
    GlobalSearch,
    ConfirmDelete,
    ConfirmPrime,
    ConfirmPrimeAll,
    ConfirmMarkAll,
    ConfirmMarkAllVideos,
    ConfirmAddChannel,
    NewSearch,
    Description,
}

// ── Auto-hide messages ─────────────────────────────────────

pub struct StatusMessage {
    pub text: String,
    pub is_error: bool,
    pub created_at: Instant,
}

// ── App State ──────────────────────────────────────────────

pub struct App {
    pub db: Database,

    // Navigation
    pub screen: Screen,
    pub mode: Mode,

    // Channel list state
    pub subscriptions: Vec<Subscription>,
    pub channel_selected: usize,
    pub channel_scroll: usize,
    pub new_counts: HashMap<String, usize>,
    pub fully_watched: HashSet<String>,
    pub saved_channel_index: usize,

    // Video list state
    pub current_channel: Option<Subscription>,
    pub videos: Vec<Video>,
    pub video_selected: usize,
    pub video_scroll: usize,
    pub current_page: usize,
    pub total_videos: usize,
    pub page_size: usize,

    // Search state
    pub search_query: String,
    pub search_results: Vec<Video>,
    pub search_selected: usize,
    pub search_scroll: usize,

    // Shared state
    pub watched_ids: HashSet<String>,
    pub settings: Settings,
    pub hide_shorts: bool,

    // Filter
    pub filter_text: String,

    // Input fields
    pub input_text: String,
    pub input_cursor: usize,

    // Loading state
    pub loading: bool,
    pub loading_message: String,

    // Status messages (auto-hide)
    pub status_message: Option<StatusMessage>,

    // Description panel
    pub description: Option<VideoDescription>,
    pub loading_description: bool,
    pub show_description: bool,

    // Pending channel (after add for prime prompt)
    pub pending_channel: Option<ChannelInfo>,

    // First load tracker
    pub has_checked_for_new: bool,

    // Playing state
    pub playing: bool,

    // Channel IDs cache for all-videos view
    pub all_channel_ids: Vec<String>,
}

impl App {
    pub fn new(db: Database) -> Self {
        let settings = db.get_settings();
        let hide_shorts = settings.hide_shorts;
        let watched_ids = db.get_watched_ids();

        App {
            db,
            screen: Screen::Channels,
            mode: Mode::List,
            subscriptions: Vec::new(),
            channel_selected: 0,
            channel_scroll: 0,
            new_counts: HashMap::new(),
            fully_watched: HashSet::new(),
            saved_channel_index: 0,
            current_channel: None,
            videos: Vec::new(),
            video_selected: 0,
            video_scroll: 0,
            current_page: 0,
            total_videos: 0,
            page_size: 100,
            search_query: String::new(),
            search_results: Vec::new(),
            search_selected: 0,
            search_scroll: 0,
            watched_ids,
            settings,
            hide_shorts,
            filter_text: String::new(),
            input_text: String::new(),
            input_cursor: 0,
            loading: false,
            loading_message: String::new(),
            status_message: None,
            description: None,
            loading_description: false,
            show_description: false,
            pending_channel: None,
            has_checked_for_new: false,
            playing: false,
            all_channel_ids: Vec::new(),
        }
    }

    pub fn with_initial_channel(db: Database, channel: Subscription) -> Self {
        let mut app = App::new(db);
        app.current_channel = Some(channel);
        app.screen = Screen::Videos;
        app
    }

    // ── Initialization ─────────────────────────────────────

    pub fn load_subscriptions(&mut self) {
        self.subscriptions = self.db.get_subscriptions();
        self.refresh_counts();
    }

    pub fn refresh_counts(&mut self) {
        self.new_counts = self.db.get_new_video_counts(self.hide_shorts);
        self.fully_watched = self.db.get_fully_watched_channels(self.hide_shorts);
    }

    pub fn refresh_watched(&mut self) {
        self.watched_ids = self.db.get_watched_ids();
    }

    // ── Status Messages ────────────────────────────────────

    pub fn set_message(&mut self, msg: &str) {
        self.status_message = Some(StatusMessage {
            text: msg.to_string(),
            is_error: false,
            created_at: Instant::now(),
        });
    }

    pub fn set_error(&mut self, msg: &str) {
        self.status_message = Some(StatusMessage {
            text: msg.to_string(),
            is_error: true,
            created_at: Instant::now(),
        });
    }

    pub fn clear_expired_messages(&mut self) {
        if let Some(ref msg) = self.status_message {
            if msg.created_at.elapsed().as_secs() >= 3 {
                self.status_message = None;
            }
        }
    }

    // ── Channel List Filtering ─────────────────────────────

    pub fn filtered_subscriptions(&self) -> Vec<&Subscription> {
        if self.filter_text.is_empty() {
            self.subscriptions.iter().collect()
        } else {
            let search = self.filter_text.to_lowercase();
            self.subscriptions
                .iter()
                .filter(|s| s.name.to_lowercase().contains(&search))
                .collect()
        }
    }

    // ── Video List Filtering ───────────────────────────────

    pub fn filtered_videos(&self) -> Vec<&Video> {
        let source = if self.screen == Screen::Search {
            &self.search_results
        } else {
            &self.videos
        };

        source
            .iter()
            .filter(|v| {
                if self.hide_shorts && v.is_short {
                    return false;
                }
                if !self.filter_text.is_empty() {
                    let search = self.filter_text.to_lowercase();
                    return v.title.to_lowercase().contains(&search)
                        || v.channel_name
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&search);
                }
                true
            })
            .collect()
    }

    // ── Scrolling ──────────────────────────────────────────

    pub fn move_up(&mut self) {
        let (selected, scroll) = self.current_selection_mut();
        if *selected > 0 {
            *selected -= 1;
            if *selected < *scroll {
                *scroll = *selected;
            }
        }
    }

    pub fn move_down(&mut self, list_len: usize, visible_count: usize) {
        let (selected, scroll) = self.current_selection_mut();
        if *selected < list_len.saturating_sub(1) {
            *selected += 1;
            if *selected >= *scroll + visible_count {
                *scroll = *selected - visible_count + 1;
            }
        }
    }

    fn current_selection_mut(&mut self) -> (&mut usize, &mut usize) {
        match self.screen {
            Screen::Channels => (&mut self.channel_selected, &mut self.channel_scroll),
            Screen::Videos => (&mut self.video_selected, &mut self.video_scroll),
            Screen::Search => (&mut self.search_selected, &mut self.search_scroll),
        }
    }

    pub fn reset_scroll(&mut self) {
        let (selected, scroll) = self.current_selection_mut();
        *selected = 0;
        *scroll = 0;
    }

    pub fn current_selected(&self) -> usize {
        match self.screen {
            Screen::Channels => self.channel_selected,
            Screen::Videos => self.video_selected,
            Screen::Search => self.search_selected,
        }
    }

    pub fn current_scroll(&self) -> usize {
        match self.screen {
            Screen::Channels => self.channel_scroll,
            Screen::Videos => self.video_scroll,
            Screen::Search => self.search_scroll,
        }
    }

    // ── Navigation ─────────────────────────────────────────

    pub fn navigate_to_videos(&mut self, channel: Option<Subscription>, index: usize) {
        self.saved_channel_index = index;
        self.current_channel = channel;
        self.screen = Screen::Videos;
        self.mode = Mode::List;
        self.video_selected = 0;
        self.video_scroll = 0;
        self.filter_text.clear();
        self.show_description = false;
        self.description = None;
    }

    pub fn navigate_to_search(&mut self, query: String) {
        self.search_query = query;
        self.screen = Screen::Search;
        self.mode = Mode::List;
        self.search_selected = 0;
        self.search_scroll = 0;
        self.filter_text.clear();
        self.show_description = false;
        self.description = None;
    }

    pub fn navigate_back(&mut self) {
        self.screen = Screen::Channels;
        self.mode = Mode::List;
        self.current_channel = None;
        self.search_query.clear();
        self.filter_text.clear();
        self.show_description = false;
        self.description = None;

        // Restore saved index
        self.channel_selected = self.saved_channel_index;
        let subs_len = self.subscriptions.len();
        if self.channel_selected >= subs_len && subs_len > 0 {
            self.channel_selected = subs_len - 1;
        }
    }

    // ── Input Handling ─────────────────────────────────────

    pub fn input_insert(&mut self, c: char) {
        let byte_pos = self
            .input_text
            .char_indices()
            .nth(self.input_cursor)
            .map(|(i, _)| i)
            .unwrap_or(self.input_text.len());
        self.input_text.insert(byte_pos, c);
        self.input_cursor += 1;
    }

    pub fn input_backspace(&mut self) {
        if self.input_cursor > 0 {
            self.input_cursor -= 1;
            let byte_pos = self
                .input_text
                .char_indices()
                .nth(self.input_cursor)
                .map(|(i, _)| i)
                .unwrap_or(self.input_text.len());
            self.input_text.remove(byte_pos);
        }
    }

    pub fn input_clear(&mut self) {
        self.input_text.clear();
        self.input_cursor = 0;
    }

    // ── Toggle Shorts ──────────────────────────────────────

    pub fn toggle_shorts(&mut self) {
        self.hide_shorts = !self.hide_shorts;
        self.db.update_setting(
            "hideShorts",
            &serde_json::to_string(&self.hide_shorts).unwrap(),
        );
        if self.hide_shorts {
            self.set_message("Hiding Shorts");
        } else {
            self.set_message("Showing all videos");
        }
        self.refresh_counts();
    }

    // ── Toggle Watched ─────────────────────────────────────

    pub fn toggle_watched_current(&mut self) {
        let filtered = self.filtered_videos();
        let selected = self.current_selected();
        if let Some(video) = filtered.get(selected) {
            let video_id = video.id.clone();
            let now_watched = self.db.toggle_watched(&video_id);
            self.refresh_watched();
            if now_watched {
                self.set_message("Marked as watched");
            } else {
                self.set_message("Marked as unwatched");
            }
        }
    }

    // ── Mark Channel Watched ───────────────────────────────

    pub fn mark_channel_watched(&mut self) {
        let filtered = self.filtered_subscriptions();
        if let Some(sub) = filtered.get(self.channel_selected) {
            let channel_id = sub.id.clone();
            let videos = self.db.get_stored_videos(&channel_id);
            let video_ids: Vec<String> = if self.hide_shorts {
                videos.iter().filter(|v| !v.is_short).map(|v| v.id.clone()).collect()
            } else {
                videos.iter().map(|v| v.id.clone()).collect()
            };
            let count = self.db.mark_channel_all_watched(&video_ids);
            self.refresh_counts();
            self.refresh_watched();
            let name = self.filtered_subscriptions()
                .get(self.channel_selected)
                .map(|s| s.name.clone())
                .unwrap_or_default();
            self.set_message(&format!("Marked {} videos as watched in {}", count, name));
        }
    }

    // ── Load video page ────────────────────────────────────

    pub fn load_video_page(&mut self) {
        if self.current_channel.is_some() || self.all_channel_ids.is_empty() {
            return;
        }
        let result = self.db.get_stored_videos_paginated(
            Some(&self.all_channel_ids),
            self.current_page,
            100,
        );
        self.videos = result.videos;
        self.total_videos = result.total;
        self.page_size = result.page_size;
        self.video_selected = 0;
        self.video_scroll = 0;
    }

    pub fn total_pages(&self) -> usize {
        if self.page_size == 0 {
            return 1;
        }
        (self.total_videos + self.page_size - 1) / self.page_size
    }
}
