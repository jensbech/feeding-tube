use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub url: String,
    pub added_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub player: String,
    pub videos_per_channel: i64,
    pub hide_shorts: bool,
    pub max_resolution: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            player: "mpv".to_string(),
            videos_per_channel: 15,
            hide_shorts: true,
            max_resolution: "1080".to_string(),
        }
    }
}

pub struct PaginatedResult {
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub videos: Vec<Video>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChannelStats {
    pub video_count: usize,
    pub latest_date: Option<String>,
}

pub struct Database {
    conn: Connection,
    db_path: PathBuf,
}

fn secure_random_token(len: usize) -> String {
    use std::io::Read;
    let mut bytes = vec![0u8; len];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut bytes);
    }
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn db_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".feeding-tube")
}

fn db_path() -> PathBuf {
    db_dir().join("data.db")
}

impl Database {
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, String> {
        let conn =
            Connection::open_in_memory().map_err(|e| format!("Failed to open in-memory db: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
            .map_err(|e| format!("Failed to set pragmas: {e}"))?;
        let db = Database {
            conn,
            db_path: PathBuf::from(":memory:"),
        };
        db.create_schema()?;
        db.migrate_add_video_metadata()?;
        db.migrate_multi_user()?;
        Ok(db)
    }

    pub fn open() -> Result<Self, String> {
        let dir = db_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create db dir: {e}"))?;
        let path = db_path();

        // Migrate from old ~/.youtube-cli/ if new db doesn't exist yet
        if !path.exists() {
            let home = dirs::home_dir().unwrap();
            let old_db = home.join(".youtube-cli").join("data.db");
            if old_db.exists() {
                let _ = fs::copy(&old_db, &path);
            }
        }
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
        db.migrate_add_video_metadata()?;
        db.migrate_multi_user()?;
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
                stored_at TEXT DEFAULT CURRENT_TIMESTAMP,
                duration INTEGER,
                view_count INTEGER
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

    fn migrate_add_video_metadata(&self) -> Result<(), String> {
        if self.has_migration("add_video_metadata") {
            return Ok(());
        }
        // Add columns if they don't exist (idempotent for fresh DBs that already have them)
        let _ = self
            .conn
            .execute_batch("ALTER TABLE videos ADD COLUMN duration INTEGER;");
        let _ = self
            .conn
            .execute_batch("ALTER TABLE videos ADD COLUMN view_count INTEGER;");
        self.mark_migration("add_video_metadata")?;
        Ok(())
    }

    fn migrate_multi_user(&self) -> Result<(), String> {
        if self.has_migration("multi_user") {
            return Ok(());
        }

        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );"
        ).map_err(|e| format!("Failed to create users table: {e}"))?;

        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );"
        ).map_err(|e| format!("Failed to create sessions table: {e}"))?;

        let has_data: bool = self.conn
            .query_row("SELECT COUNT(*) > 0 FROM subscriptions", [], |row| row.get(0))
            .unwrap_or(false);

        if has_data {
            self.conn.execute(
                "INSERT INTO users (name, role) VALUES ('Admin', 'admin')",
                [],
            ).map_err(|e| format!("Failed to create default admin: {e}"))?;
            let admin_id: i64 = self.conn.last_insert_rowid();

            self.conn.execute_batch(&format!(
                "CREATE TABLE subscriptions_new (
                    id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER NOT NULL DEFAULT {admin_id},
                    PRIMARY KEY (id, user_id)
                );
                INSERT INTO subscriptions_new (id, name, url, added_at, user_id)
                    SELECT id, name, url, added_at, {admin_id} FROM subscriptions;
                DROP TABLE subscriptions;
                ALTER TABLE subscriptions_new RENAME TO subscriptions;

                CREATE TABLE settings_new (
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT {admin_id},
                    PRIMARY KEY (key, user_id)
                );
                INSERT OR IGNORE INTO settings_new (key, value, user_id)
                    SELECT key, value, {admin_id} FROM settings;
                DROP TABLE settings;
                ALTER TABLE settings_new RENAME TO settings;

                CREATE TABLE channel_views_new (
                    channel_id TEXT NOT NULL,
                    last_viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER NOT NULL DEFAULT {admin_id},
                    PRIMARY KEY (channel_id, user_id)
                );
                INSERT OR IGNORE INTO channel_views_new (channel_id, last_viewed_at, user_id)
                    SELECT channel_id, last_viewed_at, {admin_id} FROM channel_views;
                DROP TABLE channel_views;
                ALTER TABLE channel_views_new RENAME TO channel_views;"
            )).map_err(|e| format!("Failed to migrate tables: {e}"))?;

