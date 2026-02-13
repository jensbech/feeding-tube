use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub url: String,
    pub added_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Video {
    pub id: String,
    pub title: String,
    pub url: String,
    pub is_short: bool,
    pub channel_name: Option<String>,
    pub channel_id: Option<String>,
    pub published_date: Option<DateTime<Utc>>,
    pub stored_at: Option<String>,
    pub relative_date: String,
    pub duration: Option<i64>,
    pub duration_string: Option<String>,
    pub view_count: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub player: String,
    pub videos_per_channel: i64,
    pub hide_shorts: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            player: "mpv".to_string(),
            videos_per_channel: 15,
            hide_shorts: true,
        }
    }
}

pub struct PaginatedResult {
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub videos: Vec<Video>,
}

pub struct Database {
    conn: Connection,
    db_path: PathBuf,
}

fn db_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".youtube-cli")
}

fn db_path() -> PathBuf {
    db_dir().join("data.db")
}

impl Database {
    pub fn open() -> Result<Self, String> {
        let dir = db_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create db dir: {e}"))?;
        let path = db_path();
        let conn =
            Connection::open(&path).map_err(|e| format!("Failed to open database: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
            .map_err(|e| format!("Failed to set pragmas: {e}"))?;
        let mut db = Database {
            conn,
            db_path: path,
        };
        db.create_schema()?;
        db.migrate_from_json()?;
        Ok(db)
    }

    fn create_schema(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "
            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                added_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                is_short INTEGER DEFAULT 0,
                channel_name TEXT,
                channel_id TEXT,
                published_date TEXT,
                stored_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
            CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_date DESC);

            CREATE TABLE IF NOT EXISTS watched (
                video_id TEXT PRIMARY KEY,
                watched_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS channel_views (
                channel_id TEXT PRIMARY KEY,
                last_viewed_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS migrations (
                name TEXT PRIMARY KEY,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        ",
            )
            .map_err(|e| format!("Failed to create schema: {e}"))
    }

    fn has_migration(&self, name: &str) -> bool {
        self.conn
            .query_row(
                "SELECT 1 FROM migrations WHERE name = ?",
                params![name],
                |_| Ok(()),
            )
            .is_ok()
    }

    fn mark_migration(&self, name: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO migrations (name) VALUES (?)",
                params![name],
            )
            .map_err(|e| format!("Migration mark failed: {e}"))?;
        Ok(())
    }

    fn migrate_from_json(&mut self) -> Result<(), String> {
        if self.has_migration("json_import") {
            return Ok(());
        }

        let home = dirs::home_dir().unwrap();
        let legacy_dir = home.join(".config").join("youtube-cli");
        let config_file = legacy_dir.join("subscriptions.json");
        let watched_file = legacy_dir.join("watched.json");
        let videos_file = legacy_dir.join("videos.json");

        let mut imported = false;

        if config_file.exists() {
            if let Ok(content) = fs::read_to_string(&config_file) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(subs) = data.get("subscriptions").and_then(|v| v.as_array()) {
                        for sub in subs {
                            let id = sub.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            let url = sub.get("url").and_then(|v| v.as_str()).unwrap_or("");
                            let _ = self.conn.execute(
                                "INSERT OR IGNORE INTO subscriptions (id, name, url) VALUES (?, ?, ?)",
                                params![id, name, url],
                            );
                        }
                    }
                    if let Some(settings) = data.get("settings").and_then(|v| v.as_object()) {
                        for (key, val) in settings {
                            let _ = self.conn.execute(
                                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                                params![key, val.to_string()],
                            );
                        }
                    }
                    if let Some(views) =
                        data.get("channelLastViewed").and_then(|v| v.as_object())
                    {
                        for (channel_id, ts) in views {
                            let ts_str = ts.as_str().unwrap_or("");
                            let _ = self.conn.execute(
                                "INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)",
                                params![channel_id, ts_str],
                            );
                        }
                    }
                    imported = true;
                }
            }
        }

        if watched_file.exists() {
            if let Ok(content) = fs::read_to_string(&watched_file) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(videos) = data.get("videos").and_then(|v| v.as_object()) {
                        for (video_id, vdata) in videos {
                            let watched_at = vdata
                                .get("watchedAt")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let _ = self.conn.execute(
                                "INSERT OR IGNORE INTO watched (video_id, watched_at) VALUES (?, ?)",
                                params![video_id, watched_at],
                            );
                        }
                    }
                    imported = true;
                }
            }
        }

        if videos_file.exists() {
            if let Ok(content) = fs::read_to_string(&videos_file) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(videos) = data.get("videos").and_then(|v| v.as_object()) {
                        for video in videos.values() {
                            let id = video.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let title =
                                video.get("title").and_then(|v| v.as_str()).unwrap_or("");
                            let url = video.get("url").and_then(|v| v.as_str()).unwrap_or("");
                            let is_short = video
                                .get("isShort")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            let channel_name = video
                                .get("channelName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let channel_id = video
                                .get("channelId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let published = video
                                .get("publishedDate")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let stored_at = video
                                .get("storedAt")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let _ = self.conn.execute(
                                "INSERT OR IGNORE INTO videos (id, title, url, is_short, channel_name, channel_id, published_date, stored_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                params![id, title, url, is_short as i32, channel_name, channel_id, published, stored_at],
                            );
                        }
                    }
                    imported = true;
                }
            }
        }

        self.mark_migration("json_import")?;

        if imported {
            let backup_dir = legacy_dir.join("backup");
            let _ = fs::create_dir_all(&backup_dir);
            for file in [&config_file, &watched_file, &videos_file] {
                if file.exists() {
                    let backup = backup_dir.join(file.file_name().unwrap());
                    let _ = fs::rename(file, backup);
                }
            }
        }

        Ok(())
    }

    // ── Subscriptions ──────────────────────────────────────────

    pub fn get_subscriptions(&self) -> Vec<Subscription> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, url, added_at FROM subscriptions ORDER BY name COLLATE NOCASE")
            .unwrap();
        stmt.query_map([], |row| {
            Ok(Subscription {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                added_at: row.get(3)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn add_subscription(&self, sub: &Subscription) -> Result<(), String> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM subscriptions WHERE id = ? OR url = ?",
                params![sub.id, sub.url],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            return Err("Subscription already exists".to_string());
        }

        self.conn
            .execute(
                "INSERT INTO subscriptions (id, name, url) VALUES (?, ?, ?)",
                params![sub.id, sub.name, sub.url],
            )
            .map_err(|e| format!("Failed to add subscription: {e}"))?;
        Ok(())
    }

    pub fn remove_subscription(&self, id: &str) -> Result<(), String> {
        let rows = self
            .conn
            .execute("DELETE FROM subscriptions WHERE id = ?", params![id])
            .map_err(|e| format!("Failed to remove: {e}"))?;
        if rows == 0 {
            return Err("Subscription not found".to_string());
        }
        Ok(())
    }

    // ── Settings ───────────────────────────────────────────────

    pub fn get_settings(&self) -> Settings {
        let mut settings = Settings::default();
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings")
            .unwrap();
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                ))
            })
            .unwrap();

        for row in rows.flatten() {
            let (key, value) = row;
            match key.as_str() {
                "player" => {
                    if let Ok(v) = serde_json::from_str::<String>(&value) {
                        settings.player = v;
                    }
                }
                "videosPerChannel" => {
                    if let Ok(v) = serde_json::from_str::<i64>(&value) {
                        settings.videos_per_channel = v;
                    }
                }
                "hideShorts" => {
                    if let Ok(v) = serde_json::from_str::<bool>(&value) {
                        settings.hide_shorts = v;
                    }
                }
                _ => {}
            }
        }
        settings
    }

    pub fn update_setting(&self, key: &str, value: &str) {
        let _ = self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        );
    }

    // ── Watched ────────────────────────────────────────────────

    pub fn mark_as_watched(&self, video_id: &str) {
        let _ = self.conn.execute(
            "INSERT OR REPLACE INTO watched (video_id) VALUES (?)",
            params![video_id],
        );
    }

    pub fn get_watched_ids(&self) -> HashSet<String> {
        let mut stmt = self
            .conn
            .prepare("SELECT video_id FROM watched")
            .unwrap();
        stmt.query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    pub fn toggle_watched(&self, video_id: &str) -> bool {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM watched WHERE video_id = ?",
                params![video_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            let _ = self.conn.execute(
                "DELETE FROM watched WHERE video_id = ?",
                params![video_id],
            );
            false
        } else {
            let _ = self.conn.execute(
                "INSERT INTO watched (video_id) VALUES (?)",
                params![video_id],
            );
            true
        }
    }

    pub fn mark_channel_all_watched(&self, video_ids: &[String]) -> usize {
        if video_ids.is_empty() {
            return 0;
        }
        let mut count = 0;
        for id in video_ids {
            let result = self.conn.execute(
                "INSERT OR IGNORE INTO watched (video_id) VALUES (?)",
                params![id],
            );
            if let Ok(rows) = result {
                count += rows;
            }
        }
        count
    }

    // ── Videos ─────────────────────────────────────────────────

    pub fn store_videos(&self, videos: &[Video]) -> usize {
        if videos.is_empty() {
            return 0;
        }
        let mut count = 0;
        for v in videos {
            let pub_date = v
                .published_date
                .map(|d| d.to_rfc3339())
                .unwrap_or_default();
            let result = self.conn.execute(
                "INSERT OR IGNORE INTO videos (id, title, url, is_short, channel_name, channel_id, published_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![
                    v.id,
                    v.title,
                    v.url,
                    v.is_short as i32,
                    v.channel_name,
                    v.channel_id,
                    pub_date,
                ],
            );
            if let Ok(rows) = result {
                count += rows;
            }
        }
        count
    }

    pub fn get_stored_videos(&self, channel_id: &str) -> Vec<Video> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at FROM videos WHERE channel_id = ? ORDER BY published_date DESC"
        ).unwrap();
        stmt.query_map(params![channel_id], |row| Ok(hydrate_video(row)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    pub fn get_stored_videos_paginated(
        &self,
        channel_ids: Option<&[String]>,
        page: usize,
        page_size: usize,
    ) -> PaginatedResult {
        let safe_page_size = page_size.clamp(1, 1000);
        let offset = page * safe_page_size;

        let (total, videos) = if let Some(ids) = channel_ids {
            if ids.is_empty() {
                return PaginatedResult {
                    total: 0,
                    page,
                    page_size: safe_page_size,
                    videos: vec![],
                };
            }
            let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
            let ph_str = placeholders.join(",");

            let count_sql = format!(
                "SELECT COUNT(*) FROM videos WHERE channel_id IN ({})",
                ph_str
            );
            let mut count_stmt = self.conn.prepare(&count_sql).unwrap();
            let total: usize = count_stmt
                .query_row(rusqlite::params_from_iter(ids.iter()), |row| row.get(0))
                .unwrap_or(0);

            let select_sql = format!(
                "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at FROM videos WHERE channel_id IN ({}) ORDER BY published_date DESC LIMIT ?{} OFFSET ?{}",
                ph_str,
                ids.len() + 1,
                ids.len() + 2,
            );
            let mut stmt = self.conn.prepare(&select_sql).unwrap();
            let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
                .iter()
                .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
                .collect();
            all_params.push(Box::new(safe_page_size as i64));
            all_params.push(Box::new(offset as i64));

            let videos: Vec<Video> = stmt
                .query_map(rusqlite::params_from_iter(all_params.iter().map(|p| p.as_ref())), |row| {
                    Ok(hydrate_video(row))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            (total, videos)
        } else {
            let total: usize = self
                .conn
                .query_row("SELECT COUNT(*) FROM videos", [], |row| row.get(0))
                .unwrap_or(0);

            let mut stmt = self.conn.prepare(
                "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at FROM videos ORDER BY published_date DESC LIMIT ? OFFSET ?"
            ).unwrap();
            let videos: Vec<Video> = stmt
                .query_map(params![safe_page_size as i64, offset as i64], |row| {
                    Ok(hydrate_video(row))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            (total, videos)
        };

        PaginatedResult {
            total,
            page,
            page_size: safe_page_size,
            videos,
        }
    }

    // ── Channel Views ──────────────────────────────────────────

    pub fn update_channel_last_viewed(&self, channel_id: &str) {
        let now = Utc::now().to_rfc3339();
        let _ = self.conn.execute(
            "INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)",
            params![channel_id, now],
        );
    }

    pub fn mark_all_channels_viewed(&self, channel_ids: &[String]) {
        let now = Utc::now().to_rfc3339();
        for id in channel_ids {
            let _ = self.conn.execute(
                "INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)",
                params![id, now],
            );
        }
    }

    pub fn get_new_video_counts(&self, hide_shorts: bool) -> HashMap<String, usize> {
        let short_filter = if hide_shorts {
            "AND v.is_short = 0"
        } else {
            ""
        };
        let sql = format!(
            "SELECT v.channel_id, COUNT(*) as count FROM videos v
             LEFT JOIN channel_views cv ON v.channel_id = cv.channel_id
             WHERE v.published_date IS NOT NULL AND v.channel_id IS NOT NULL {}
               AND (cv.last_viewed_at IS NULL OR v.published_date > cv.last_viewed_at)
             GROUP BY v.channel_id",
            short_filter
        );
        let mut stmt = self.conn.prepare(&sql).unwrap();
        stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, usize>(1)?,
            ))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn get_fully_watched_channels(&self, hide_shorts: bool) -> HashSet<String> {
        let short_filter = if hide_shorts {
            "WHERE v.is_short = 0"
        } else {
            ""
        };
        let sql = format!(
            "SELECT v.channel_id, COUNT(*) as total, SUM(CASE WHEN w.video_id IS NOT NULL THEN 1 ELSE 0 END) as watched
             FROM videos v LEFT JOIN watched w ON v.id = w.video_id {}
             GROUP BY v.channel_id HAVING total > 0 AND total = watched",
            short_filter
        );
        let mut stmt = self.conn.prepare(&sql).unwrap();
        stmt.query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }
}

fn hydrate_video(row: &rusqlite::Row) -> Video {
    let published_str: Option<String> = row.get(6).unwrap_or(None);
    let published_date = published_str
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
        .or_else(|| {
            published_str
                .as_deref()
                .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
                .map(|d| d.and_utc())
        })
        .or_else(|| {
            published_str
                .as_deref()
                .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok())
                .map(|d| d.and_utc())
        });

    let relative_date = published_date
        .map(|d| get_relative_date(d))
        .unwrap_or_default();

    Video {
        id: row.get(0).unwrap_or_default(),
        title: row.get(1).unwrap_or_default(),
        url: row.get(2).unwrap_or_default(),
        is_short: row.get::<_, i32>(3).unwrap_or(0) != 0,
        channel_name: row.get(4).unwrap_or(None),
        channel_id: row.get(5).unwrap_or(None),
        published_date,
        stored_at: row.get(7).unwrap_or(None),
        relative_date,
        duration: None,
        duration_string: None,
        view_count: None,
    }
}

pub fn get_relative_date(date: DateTime<Utc>) -> String {
    let now = Utc::now();
    let diff = now.signed_duration_since(date);

    if diff.num_seconds() < 0 {
        return "upcoming".to_string();
    }

    let mins = diff.num_minutes();
    let hours = diff.num_hours();
    let days = diff.num_days();

    if mins < 60 {
        format!("{}m ago", mins.max(1))
    } else if hours < 24 {
        format!("{}h ago", hours)
    } else if days == 1 {
        "1d ago".to_string()
    } else if days < 7 {
        format!("{}d ago", days)
    } else if days < 30 {
        format!("{}w ago", days / 7)
    } else if days < 365 {
        format!("{}mo ago", days / 30)
    } else {
        format!("{}y ago", days / 365)
    }
}

pub fn format_duration(seconds: Option<i64>) -> String {
    match seconds {
        None | Some(0) => "--:--".to_string(),
        Some(s) => {
            let hours = s / 3600;
            let minutes = (s % 3600) / 60;
            let secs = s % 60;
            if hours > 0 {
                format!("{}:{:02}:{:02}", hours, minutes, secs)
            } else {
                format!("{}:{:02}", minutes, secs)
            }
        }
    }
}

pub fn format_views(count: Option<u64>) -> String {
    match count {
        None => String::new(),
        Some(c) if c >= 1_000_000 => format!("{:.1}M", c as f64 / 1_000_000.0),
        Some(c) if c >= 1_000 => format!("{}K", c / 1000),
        Some(c) => c.to_string(),
    }
}

pub fn decode_xml_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}