            self.conn.execute_batch(&format!(
                "CREATE TABLE watched_new (
                    video_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT {admin_id},
                    watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (video_id, user_id)
                );
                INSERT INTO watched_new (video_id, user_id, watched_at)
                    SELECT video_id, {admin_id}, watched_at FROM watched;
                DROP TABLE watched;
                ALTER TABLE watched_new RENAME TO watched;"
            )).map_err(|e| format!("Failed to migrate watched table: {e}"))?;
        } else {
            self.conn.execute(
                "INSERT INTO users (name, role) VALUES ('Admin', 'admin')",
                [],
            ).map_err(|e| format!("Failed to create default admin: {e}"))?;

            self.conn.execute_batch(
                "DROP TABLE IF EXISTS subscriptions;
                 CREATE TABLE subscriptions (
                    id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER NOT NULL,
                    PRIMARY KEY (id, user_id)
                 );

                 DROP TABLE IF EXISTS watched;
                 CREATE TABLE watched (
                    video_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (video_id, user_id)
                 );

                 DROP TABLE IF EXISTS settings;
                 CREATE TABLE settings (
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    PRIMARY KEY (key, user_id)
                 );

                 DROP TABLE IF EXISTS channel_views;
                 CREATE TABLE channel_views (
                    channel_id TEXT NOT NULL,
                    last_viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER NOT NULL,
                    PRIMARY KEY (channel_id, user_id)
                 );"
            ).map_err(|e| format!("Failed to create multi-user tables: {e}"))?;
        }

        let _ = self.conn.execute_batch(
            "DROP INDEX IF EXISTS idx_watched_user;
             DROP INDEX IF EXISTS idx_subs_user;
             DROP INDEX IF EXISTS idx_settings_user;
             DROP INDEX IF EXISTS idx_channel_views_user;
             CREATE INDEX idx_watched_user ON watched(user_id);
             CREATE INDEX idx_subs_user ON subscriptions(user_id);
             CREATE INDEX idx_settings_user ON settings(user_id);
             CREATE INDEX idx_channel_views_user ON channel_views(user_id);"
        );

        self.mark_migration("multi_user")?;
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

    // ── Users ────────────────────────────────────────────────

    pub fn get_users(&self) -> Vec<User> {
        let mut stmt = self.conn
            .prepare("SELECT id, name, role FROM users ORDER BY id")
            .unwrap();
        stmt.query_map([], |row| {
            Ok(User {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn get_user(&self, user_id: i64) -> Option<User> {
        self.conn
            .query_row(
                "SELECT id, name, role FROM users WHERE id = ?",
                params![user_id],
                |row| Ok(User {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    role: row.get(2)?,
                }),
            )
            .ok()
    }

    pub fn add_user(&self, name: &str, role: &str) -> Result<User, String> {
        self.conn
            .execute(
                "INSERT INTO users (name, role) VALUES (?, ?)",
                params![name, role],
            )
            .map_err(|e| format!("Failed to add user: {e}"))?;
        let id = self.conn.last_insert_rowid();
        Ok(User { id, name: name.to_string(), role: role.to_string() })
    }

    pub fn remove_user(&self, user_id: i64) -> Result<(), String> {
        let rows = self.conn
            .execute("DELETE FROM users WHERE id = ?", params![user_id])
            .map_err(|e| format!("Failed to remove user: {e}"))?;
        if rows == 0 {
            return Err("User not found".to_string());
        }
        self.conn.execute("DELETE FROM subscriptions WHERE user_id = ?", params![user_id]).ok();
        self.conn.execute("DELETE FROM watched WHERE user_id = ?", params![user_id]).ok();
        self.conn.execute("DELETE FROM settings WHERE user_id = ?", params![user_id]).ok();
        self.conn.execute("DELETE FROM channel_views WHERE user_id = ?", params![user_id]).ok();
        self.conn.execute("DELETE FROM sessions WHERE user_id = ?", params![user_id]).ok();
        Ok(())
    }

    // ── Sessions ──────────────────────────────────────────────

    pub fn create_session(&self, user_id: i64) -> String {
        let token = secure_random_token(32);
        let _ = self.conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
            params![token, user_id],
        );
        token
    }

    pub fn get_session_user(&self, token: &str) -> Option<User> {
        let max_age_secs = 7 * 24 * 3600; // 7 days
        self.conn
            .query_row(
                "SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON s.user_id = u.id
                 WHERE s.token = ? AND (julianday('now') - julianday(s.created_at)) * 86400 < ?",
                params![token, max_age_secs],
                |row| Ok(User {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    role: row.get(2)?,
                }),
            )
            .ok()
    }

    pub fn delete_session(&self, token: &str) {
        let _ = self.conn.execute("DELETE FROM sessions WHERE token = ?", params![token]);
    }

    pub fn cleanup_expired_sessions(&self) {
        let max_age_secs = 7 * 24 * 3600;
        let _ = self.conn.execute(
            "DELETE FROM sessions WHERE (julianday('now') - julianday(created_at)) * 86400 >= ?",
            params![max_age_secs],
        );
    }

    // ── Subscriptions ──────────────────────────────────────────

    pub fn get_subscriptions(&self, user_id: i64) -> Vec<Subscription> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, url, added_at FROM subscriptions WHERE user_id = ? ORDER BY name COLLATE NOCASE")
            .unwrap();
        stmt.query_map(params![user_id], |row| {
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

    pub fn add_subscription(&self, sub: &Subscription, user_id: i64) -> Result<(), String> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM subscriptions WHERE (id = ? OR url = ?) AND user_id = ?",
                params![sub.id, sub.url, user_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            return Err("Subscription already exists".to_string());
        }

        self.conn
            .execute(
                "INSERT INTO subscriptions (id, name, url, user_id) VALUES (?, ?, ?, ?)",
                params![sub.id, sub.name, sub.url, user_id],
            )
            .map_err(|e| format!("Failed to add subscription: {e}"))?;
        Ok(())
    }

    pub fn remove_subscription(&self, id: &str, user_id: i64) -> Result<(), String> {
        let rows = self
            .conn
            .execute("DELETE FROM subscriptions WHERE id = ? AND user_id = ?", params![id, user_id])
            .map_err(|e| format!("Failed to remove: {e}"))?;
        if rows == 0 {
            return Err("Subscription not found".to_string());
        }
        Ok(())
    }

    // ── Settings ───────────────────────────────────────────────

    pub fn get_settings(&self, user_id: i64) -> Settings {
        let mut settings = Settings::default();
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings WHERE user_id = ?")
            .unwrap();
        let rows = stmt
            .query_map(params![user_id], |row| {
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
                "maxResolution" => {
                    if let Ok(v) = serde_json::from_str::<String>(&value) {
                        settings.max_resolution = v;
                    }
                }
                _ => {}
            }
        }
        settings
    }

    pub fn update_setting(&self, key: &str, value: &str, user_id: i64) {
        let _ = self.conn.execute(
            "DELETE FROM settings WHERE key = ? AND user_id = ?",
            params![key, user_id],
        );
        let _ = self.conn.execute(
            "INSERT INTO settings (key, value, user_id) VALUES (?, ?, ?)",
            params![key, value, user_id],
        );
    }

    // ── Watched ────────────────────────────────────────────────

    pub fn mark_as_watched(&self, video_id: &str, user_id: i64) {
        let _ = self.conn.execute(
            "INSERT OR REPLACE INTO watched (video_id, user_id) VALUES (?, ?)",
            params![video_id, user_id],
        );
    }

    pub fn get_watched_ids(&self, user_id: i64) -> HashSet<String> {
        let mut stmt = self
            .conn
            .prepare("SELECT video_id FROM watched WHERE user_id = ?")
            .unwrap();
        stmt.query_map(params![user_id], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    pub fn toggle_watched(&self, video_id: &str, user_id: i64) -> bool {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM watched WHERE video_id = ? AND user_id = ?",
                params![video_id, user_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            let _ = self.conn.execute(
                "DELETE FROM watched WHERE video_id = ? AND user_id = ?",
                params![video_id, user_id],
            );
            false
        } else {
            let _ = self.conn.execute(
                "INSERT INTO watched (video_id, user_id) VALUES (?, ?)",
                params![video_id, user_id],
            );
            true
        }
    }

    pub fn mark_channel_all_watched(&self, video_ids: &[String], user_id: i64) -> usize {
        if video_ids.is_empty() {
            return 0;
        }
        let mut count = 0;
        for id in video_ids {
            let result = self.conn.execute(
                "INSERT OR IGNORE INTO watched (video_id, user_id) VALUES (?, ?)",
                params![id, user_id],
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
                "INSERT INTO videos (id, title, url, is_short, channel_name, channel_id, published_date, duration, view_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   duration = COALESCE(excluded.duration, duration),
                   view_count = COALESCE(excluded.view_count, view_count)",
                params![
                    v.id,
                    v.title,
                    v.url,
                    v.is_short as i32,
                    v.channel_name,
                    v.channel_id,
                    pub_date,
                    v.duration,
                    v.view_count.map(|c| c as i64),
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
            "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at, duration, view_count FROM videos WHERE channel_id = ? ORDER BY published_date DESC"
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
        hide_shorts: bool,
    ) -> PaginatedResult {
        let safe_page_size = page_size.clamp(1, 1000);
        let offset = page * safe_page_size;
        let short_filter = if hide_shorts { " AND is_short = 0" } else { "" };

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
                "SELECT COUNT(*) FROM videos WHERE channel_id IN ({}){}",
                ph_str, short_filter
            );
            let mut count_stmt = self.conn.prepare(&count_sql).unwrap();
            let total: usize = count_stmt
                .query_row(rusqlite::params_from_iter(ids.iter()), |row| row.get(0))
                .unwrap_or(0);

            let select_sql = format!(
                "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at, duration, view_count FROM videos WHERE channel_id IN ({}){} ORDER BY published_date DESC LIMIT ?{} OFFSET ?{}",
                ph_str, short_filter,
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
            let count_sql = format!("SELECT COUNT(*) FROM videos WHERE 1=1{}", short_filter);
            let total: usize = self
                .conn
                .query_row(&count_sql, [], |row| row.get(0))
                .unwrap_or(0);

            let select_sql = format!(
                "SELECT id, title, url, is_short, channel_name, channel_id, published_date, stored_at, duration, view_count FROM videos WHERE 1=1{} ORDER BY published_date DESC LIMIT ? OFFSET ?",
                short_filter
            );
            let mut stmt = self.conn.prepare(&select_sql).unwrap();
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

    pub fn update_channel_last_viewed(&self, channel_id: &str, user_id: i64) {
        let now = Utc::now().to_rfc3339();
        let _ = self.conn.execute(
            "DELETE FROM channel_views WHERE channel_id = ? AND user_id = ?",
            params![channel_id, user_id],
        );
        let _ = self.conn.execute(
            "INSERT INTO channel_views (channel_id, last_viewed_at, user_id) VALUES (?, ?, ?)",
            params![channel_id, now, user_id],
        );
    }

    pub fn mark_all_channels_viewed(&self, channel_ids: &[String], user_id: i64) {
        let now = Utc::now().to_rfc3339();
        for id in channel_ids {
            let _ = self.conn.execute(
                "DELETE FROM channel_views WHERE channel_id = ? AND user_id = ?",
                params![id, user_id],
            );
            let _ = self.conn.execute(
                "INSERT INTO channel_views (channel_id, last_viewed_at, user_id) VALUES (?, ?, ?)",
                params![id, now, user_id],
            );
        }
    }

    pub fn get_new_video_counts(&self, hide_shorts: bool, user_id: i64) -> HashMap<String, usize> {
        let short_filter = if hide_shorts {
            "AND v.is_short = 0"
        } else {
            ""
        };
        let now = Utc::now().to_rfc3339();
        let sql = format!(
            "SELECT v.channel_id, COUNT(*) as count FROM videos v
             LEFT JOIN channel_views cv ON v.channel_id = cv.channel_id AND cv.user_id = ?1
             WHERE v.published_date IS NOT NULL AND v.channel_id IS NOT NULL {}
               AND (cv.last_viewed_at IS NULL OR v.published_date > cv.last_viewed_at)
               AND v.published_date <= ?2
             GROUP BY v.channel_id",
            short_filter
        );
        let mut stmt = self.conn.prepare(&sql).unwrap();
        stmt.query_map(params![user_id, now], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, usize>(1)?,
            ))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn get_channel_stats(&self, hide_shorts: bool) -> HashMap<String, ChannelStats> {
        let short_filter = if hide_shorts {
            "WHERE v.is_short = 0"
        } else {
            ""
        };
        let sql = format!(
            "SELECT v.channel_id, COUNT(*) as cnt, MAX(v.published_date) as latest
             FROM videos v {}
             GROUP BY v.channel_id",
            short_filter
        );
        let mut stmt = self.conn.prepare(&sql).unwrap();
        stmt.query_map([], |row| {
            let channel_id: String = row.get(0)?;
            let video_count: usize = row.get(1)?;
            let latest_date: Option<String> = row.get(2)?;
            Ok((channel_id, ChannelStats { video_count, latest_date }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn get_fully_watched_channels(&self, hide_shorts: bool, user_id: i64) -> HashSet<String> {
        let short_filter = if hide_shorts {
            "AND v.is_short = 0"
        } else {
            ""
        };
        let sql = format!(
            "SELECT v.channel_id, COUNT(*) as total, SUM(CASE WHEN w.video_id IS NOT NULL THEN 1 ELSE 0 END) as watched
             FROM videos v LEFT JOIN watched w ON v.id = w.video_id AND w.user_id = ?
             WHERE 1=1 {}
             GROUP BY v.channel_id HAVING total > 0 AND total = watched",
            short_filter
        );
        let mut stmt = self.conn.prepare(&sql).unwrap();
        stmt.query_map(params![user_id], |row| row.get::<_, String>(0))
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

    let duration: Option<i64> = row.get(8).unwrap_or(None);
    let duration_string = Some(format_duration(duration));
    let view_count: Option<i64> = row.get(9).unwrap_or(None);

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
        duration,
        duration_string,
        view_count: view_count.map(|c| c as u64),
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── format_duration tests ─────────────────────────────────

    #[test]
    fn test_format_duration_none() {
        assert_eq!(format_duration(None), "--:--");
    }

    #[test]
    fn test_format_duration_zero() {
        assert_eq!(format_duration(Some(0)), "--:--");
    }

    #[test]
    fn test_format_duration_seconds_only() {
        assert_eq!(format_duration(Some(45)), "0:45");
    }

    #[test]
    fn test_format_duration_minutes_and_seconds() {
        assert_eq!(format_duration(Some(125)), "2:05");
    }

    #[test]
    fn test_format_duration_exact_minute() {
        assert_eq!(format_duration(Some(60)), "1:00");
    }

    #[test]
    fn test_format_duration_with_hours() {
        assert_eq!(format_duration(Some(3661)), "1:01:01");
    }

    #[test]
    fn test_format_duration_large() {
        assert_eq!(format_duration(Some(7200)), "2:00:00");
    }

    // ── format_views tests ────────────────────────────────────

    #[test]
    fn test_format_views_none() {
        assert_eq!(format_views(None), "");
    }

    #[test]
    fn test_format_views_small() {
        assert_eq!(format_views(Some(500)), "500");
    }

    #[test]
    fn test_format_views_thousands() {
        assert_eq!(format_views(Some(1_500)), "1K");
    }

    #[test]
    fn test_format_views_exact_thousand() {
        assert_eq!(format_views(Some(1_000)), "1K");
    }

    #[test]
    fn test_format_views_millions() {
        assert_eq!(format_views(Some(2_500_000)), "2.5M");
    }

    #[test]
    fn test_format_views_exact_million() {
        assert_eq!(format_views(Some(1_000_000)), "1.0M");
    }

    #[test]
    fn test_format_views_zero() {
        assert_eq!(format_views(Some(0)), "0");
    }

    #[test]
    fn test_format_views_999() {
        assert_eq!(format_views(Some(999)), "999");
    }

    // ── decode_xml_entities tests ─────────────────────────────

    #[test]
    fn test_decode_xml_entities_amp() {
        assert_eq!(decode_xml_entities("foo &amp; bar"), "foo & bar");
    }

    #[test]
    fn test_decode_xml_entities_lt_gt() {
        assert_eq!(decode_xml_entities("&lt;b&gt;"), "<b>");
    }

    #[test]
    fn test_decode_xml_entities_quotes() {
        assert_eq!(decode_xml_entities("&quot;hello&quot;"), "\"hello\"");
    }

    #[test]
    fn test_decode_xml_entities_apos() {
        assert_eq!(decode_xml_entities("it&#39;s"), "it's");
        assert_eq!(decode_xml_entities("it&apos;s"), "it's");
    }

    #[test]
    fn test_decode_xml_entities_no_entities() {
        assert_eq!(decode_xml_entities("plain text"), "plain text");
    }

    #[test]
    fn test_decode_xml_entities_multiple() {
        assert_eq!(
            decode_xml_entities("&lt;a&gt; &amp; &lt;b&gt;"),
            "<a> & <b>"
        );
    }

    // ── get_relative_date tests ───────────────────────────────

    #[test]
    fn test_relative_date_minutes() {
        let date = Utc::now() - chrono::Duration::minutes(5);
        assert_eq!(get_relative_date(date), "5m ago");
    }

    #[test]
    fn test_relative_date_one_minute() {
        let date = Utc::now() - chrono::Duration::seconds(30);
        assert_eq!(get_relative_date(date), "1m ago");
    }

    #[test]
    fn test_relative_date_hours() {
        let date = Utc::now() - chrono::Duration::hours(3);
        assert_eq!(get_relative_date(date), "3h ago");
    }

    #[test]
    fn test_relative_date_one_day() {
        let date = Utc::now() - chrono::Duration::days(1);
        assert_eq!(get_relative_date(date), "1d ago");
    }

    #[test]
    fn test_relative_date_days() {
        let date = Utc::now() - chrono::Duration::days(5);
        assert_eq!(get_relative_date(date), "5d ago");
    }

    #[test]
    fn test_relative_date_weeks() {
        let date = Utc::now() - chrono::Duration::days(14);
        assert_eq!(get_relative_date(date), "2w ago");
    }

    #[test]
    fn test_relative_date_months() {
        let date = Utc::now() - chrono::Duration::days(60);
        assert_eq!(get_relative_date(date), "2mo ago");
    }

    #[test]
    fn test_relative_date_years() {
        let date = Utc::now() - chrono::Duration::days(400);
        assert_eq!(get_relative_date(date), "1y ago");
    }

    #[test]
    fn test_relative_date_future() {
        let date = Utc::now() + chrono::Duration::hours(1);
        assert_eq!(get_relative_date(date), "upcoming");
    }

    // ── Database CRUD tests ───────────────────────────────────

    fn test_db() -> Database {
        Database::open_in_memory().expect("Failed to open in-memory db")
    }

    fn make_sub(id: &str, name: &str) -> Subscription {
        Subscription {
            id: id.to_string(),
            name: name.to_string(),
            url: format!("https://youtube.com/channel/{}", id),
            added_at: None,
        }
    }

    fn make_video(id: &str, channel_id: &str) -> Video {
        Video {
            id: id.to_string(),
            title: format!("Video {}", id),
            url: format!("https://youtube.com/watch?v={}", id),
            is_short: false,
            channel_name: Some("TestChannel".to_string()),
            channel_id: Some(channel_id.to_string()),
            published_date: Some(Utc::now()),
            stored_at: None,
            relative_date: "1h ago".to_string(),
            duration: None,
            duration_string: None,
            view_count: None,
        }
    }

    #[test]
    fn test_add_and_get_subscriptions() {
        let db = test_db();
        let sub = make_sub("ch1", "Channel One");
        db.add_subscription(&sub, 1).unwrap();

        let subs = db.get_subscriptions(1);
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0].name, "Channel One");
        assert_eq!(subs[0].id, "ch1");
    }

    #[test]
    fn test_add_duplicate_subscription() {
        let db = test_db();
        let sub = make_sub("ch1", "Channel One");
        db.add_subscription(&sub, 1).unwrap();
        let result = db.add_subscription(&sub, 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn test_remove_subscription() {
        let db = test_db();
        let sub = make_sub("ch1", "Channel One");
        db.add_subscription(&sub, 1).unwrap();
        db.remove_subscription("ch1", 1).unwrap();

        let subs = db.get_subscriptions(1);
        assert_eq!(subs.len(), 0);
    }

    #[test]
    fn test_remove_nonexistent_subscription() {
        let db = test_db();
        let result = db.remove_subscription("nonexistent", 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_subscriptions_ordered_case_insensitive() {
        let db = test_db();
        db.add_subscription(&make_sub("c1", "Zeta"), 1).unwrap();
        db.add_subscription(&make_sub("c2", "alpha"), 1).unwrap();
        db.add_subscription(&make_sub("c3", "Beta"), 1).unwrap();

        let subs = db.get_subscriptions(1);
        assert_eq!(subs[0].name, "alpha");
        assert_eq!(subs[1].name, "Beta");
        assert_eq!(subs[2].name, "Zeta");
    }

    #[test]
    fn test_store_and_get_videos() {
        let db = test_db();
        let videos = vec![
            make_video("v1", "ch1"),
            make_video("v2", "ch1"),
            make_video("v3", "ch2"),
        ];
        let stored = db.store_videos(&videos);
        assert_eq!(stored, 3);

        let ch1_videos = db.get_stored_videos("ch1");
        assert_eq!(ch1_videos.len(), 2);

        let ch2_videos = db.get_stored_videos("ch2");
        assert_eq!(ch2_videos.len(), 1);
    }

    #[test]
    fn test_store_videos_deduplication() {
        let db = test_db();
        let videos = vec![make_video("v1", "ch1")];
        db.store_videos(&videos);
        let stored = db.store_videos(&videos); // same video again
        assert_eq!(stored, 1); // upsert touches the row
    }

    #[test]
    fn test_store_empty_videos() {
        let db = test_db();
        let stored = db.store_videos(&[]);
        assert_eq!(stored, 0);
    }

    #[test]
    fn test_watched_operations() {
        let db = test_db();
        let ids = db.get_watched_ids(1);
        assert!(ids.is_empty());

        db.mark_as_watched("v1", 1);
        let ids = db.get_watched_ids(1);
        assert!(ids.contains("v1"));
        assert_eq!(ids.len(), 1);
    }

    #[test]
    fn test_toggle_watched() {
        let db = test_db();

        let now_watched = db.toggle_watched("v1", 1);
        assert!(now_watched);
        assert!(db.get_watched_ids(1).contains("v1"));

        let now_watched = db.toggle_watched("v1", 1);
        assert!(!now_watched);
        assert!(!db.get_watched_ids(1).contains("v1"));
    }

    #[test]
    fn test_mark_channel_all_watched() {
        let db = test_db();
        let ids = vec!["v1".to_string(), "v2".to_string(), "v3".to_string()];
        let count = db.mark_channel_all_watched(&ids, 1);
        assert_eq!(count, 3);

        let watched = db.get_watched_ids(1);
        assert_eq!(watched.len(), 3);

        // Marking again should add 0
        let count = db.mark_channel_all_watched(&ids, 1);
        assert_eq!(count, 0);
    }

    #[test]
    fn test_mark_channel_all_watched_empty() {
        let db = test_db();
        let count = db.mark_channel_all_watched(&[], 1);
        assert_eq!(count, 0);
    }

    #[test]
    fn test_settings_defaults() {
        let db = test_db();
        let settings = db.get_settings(1);
        assert_eq!(settings.player, "mpv");
        assert_eq!(settings.videos_per_channel, 15);
        assert!(settings.hide_shorts);
        assert_eq!(settings.max_resolution, "1080");
    }

    #[test]
    fn test_update_and_get_settings() {
        let db = test_db();
        db.update_setting("player", "\"vlc\"", 1);
        db.update_setting("hideShorts", "false", 1);

        let settings = db.get_settings(1);
        assert_eq!(settings.player, "vlc");
        assert!(!settings.hide_shorts);
    }

    #[test]
    fn test_max_resolution_setting() {
        let db = test_db();
        let settings = db.get_settings(1);
        assert_eq!(settings.max_resolution, "1080");

        db.update_setting("maxResolution", "\"max\"", 1);
        let settings = db.get_settings(1);
        assert_eq!(settings.max_resolution, "max");

        db.update_setting("maxResolution", "\"1080\"", 1);
        let settings = db.get_settings(1);
        assert_eq!(settings.max_resolution, "1080");
    }

    #[test]
    fn test_paginated_videos() {
        let db = test_db();
        let mut videos = Vec::new();
        for i in 0..25 {
            let mut v = make_video(&format!("v{}", i), "ch1");
            v.published_date = Some(Utc::now() - chrono::Duration::hours(i as i64));
            videos.push(v);
        }
        db.store_videos(&videos);

        let ids = vec!["ch1".to_string()];
        let page0 = db.get_stored_videos_paginated(Some(&ids), 0, 10, false);
        assert_eq!(page0.total, 25);
        assert_eq!(page0.videos.len(), 10);
        assert_eq!(page0.page, 0);
        assert_eq!(page0.page_size, 10);

        let page1 = db.get_stored_videos_paginated(Some(&ids), 1, 10, false);
        assert_eq!(page1.videos.len(), 10);

        let page2 = db.get_stored_videos_paginated(Some(&ids), 2, 10, false);
        assert_eq!(page2.videos.len(), 5);
    }

    #[test]
    fn test_paginated_videos_no_channels() {
        let db = test_db();
        let result = db.get_stored_videos_paginated(Some(&[]), 0, 10, false);
        assert_eq!(result.total, 0);
        assert!(result.videos.is_empty());
    }

    #[test]
    fn test_paginated_videos_all() {
        let db = test_db();
        let videos = vec![make_video("v1", "ch1"), make_video("v2", "ch2")];
        db.store_videos(&videos);

        let result = db.get_stored_videos_paginated(None, 0, 10, false);
        assert_eq!(result.total, 2);
        assert_eq!(result.videos.len(), 2);
    }

    #[test]
    fn test_channel_views() {
        let db = test_db();
        db.add_subscription(&make_sub("ch1", "Channel"), 1).unwrap();

        // Store a video with a recent date
        let mut video = make_video("v1", "ch1");
        video.published_date = Some(Utc::now());
        db.store_videos(&[video]);

        // Before viewing, should have new count
        let counts = db.get_new_video_counts(false, 1);
        assert!(counts.get("ch1").copied().unwrap_or(0) > 0);

        db.update_channel_last_viewed("ch1", 1);
        let counts = db.get_new_video_counts(false, 1);
        assert_eq!(counts.get("ch1").copied().unwrap_or(0), 0);
    }

    #[test]
    fn test_mark_all_channels_viewed() {
        let db = test_db();
        let ids = vec!["ch1".to_string(), "ch2".to_string()];
        db.mark_all_channels_viewed(&ids, 1);

        let counts = db.get_new_video_counts(false, 1);
        assert!(counts.is_empty());
    }

    #[test]
    fn test_fully_watched_channels() {
        let db = test_db();
        let videos = vec![make_video("v1", "ch1"), make_video("v2", "ch1")];
        db.store_videos(&videos);

        let fully = db.get_fully_watched_channels(false, 1);
        assert!(!fully.contains("ch1"));

        db.mark_as_watched("v1", 1);
        db.mark_as_watched("v2", 1);
        let fully = db.get_fully_watched_channels(false, 1);
        assert!(fully.contains("ch1"));
    }

    #[test]
    fn test_fully_watched_channels_with_shorts_hidden() {
        let db = test_db();
        let v1 = make_video("v1", "ch1");
        let mut v2 = make_video("v2", "ch1");
        v2.is_short = true;
        db.store_videos(&[v1, v2]);

        db.mark_as_watched("v1", 1);
        let fully = db.get_fully_watched_channels(true, 1);
        assert!(fully.contains("ch1"));

        let fully = db.get_fully_watched_channels(false, 1);
        assert!(!fully.contains("ch1"));
    }

    #[test]
    fn test_hydrate_video_various_date_formats() {
        let db = test_db();
        // Store a video via raw SQL with different date format
        db.conn.execute(
            "INSERT INTO videos (id, title, url, is_short, channel_name, channel_id, published_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params!["v1", "Test", "https://youtube.com/watch?v=v1", 0, "Ch", "ch1", "2024-01-15T10:30:00+00:00"],
        ).unwrap();

        let videos = db.get_stored_videos("ch1");
        assert_eq!(videos.len(), 1);
        assert!(videos[0].published_date.is_some());
    }

    #[test]
    fn test_upsert_metadata() {
        let db = test_db();
        let mut v = make_video("v1", "ch1");
        v.duration = Some(120);
        v.view_count = Some(5000);
        db.store_videos(&[v]);

        let videos = db.get_stored_videos("ch1");
        assert_eq!(videos[0].duration, Some(120));
        assert_eq!(videos[0].view_count, Some(5000));
        assert_eq!(videos[0].duration_string.as_deref(), Some("2:00"));
    }

    #[test]
    fn test_null_doesnt_clobber_metadata() {
        let db = test_db();
        // First store with metadata
        let mut v = make_video("v1", "ch1");
        v.duration = Some(300);
        v.view_count = Some(10000);
        db.store_videos(&[v]);

        // Re-store same video without metadata (like RSS would)
        let v2 = make_video("v1", "ch1");
        assert!(v2.duration.is_none());
        assert!(v2.view_count.is_none());
        db.store_videos(&[v2]);

        // Original metadata should be preserved
        let videos = db.get_stored_videos("ch1");
        assert_eq!(videos[0].duration, Some(300));
        assert_eq!(videos[0].view_count, Some(10000));
    }

    #[test]
    fn test_get_channel_stats() {
        let db = test_db();
        let mut v1 = make_video("v1", "ch1");
        v1.published_date = Some(Utc::now() - chrono::Duration::days(2));
        let mut v2 = make_video("v2", "ch1");
        v2.published_date = Some(Utc::now() - chrono::Duration::days(1));
        let mut v3 = make_video("v3", "ch2");
        v3.published_date = Some(Utc::now());
        db.store_videos(&[v1, v2, v3]);

        let stats = db.get_channel_stats(false);
        assert_eq!(stats.get("ch1").unwrap().video_count, 2);
        assert!(stats.get("ch1").unwrap().latest_date.is_some());
        assert_eq!(stats.get("ch2").unwrap().video_count, 1);
    }

    #[test]
    fn test_get_channel_stats_hides_shorts() {
        let db = test_db();
        let v1 = make_video("v1", "ch1");
        let mut v2 = make_video("v2", "ch1");
        v2.is_short = true;
        db.store_videos(&[v1, v2]);

        let stats = db.get_channel_stats(true);
        assert_eq!(stats.get("ch1").unwrap().video_count, 1);

        let stats = db.get_channel_stats(false);
        assert_eq!(stats.get("ch1").unwrap().video_count, 2);
    }
}
