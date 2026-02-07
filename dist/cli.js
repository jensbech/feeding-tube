#!/usr/bin/env node

// src/cli.jsx
import React10 from "react";
import { render } from "ink";
import { MouseProvider } from "@ink-tools/ink-mouse";
import meow from "meow";
import readline from "readline";

// src/App.jsx
import React9, { useState as useState5, useRef as useRef4 } from "react";
import { Box as Box8, useApp } from "ink";

// src/screens/ChannelList.jsx
import React4, { useState as useState2, useEffect as useEffect2, memo, useCallback as useCallback3 } from "react";
import { Box as Box4, Text as Text3, useInput, useStdout as useStdout2 } from "ink";
import TextInput from "ink-text-input";

// src/components/Header.jsx
import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

// src/lib/ui.js
import { useState, useEffect, useCallback } from "react";
import { useStdout } from "ink";
function useTerminalWidth(minWidth = 60, margin = 5) {
  const { stdout } = useStdout();
  return Math.max((stdout?.columns || 80) - margin, minWidth);
}
function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "\u2026" : text;
}
function pad(text, width) {
  if (!text) return " ".repeat(width);
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}
function formatViews(count) {
  if (!count && count !== 0) return "";
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(0)}K`;
  return String(count);
}
function useAutoHideMessage(initialValue = null, timeout = 3e3) {
  const [message, setMessage] = useState(initialValue);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [message, error, timeout]);
  return { message, setMessage, error, setError };
}
function calculateVisibleRows(terminalHeight, reservedRows = 6) {
  return Math.max(5, Math.floor((terminalHeight - reservedRows) * 0.95));
}

// src/components/Header.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ title, subtitle, loading, loadingMessage, hideShorts }) {
  const width = useTerminalWidth();
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: "youtube-cli" }),
      title && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { color: "gray", children: " - " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: title })
      ] }),
      subtitle && /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
        " (",
        subtitle,
        ")"
      ] }),
      hideShorts !== void 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { color: "gray", children: " \u2502 " }),
        /* @__PURE__ */ jsxs(Text, { color: hideShorts ? "yellow" : "gray", children: [
          "shorts ",
          hideShorts ? "hidden" : "shown"
        ] })
      ] }),
      loading && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { color: "gray", children: " \u2502 " }),
        /* @__PURE__ */ jsx(Text, { color: "cyan", children: /* @__PURE__ */ jsx(Spinner, { type: "dots" }) }),
        loadingMessage && /* @__PURE__ */ jsxs(Text, { color: "green", children: [
          " ",
          loadingMessage
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "gray", children: "\u2500".repeat(width) }) })
  ] });
}

// src/components/StatusBar.jsx
import React2, { useRef } from "react";
import { Box as Box2, Text as Text2 } from "ink";
import { useOnClick } from "@ink-tools/ink-mouse";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function StatusBar({ children }) {
  const width = useTerminalWidth();
  return /* @__PURE__ */ jsxs2(Box2, { marginTop: 1, flexDirection: "column", children: [
    /* @__PURE__ */ jsx2(Box2, { children: /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "\u2500".repeat(width) }) }),
    /* @__PURE__ */ jsx2(Box2, { children })
  ] });
}
function KeyHint({ keyName, description, onClick }) {
  const ref = useRef(null);
  useOnClick(ref, onClick || (() => {
  }));
  return /* @__PURE__ */ jsxs2(Box2, { ref, marginRight: 2, children: [
    /* @__PURE__ */ jsxs2(Text2, { color: "yellow", children: [
      "(",
      keyName,
      ")"
    ] }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: description })
  ] });
}

// src/components/ClickableRow.jsx
import React3, { useRef as useRef2, useCallback as useCallback2 } from "react";
import { Box as Box3 } from "ink";
import { useOnClick as useOnClick2 } from "@ink-tools/ink-mouse";
import { jsx as jsx3 } from "react/jsx-runtime";
var DOUBLE_CLICK_THRESHOLD = 400;
var lastClickTime = 0;
var lastClickIndex = -1;
var clickLock = false;
function ClickableRow({ index, onSelect, onActivate, children }) {
  const ref = useRef2(null);
  const handleClick = useCallback2(() => {
    if (clickLock) return;
    clickLock = true;
    setTimeout(() => {
      clickLock = false;
    }, 50);
    const now = Date.now();
    const isDoubleClick = now - lastClickTime < DOUBLE_CLICK_THRESHOLD && lastClickIndex === index;
    if (isDoubleClick) {
      onActivate?.(index);
      lastClickTime = 0;
      lastClickIndex = -1;
    } else {
      onSelect?.(index);
      lastClickTime = now;
      lastClickIndex = index;
    }
  }, [index, onSelect, onActivate]);
  useOnClick2(ref, handleClick);
  return /* @__PURE__ */ jsx3(Box3, { ref, children });
}

// src/lib/db.js
import initSqlJs from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
var DB_DIR = join(homedir(), ".youtube-cli");
var DB_FILE = join(DB_DIR, "data.db");
var LEGACY_CONFIG_DIR = join(homedir(), ".config", "youtube-cli");
var db = null;
var SQL = null;
function requireDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}
function queryRows(sql, params = []) {
  const result = requireDb().exec(sql, params);
  return result.length ? result[0].values : [];
}
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function loadDbFromFile() {
  if (existsSync(DB_FILE)) {
    return readFileSync(DB_FILE);
  }
  return null;
}
function saveDbToFile() {
  if (!db) return;
  ensureDir(DB_DIR);
  const data = db.export();
  writeFileSync(DB_FILE, Buffer.from(data), { mode: 384 });
}
async function initDb() {
  if (db) return db;
  SQL = await initSqlJs();
  const data = loadDbFromFile();
  db = data ? new SQL.Database(data) : new SQL.Database();
  createSchema();
  await migrateFromJson();
  return db;
}
function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      is_short INTEGER DEFAULT 0,
      channel_name TEXT,
      channel_id TEXT,
      published_date TEXT,
      stored_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_date DESC)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS watched (
      video_id TEXT PRIMARY KEY,
      watched_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_views (
      channel_id TEXT PRIMARY KEY,
      last_viewed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
function hasMigration(name) {
  const result = db.exec(`SELECT 1 FROM migrations WHERE name = ?`, [name]);
  return result.length > 0 && result[0].values.length > 0;
}
function markMigration(name) {
  db.run(`INSERT OR REPLACE INTO migrations (name) VALUES (?)`, [name]);
  saveDbToFile();
}
async function migrateFromJson() {
  if (hasMigration("json_import")) return;
  const configFile = join(LEGACY_CONFIG_DIR, "subscriptions.json");
  const watchedFile = join(LEGACY_CONFIG_DIR, "watched.json");
  const videosFile = join(LEGACY_CONFIG_DIR, "videos.json");
  let imported = false;
  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(readFileSync(configFile, "utf-8"));
      if (config.subscriptions) {
        const stmt = db.prepare(`INSERT OR IGNORE INTO subscriptions (id, name, url) VALUES (?, ?, ?)`);
        for (const sub of config.subscriptions) {
          stmt.run([sub.id, sub.name, sub.url]);
        }
        stmt.free();
      }
      if (config.settings) {
        const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        for (const [key, val] of Object.entries(config.settings)) {
          stmt.run([key, JSON.stringify(val)]);
        }
        stmt.free();
      }
      if (config.channelLastViewed) {
        const stmt = db.prepare(`INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)`);
        for (const [channelId, timestamp] of Object.entries(config.channelLastViewed)) {
          stmt.run([channelId, timestamp]);
        }
        stmt.free();
      }
      imported = true;
    } catch {
    }
  }
  if (existsSync(watchedFile)) {
    try {
      const watched = JSON.parse(readFileSync(watchedFile, "utf-8"));
      if (watched.videos) {
        const stmt = db.prepare(`INSERT OR IGNORE INTO watched (video_id, watched_at) VALUES (?, ?)`);
        for (const [videoId, data] of Object.entries(watched.videos)) {
          stmt.run([videoId, data.watchedAt || (/* @__PURE__ */ new Date()).toISOString()]);
        }
        stmt.free();
      }
      imported = true;
    } catch {
    }
  }
  if (existsSync(videosFile)) {
    try {
      const store = JSON.parse(readFileSync(videosFile, "utf-8"));
      if (store.videos) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO videos (id, title, url, is_short, channel_name, channel_id, published_date, stored_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const video of Object.values(store.videos)) {
          stmt.run([
            video.id,
            video.title,
            video.url,
            video.isShort ? 1 : 0,
            video.channelName,
            video.channelId,
            video.publishedDate,
            video.storedAt || (/* @__PURE__ */ new Date()).toISOString()
          ]);
        }
        stmt.free();
      }
      imported = true;
    } catch {
    }
  }
  if (imported) {
    markMigration("json_import");
    const backupDir = join(LEGACY_CONFIG_DIR, "backup");
    ensureDir(backupDir);
    for (const file of [configFile, watchedFile, videosFile]) {
      if (existsSync(file)) {
        const backupPath = join(backupDir, basename(file));
        try {
          renameSync(file, backupPath);
        } catch {
        }
      }
    }
  } else {
    markMigration("json_import");
  }
}
async function getDb() {
  return await initDb();
}
function getSubscriptions() {
  return queryRows(`SELECT id, name, url, added_at FROM subscriptions ORDER BY name COLLATE NOCASE`).map(([id, name, url, addedAt]) => ({ id, name, url, addedAt }));
}
function addSubscription(subscription) {
  if (queryRows(`SELECT 1 FROM subscriptions WHERE id = ? OR url = ?`, [subscription.id, subscription.url]).length > 0) {
    return { success: false, error: "Subscription already exists" };
  }
  requireDb().run(`INSERT INTO subscriptions (id, name, url) VALUES (?, ?, ?)`, [subscription.id, subscription.name, subscription.url]);
  saveDbToFile();
  return { success: true };
}
function removeSubscription(identifier) {
  const database = requireDb();
  if (typeof identifier === "string") {
    if (queryRows(`SELECT id FROM subscriptions WHERE id = ?`, [identifier]).length === 0) {
      return { success: false, error: "Subscription not found" };
    }
    database.run(`DELETE FROM subscriptions WHERE id = ?`, [identifier]);
  } else {
    const subs = getSubscriptions();
    if (identifier < 0 || identifier >= subs.length) {
      return { success: false, error: "Invalid index" };
    }
    database.run(`DELETE FROM subscriptions WHERE id = ?`, [subs[identifier].id]);
  }
  saveDbToFile();
  return { success: true };
}
var DEFAULT_SETTINGS = {
  player: "mpv",
  videosPerChannel: 15,
  hideShorts: true
};
function getSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of queryRows(`SELECT key, value FROM settings`)) {
    try {
      settings[key] = JSON.parse(value);
    } catch {
      settings[key] = value;
    }
  }
  return settings;
}
function updateSettings(newSettings) {
  const stmt = requireDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(newSettings)) {
    stmt.run([key, JSON.stringify(value)]);
  }
  stmt.free();
  saveDbToFile();
  return getSettings();
}
function markAsWatched(videoId) {
  requireDb().run(`INSERT OR REPLACE INTO watched (video_id) VALUES (?)`, [videoId]);
  saveDbToFile();
}
function isWatched(videoId) {
  return queryRows(`SELECT 1 FROM watched WHERE video_id = ?`, [videoId]).length > 0;
}
function getWatchedIds() {
  return new Set(queryRows(`SELECT video_id FROM watched`).map(([id]) => id));
}
function toggleWatched(videoId) {
  const database = requireDb();
  if (isWatched(videoId)) {
    database.run(`DELETE FROM watched WHERE video_id = ?`, [videoId]);
    saveDbToFile();
    return false;
  }
  database.run(`INSERT INTO watched (video_id) VALUES (?)`, [videoId]);
  saveDbToFile();
  return true;
}
function markChannelAllWatched(videoIds) {
  if (!videoIds || videoIds.length === 0) return 0;
  const existingSet = new Set(
    queryRows(`SELECT video_id FROM watched WHERE video_id IN (${videoIds.map(() => "?").join(",")})`, videoIds).map(([id]) => id)
  );
  const stmt = requireDb().prepare(`INSERT OR IGNORE INTO watched (video_id) VALUES (?)`);
  let count = 0;
  for (const videoId of videoIds) {
    if (!existingSet.has(videoId)) {
      stmt.run([videoId]);
      count++;
    }
  }
  stmt.free();
  if (count > 0) saveDbToFile();
  return count;
}
function truncateStr(str, maxLen) {
  if (!str || typeof str !== "string") return str;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}
function storeVideos(videos) {
  if (!videos || !Array.isArray(videos)) return 0;
  const validVideos = videos.filter((v) => v && v.id && typeof v.id === "string");
  if (validVideos.length === 0) return 0;
  const existingSet = new Set(
    queryRows(`SELECT id FROM videos WHERE id IN (${validVideos.map(() => "?").join(",")})`, validVideos.map((v) => v.id)).map(([id]) => id)
  );
  const stmt = requireDb().prepare(`
    INSERT OR IGNORE INTO videos (id, title, url, is_short, channel_name, channel_id, published_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let newCount = 0;
  for (const video of validVideos) {
    if (existingSet.has(video.id)) continue;
    stmt.run([
      truncateStr(video.id, 64),
      truncateStr(video.title, 500) || "",
      truncateStr(video.url, 500) || "",
      video.isShort ? 1 : 0,
      truncateStr(video.channelName, 200) || null,
      truncateStr(video.channelId, 64) || null,
      video.publishedDate?.toISOString?.() || video.publishedDate || null
    ]);
    newCount++;
  }
  stmt.free();
  if (newCount > 0) saveDbToFile();
  return newCount;
}
function hydrateVideo(row) {
  const [id, title, url, isShort, channelName, channelId, publishedDate, storedAt] = row;
  return {
    id,
    title,
    url,
    isShort: !!isShort,
    channelName,
    channelId,
    publishedDate: publishedDate ? new Date(publishedDate) : null,
    storedAt
  };
}
var VIDEO_COLUMNS = "id, title, url, is_short, channel_name, channel_id, published_date, stored_at";
function getStoredVideos(channelId) {
  return queryRows(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE channel_id = ? ORDER BY published_date DESC`, [channelId]).map(hydrateVideo);
}
function getStoredVideosPaginated(channelIds = null, page = 0, pageSize = 100) {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 1e3);
  const offset = safePage * safePageSize;
  let total, videos;
  if (channelIds && Array.isArray(channelIds) && channelIds.length > 0) {
    const placeholders = channelIds.map(() => "?").join(",");
    total = queryRows(`SELECT COUNT(*) FROM videos WHERE channel_id IN (${placeholders})`, channelIds)[0]?.[0] || 0;
    videos = queryRows(
      `SELECT ${VIDEO_COLUMNS} FROM videos WHERE channel_id IN (${placeholders}) ORDER BY published_date DESC LIMIT ? OFFSET ?`,
      [...channelIds, safePageSize, offset]
    ).map(hydrateVideo);
  } else {
    total = queryRows(`SELECT COUNT(*) FROM videos`)[0]?.[0] || 0;
    videos = queryRows(
      `SELECT ${VIDEO_COLUMNS} FROM videos ORDER BY published_date DESC LIMIT ? OFFSET ?`,
      [safePageSize, offset]
    ).map(hydrateVideo);
  }
  return { total, page, pageSize, videos };
}
function updateChannelLastViewed(channelId) {
  requireDb().run(`INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)`, [channelId, (/* @__PURE__ */ new Date()).toISOString()]);
  saveDbToFile();
}
function markAllChannelsViewed(channelIds) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = requireDb().prepare(`INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)`);
  for (const channelId of channelIds) {
    stmt.run([channelId, now]);
  }
  stmt.free();
  saveDbToFile();
}
function getNewVideoCounts(hideShorts = false) {
  const shortFilter = hideShorts ? "AND v.is_short = 0" : "";
  const rows = queryRows(`
    SELECT v.channel_id, COUNT(*) as count FROM videos v
    LEFT JOIN channel_views cv ON v.channel_id = cv.channel_id
    WHERE v.published_date IS NOT NULL AND v.channel_id IS NOT NULL ${shortFilter}
      AND (cv.last_viewed_at IS NULL OR v.published_date > cv.last_viewed_at)
    GROUP BY v.channel_id
  `);
  return new Map(rows.map(([channelId, count]) => [channelId, count]));
}
function getFullyWatchedChannels(hideShorts = false) {
  const shortFilter = hideShorts ? "WHERE v.is_short = 0" : "";
  const rows = queryRows(`
    SELECT v.channel_id, COUNT(*) as total, SUM(CASE WHEN w.video_id IS NOT NULL THEN 1 ELSE 0 END) as watched
    FROM videos v LEFT JOIN watched w ON v.id = w.video_id ${shortFilter}
    GROUP BY v.channel_id HAVING total > 0 AND total = watched
  `);
  return new Set(rows.map(([channelId]) => channelId));
}
function closeDb() {
  if (db) {
    saveDbToFile();
    db.close();
    db = null;
  }
}

// src/lib/config.js
var initialized = false;
async function initConfig() {
  if (initialized) return;
  await getDb();
  initialized = true;
}
function ensureInit() {
  if (!initialized) {
    throw new Error("Config not initialized. Call initConfig() first.");
  }
}
function getSubscriptions2() {
  ensureInit();
  return getSubscriptions();
}
function addSubscription2(subscription) {
  ensureInit();
  return addSubscription(subscription);
}
function removeSubscription2(identifier) {
  ensureInit();
  return removeSubscription(identifier);
}
function getSettings2() {
  ensureInit();
  return getSettings();
}
function updateSettings2(newSettings) {
  ensureInit();
  return updateSettings(newSettings);
}
function markAsWatched2(videoId) {
  ensureInit();
  return markAsWatched(videoId);
}
function getWatchedIds2() {
  ensureInit();
  return getWatchedIds();
}
function toggleWatched2(videoId) {
  ensureInit();
  return toggleWatched(videoId);
}
function markChannelAllWatched2(videoIds) {
  ensureInit();
  return markChannelAllWatched(videoIds);
}
function storeVideos2(videos) {
  ensureInit();
  return storeVideos(videos);
}
function getStoredVideos2(channelId) {
  ensureInit();
  return getStoredVideos(channelId);
}
function getStoredVideosPaginated2(channelIds = null, page = 0, pageSize = 100) {
  ensureInit();
  return getStoredVideosPaginated(channelIds, page, pageSize);
}
function updateChannelLastViewed2(channelId) {
  ensureInit();
  return updateChannelLastViewed(channelId);
}
function markAllChannelsViewed2(channelIds) {
  ensureInit();
  return markAllChannelsViewed(channelIds);
}
function getNewVideoCounts2(hideShorts = false) {
  ensureInit();
  return getNewVideoCounts(hideShorts);
}
function getFullyWatchedChannels2(hideShorts = false) {
  ensureInit();
  return getFullyWatchedChannels(hideShorts);
}

// src/lib/ytdlp.js
import { execa } from "execa";

// src/lib/validation.js
var YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
var YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//,
  /^https?:\/\/(www\.)?youtube\.com\/@[\w.-]+/
];
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== "string") return false;
  return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}
function isValidVideoId(id) {
  if (!id || typeof id !== "string") return false;
  return YOUTUBE_VIDEO_ID_REGEX.test(id);
}
function sanitizeSearchQuery(query) {
  if (!query || typeof query !== "string") return "";
  return query.trim().slice(0, 500);
}
function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// src/lib/dateUtils.js
var OSLO_UTC_OFFSET_WINTER = 1 * 60 * 60 * 1e3;
var OSLO_UTC_OFFSET_SUMMER = 2 * 60 * 60 * 1e3;
function getOsloOffset(date) {
  const year = date.getUTCFullYear();
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  marchLastSunday.setUTCHours(1, 0, 0, 0);
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  octoberLastSunday.setUTCHours(1, 0, 0, 0);
  return date >= marchLastSunday && date < octoberLastSunday ? OSLO_UTC_OFFSET_SUMMER : OSLO_UTC_OFFSET_WINTER;
}
function getRelativeDateFromDate(date, now = /* @__PURE__ */ new Date()) {
  const osloOffset = getOsloOffset(now);
  const nowOslo = new Date(now.getTime() + osloOffset);
  const dateOslo = new Date(date.getTime() + osloOffset);
  const diffMs = nowOslo - dateOslo;
  if (diffMs < 0) return "upcoming";
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMs / 36e5);
  const diffDays = Math.floor(diffMs / 864e5);
  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
function parseDateYYYYMMDD(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  return new Date(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(4, 6), 10) - 1,
    parseInt(dateStr.slice(6, 8), 10)
  );
}
function formatDuration(seconds) {
  if (!seconds) return "--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
function decodeXMLEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

// src/lib/ytdlp.js
function addRelativeDate(video) {
  return {
    ...video,
    relativeDate: video.publishedDate ? getRelativeDateFromDate(video.publishedDate) : ""
  };
}
function parseRSSEntry(entry, channelId, channelName) {
  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
  const link = entry.match(/<link rel="alternate" href="([^"]+)"\/>/)?.[1];
  if (!videoId || !title) return null;
  const publishedDate = published ? new Date(published) : null;
  return {
    id: videoId,
    title: decodeXMLEntities(title),
    url: link || `https://www.youtube.com/watch?v=${videoId}`,
    isShort: link?.includes("/shorts/") ?? false,
    duration: null,
    durationString: "--:--",
    channelName,
    channelId,
    publishedDate,
    uploadDate: publishedDate ? formatDateYYYYMMDD(publishedDate) : null,
    relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : ""
  };
}
function parseRSSFeed(xml, channelId, channelName) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = parseRSSEntry(match[1], channelId, channelName);
    if (entry) entries.push(entry);
  }
  return entries;
}
async function fetchChannelRSS(channelId, channelName) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const { stdout } = await execa("curl", ["-s", rssUrl]);
    return parseRSSFeed(stdout, channelId, channelName);
  } catch {
    return [];
  }
}
async function fetchAllChannelsRSS(subscriptions) {
  if (subscriptions.length === 0) return [];
  const batchSize = 20;
  const allVideos = [];
  for (let i = 0; i < subscriptions.length; i += batchSize) {
    const batch = subscriptions.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((sub) => fetchChannelRSS(sub.id, sub.name))
    );
    allVideos.push(...results.flat());
  }
  return allVideos;
}
async function getChannelInfo(url) {
  const channelUrl = url.trim();
  if (!validateUrl(channelUrl)) throw new Error("Invalid URL format");
  if (!isValidYouTubeUrl(channelUrl)) throw new Error("Not a valid YouTube URL");
  const isVideoUrl = channelUrl.includes("/watch?") || channelUrl.includes("youtu.be/");
  try {
    const { stdout } = await execa("yt-dlp", [
      "--dump-json",
      "--playlist-items",
      "1",
      "--no-warnings",
      channelUrl
    ]);
    const data = JSON.parse(stdout);
    return {
      id: data.channel_id,
      name: data.channel || data.uploader,
      url: data.channel_url || (isVideoUrl ? `https://www.youtube.com/channel/${data.channel_id}` : channelUrl)
    };
  } catch (error) {
    throw new Error(`Failed to get channel info: ${error.message}`);
  }
}
async function getChannelVideos(channel, limit = 15) {
  const freshVideos = await fetchChannelRSS(channel.id, channel.name);
  storeVideos2(freshVideos);
  const storedVideos = getStoredVideos2(channel.id);
  const videoMap = /* @__PURE__ */ new Map();
  for (const v of storedVideos) videoMap.set(v.id, v);
  for (const v of freshVideos) videoMap.set(v.id, v);
  return Array.from(videoMap.values()).map(addRelativeDate).sort((a, b) => {
    if (!a.publishedDate || !b.publishedDate) return 0;
    return b.publishedDate.getTime() - a.publishedDate.getTime();
  });
}
async function refreshAllVideos(subscriptions) {
  const freshVideos = await fetchAllChannelsRSS(subscriptions);
  return freshVideos.length > 0 ? storeVideos2(freshVideos) : 0;
}
function getVideoPage(channelIds, page = 0, pageSize = 100) {
  const { total, videos } = getStoredVideosPaginated2(channelIds, page, pageSize);
  return { total, page, pageSize, videos: videos.map(addRelativeDate) };
}
async function searchYouTube(query, limit = 20) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) throw new Error("Search query cannot be empty");
  const safeLimit = Math.min(Math.max(1, limit), 50);
  try {
    const { stdout } = await execa("yt-dlp", [
      `ytsearch${safeLimit}:${sanitizedQuery}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings"
    ], { timeout: 3e4 });
    return stdout.trim().split("\n").filter(Boolean).map((line) => {
      const data = JSON.parse(line);
      const publishedDate = data.release_timestamp ? new Date(data.release_timestamp * 1e3) : data.timestamp ? new Date(data.timestamp * 1e3) : null;
      return {
        id: data.id,
        title: data.title,
        url: data.webpage_url || data.url || `https://www.youtube.com/watch?v=${data.id}`,
        channelName: data.channel || data.uploader || "Unknown",
        channelId: data.channel_id || null,
        duration: data.duration,
        durationString: data.duration_string || formatDuration(data.duration),
        viewCount: data.view_count,
        publishedDate,
        relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : ""
      };
    });
  } catch (error) {
    if (error.timedOut) throw new Error("Search timed out");
    throw new Error(`Search failed: ${error.message}`);
  }
}
async function getVideoDescription(videoId) {
  if (!isValidVideoId(videoId)) throw new Error("Invalid video ID format");
  try {
    const { stdout } = await execa("yt-dlp", [
      "--dump-json",
      "--no-warnings",
      "--extractor-args",
      "youtube:skip=dash,hls",
      `https://www.youtube.com/watch?v=${videoId}`
    ], { timeout: 15e3 });
    const data = JSON.parse(stdout);
    return {
      title: data.title || "",
      description: data.description || "No description available.",
      channelName: data.channel || data.uploader || "Unknown"
    };
  } catch (error) {
    if (error.timedOut) throw new Error("Request timed out");
    throw new Error(`Failed to get description: ${error.message}`);
  }
}
async function fetchWithRetry(args, maxRetries = 3, baseDelay = 1e3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { stdout } = await execa("yt-dlp", args, { timeout: 6e4 });
      return stdout;
    } catch (error) {
      lastError = error;
      const isThrottled = error.message?.includes("429") || error.message?.includes("Too Many Requests") || error.message?.includes("rate limit");
      const isTimeout = error.timedOut;
      if (attempt < maxRetries - 1 && (isThrottled || isTimeout)) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1e3;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
async function fetchVideoBatch(videoIds, channel, retries = 2) {
  const urls = videoIds.map((id) => `https://www.youtube.com/watch?v=${id}`);
  try {
    const stdout = await fetchWithRetry([
      "--dump-json",
      "--no-warnings",
      "--extractor-args",
      "youtube:skip=dash,hls",
      "--socket-timeout",
      "30",
      ...urls
    ], retries);
    return stdout.trim().split("\n").filter(Boolean).map((line) => {
      try {
        const data = JSON.parse(line);
        return {
          id: data.id,
          title: data.title,
          url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
          isShort: data.duration <= 60 || data.webpage_url?.includes("/shorts/"),
          duration: data.duration,
          channelName: channel.name,
          channelId: channel.id,
          publishedDate: parseDateYYYYMMDD(data.upload_date)
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
var WorkerPool = class {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  async run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }
  async processQueue() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      task().then(resolve).catch(reject).finally(() => {
        this.running--;
        this.processQueue();
      });
    }
  }
  async drain() {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
};
async function primeChannel(channel, onProgress) {
  let url = channel.url;
  if (!url.includes("/videos")) url = url.replace(/\/$/, "") + "/videos";
  const existingVideos = getStoredVideos2(channel.id);
  const existingIds = new Set(existingVideos.map((v) => v.id));
  let added = 0;
  let total = 0;
  let failed = 0;
  try {
    const listOut = await fetchWithRetry([
      "--flat-playlist",
      "--print",
      "%(id)s",
      "--no-warnings",
      "--extractor-args",
      "youtube:skip=dash,hls",
      "--playlist-end",
      "5000",
      url
    ], 3, 2e3);
    const videoIds = listOut.trim().split("\n").filter(Boolean);
    const newVideoIds = videoIds.filter((id) => !existingIds.has(id));
    total = videoIds.length;
    onProgress?.(0, newVideoIds.length);
    if (newVideoIds.length === 0) {
      return { added: 0, total, skipped: existingIds.size };
    }
    const CONCURRENCY = 50;
    const BATCH_SIZE = 5;
    const pool = new WorkerPool(CONCURRENCY);
    const batches = [];
    for (let i = 0; i < newVideoIds.length; i += BATCH_SIZE) {
      batches.push(newVideoIds.slice(i, i + BATCH_SIZE));
    }
    let processed = 0;
    const pendingStores = [];
    const batchPromises = batches.map(
      (batch, idx) => pool.run(async () => {
        const videos = await fetchVideoBatch(batch, channel);
        processed += batch.length;
        if (videos.length > 0) {
          pendingStores.push(videos);
          added += videos.length;
        } else {
          failed += batch.length;
        }
        if (idx % 10 === 0 || idx === batches.length - 1) {
          onProgress?.(Math.min(processed, newVideoIds.length), newVideoIds.length);
        }
        if (pendingStores.length >= 20) {
          const toStore = pendingStores.splice(0, pendingStores.length).flat();
          if (toStore.length > 0) storeVideos2(toStore);
        }
        return videos;
      })
    );
    await Promise.all(batchPromises);
    if (pendingStores.length > 0) {
      const remaining = pendingStores.flat();
      if (remaining.length > 0) storeVideos2(remaining);
    }
    onProgress?.(newVideoIds.length, newVideoIds.length);
    return { added, total, skipped: existingIds.size, failed: failed > 0 ? failed : void 0 };
  } catch (error) {
    if (added > 0) {
      return { added, total, skipped: existingIds.size, failed, error: error.message };
    }
    throw new Error(`Failed to prime channel: ${error.message}`);
  }
}

// src/screens/ChannelList.jsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var ChannelRow = memo(function ChannelRow2({ pointer, name, hasNew, isFullyWatched, isSelected }) {
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsxs3(Text3, { color: isSelected ? "cyan" : void 0, dimColor: isFullyWatched && !isSelected, children: [
      pointer,
      " ",
      name
    ] }),
    hasNew && /* @__PURE__ */ jsx4(Text3, { color: "green", children: " \u25CF" })
  ] });
});
function ChannelList({
  onSelectChannel,
  onBrowseAll,
  onGlobalSearch,
  onQuit,
  skipRefresh,
  onRefreshDone,
  savedIndex
}) {
  const [subscriptions, setSubscriptions] = useState2([]);
  const [selectedIndex, setSelectedIndex] = useState2(0);
  const [scrollOffset, setScrollOffset] = useState2(0);
  const [mode, setMode] = useState2("list");
  const [addUrl, setAddUrl] = useState2("");
  const [searchQuery, setSearchQuery] = useState2("");
  const [loading, setLoading] = useState2(false);
  const [loadingMessage, setLoadingMessage] = useState2("");
  const [pendingChannel, setPendingChannel] = useState2(null);
  const [newCounts, setNewCounts] = useState2(/* @__PURE__ */ new Map());
  const [fullyWatched, setFullyWatched] = useState2(/* @__PURE__ */ new Set());
  const [filterText, setFilterText] = useState2("");
  const [isFiltering, setIsFiltering] = useState2(false);
  const [hideShorts, setHideShorts] = useState2(() => getSettings2().hideShorts ?? true);
  const { message, setMessage, error, setError } = useAutoHideMessage();
  const { stdout } = useStdout2();
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);
  const filteredSubs = filterText ? subscriptions.filter((s) => s.name.toLowerCase().includes(filterText.toLowerCase())) : subscriptions;
  const visibleChannels = filteredSubs.slice(scrollOffset, scrollOffset + visibleCount);
  const resetScroll = () => {
    setSelectedIndex(0);
    setScrollOffset(0);
  };
  const refreshCounts = () => {
    setNewCounts(getNewVideoCounts2(hideShorts));
    setFullyWatched(getFullyWatchedChannels2(hideShorts));
  };
  useEffect2(() => {
    if (savedIndex > 0 && subscriptions.length > 0) {
      setSelectedIndex(savedIndex);
      if (savedIndex >= visibleCount) {
        setScrollOffset(savedIndex - Math.floor(visibleCount / 2));
      }
    }
  }, [savedIndex, subscriptions.length, visibleCount]);
  useEffect2(() => {
    const init = async () => {
      const subs = getSubscriptions2();
      setSubscriptions(subs);
      refreshCounts();
      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage("Checking for new videos...");
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage("");
        onRefreshDone?.();
        refreshCounts();
      }
    };
    init();
  }, []);
  useEffect2(() => {
    refreshCounts();
  }, [hideShorts]);
  const handleAddSubmit = async (url) => {
    if (!url.trim()) {
      setMode("list");
      return;
    }
    setLoading(true);
    setLoadingMessage("Fetching channel info...");
    setError(null);
    try {
      const channelInfo = await getChannelInfo(url);
      const result = addSubscription2(channelInfo);
      if (result.success) {
        setSubscriptions(getSubscriptions2());
        setMessage(`Added: ${channelInfo.name}`);
        setPendingChannel(channelInfo);
        setMode("confirm-prime");
      } else {
        setError(result.error);
        setMode("list");
      }
    } catch (err) {
      setError(err.message);
      setMode("list");
    } finally {
      setLoading(false);
      setAddUrl("");
    }
  };
  const handlePrime2 = async () => {
    if (!pendingChannel) return;
    setLoading(true);
    setLoadingMessage(`Priming ${pendingChannel.name}: 0/?`);
    setError(null);
    try {
      const result = await primeChannel(pendingChannel, (done, total) => {
        setLoadingMessage(`Priming ${pendingChannel.name}: ${done}/${total}`);
      });
      const skippedInfo = result.skipped ? ` (${result.skipped} already cached)` : "";
      setMessage(`Primed ${pendingChannel.name}: ${result.added} videos added${skippedInfo}`);
      refreshCounts();
    } catch (err) {
      setError(`Prime failed: ${err.message}`);
    } finally {
      setLoading(false);
      setPendingChannel(null);
      setMode("list");
    }
  };
  const handlePrimeAll = async () => {
    if (subscriptions.length === 0) return;
    setLoading(true);
    setMode("list");
    setError(null);
    let totalAdded = 0;
    let totalSkipped = 0;
    let failures = 0;
    for (let i = 0; i < subscriptions.length; i++) {
      const channel = subscriptions[i];
      setLoadingMessage(`Priming ${i + 1}/${subscriptions.length}: ${channel.name}`);
      try {
        const result = await primeChannel(channel, (done, total) => {
          setLoadingMessage(`Priming ${i + 1}/${subscriptions.length}: ${channel.name} (${done}/${total})`);
        });
        totalAdded += result.added;
        totalSkipped += result.skipped || 0;
      } catch {
        failures++;
      }
    }
    setLoading(false);
    setLoadingMessage("");
    refreshCounts();
    const failInfo = failures > 0 ? `, ${failures} failed` : "";
    setMessage(`Primed all: ${totalAdded} videos added (${totalSkipped} cached${failInfo})`);
  };
  const handleDelete = () => {
    if (filteredSubs.length === 0) return;
    const channel = filteredSubs[selectedIndex];
    const result = removeSubscription2(channel.id);
    if (result.success) {
      setSubscriptions(getSubscriptions2());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode("list");
  };
  const handleMarkChannelWatched = () => {
    if (filteredSubs.length === 0) return;
    const channel = filteredSubs[selectedIndex];
    const videos = getStoredVideos2(channel.id);
    const filteredVideos = hideShorts ? videos.filter((v) => !v.isShort) : videos;
    const count = markChannelAllWatched2(filteredVideos.map((v) => v.id));
    refreshCounts();
    setMessage(`Marked ${count} videos as watched in ${channel.name}`);
  };
  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings2({ hideShorts: newValue });
    setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
  };
  const handleRefresh = async () => {
    if (subscriptions.length === 0 || loading) return;
    setLoading(true);
    setLoadingMessage("Checking for new videos...");
    await refreshAllVideos(subscriptions);
    refreshCounts();
    setLoading(false);
    setLoadingMessage("");
    setMessage("Refreshed");
  };
  useInput((input, key) => {
    const blockingLoad = loading && ["add", "confirm-prime", "confirm-prime-all", "global-search"].includes(mode);
    if (blockingLoad) return;
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText("");
        resetScroll();
      } else if (key.return) setIsFiltering(false);
      else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        resetScroll();
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        resetScroll();
      }
      return;
    }
    if (mode === "add" && key.escape) {
      setMode("list");
      setAddUrl("");
      return;
    }
    if (mode === "global-search" && key.escape) {
      setMode("list");
      setSearchQuery("");
      return;
    }
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") handleDelete();
      else setMode("list");
      return;
    }
    if (mode === "confirm-prime") {
      if (input === "n" || input === "N") {
        setPendingChannel(null);
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) handlePrime2();
      return;
    }
    if (mode === "confirm-prime-all") {
      if (input === "n" || input === "N" || key.escape) setMode("list");
      else if (input === "y" || input === "Y" || key.return) handlePrimeAll();
      return;
    }
    if (mode === "confirm-mark-all") {
      if (input === "n" || input === "N") setMode("list");
      else if (input === "y" || input === "Y" || key.return) {
        markAllChannelsViewed2(subscriptions.map((s) => s.id));
        setNewCounts(/* @__PURE__ */ new Map());
        setMessage("Marked all channels as read");
        setMode("list");
      }
      return;
    }
    if (input === "q") onQuit();
    else if ((key.escape || input === "b") && filterText) {
      setFilterText("");
      resetScroll();
    } else if (input === "a") {
      setMode("add");
      setAddUrl("");
    } else if (input === "g") {
      setMode("global-search");
      setSearchQuery("");
    } else if (input === "/") setIsFiltering(true);
    else if (input === "d" && filteredSubs.length > 0) setMode("confirm-delete");
    else if (input === "v") onBrowseAll();
    else if (input === "r" && subscriptions.length > 0 && !loading) handleRefresh();
    else if (input === "s") handleToggleShorts();
    else if (input === "w" && filteredSubs.length > 0) handleMarkChannelWatched();
    else if (input === "p" && subscriptions.length > 0) setMode("confirm-prime-all");
    else if (input === "m") setMode("confirm-mark-all");
    else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) setScrollOffset(newIndex);
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredSubs.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return && filteredSubs.length > 0) {
      const channel = filteredSubs[selectedIndex];
      updateChannelLastViewed2(channel.id);
      setNewCounts((prev) => {
        const next = new Map(prev);
        next.delete(channel.id);
        return next;
      });
      onSelectChannel(channel, selectedIndex);
    }
  });
  const handleRowSelect = useCallback3((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);
  const handleRowActivate = useCallback3((visibleIndex) => {
    if (filteredSubs.length === 0 || mode !== "list") return;
    const actualIndex = scrollOffset + visibleIndex;
    const channel = filteredSubs[actualIndex];
    updateChannelLastViewed2(channel.id);
    setNewCounts((prev) => {
      const next = new Map(prev);
      next.delete(channel.id);
      return next;
    });
    onSelectChannel(channel, actualIndex);
  }, [filteredSubs, scrollOffset, mode, onSelectChannel]);
  const countText = `${subscriptions.length} subscription${subscriptions.length !== 1 ? "s" : ""}`;
  const filterInfo = filterText ? ` (filter: "${filterText}")` : "";
  const subtitle = `${countText}${filterInfo}`;
  return /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx4(
      Header,
      {
        title: "Channels",
        subtitle,
        loading,
        loadingMessage,
        hideShorts,
        onToggleShorts: handleToggleShorts
      }
    ),
    mode === "add" && /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Box4, { children: [
        /* @__PURE__ */ jsx4(Text3, { color: "cyan", children: "Enter channel URL: " }),
        /* @__PURE__ */ jsx4(TextInput, { value: addUrl, onChange: setAddUrl, onSubmit: handleAddSubmit, placeholder: "https://youtube.com/@channel" })
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "global-search" && /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Box4, { children: [
        /* @__PURE__ */ jsx4(Text3, { color: "cyan", children: "Search YouTube: " }),
        /* @__PURE__ */ jsx4(TextInput, { value: searchQuery, onChange: setSearchQuery, onSubmit: (q) => {
          if (q.trim()) {
            setMode("list");
            setSearchQuery("");
            onGlobalSearch(q.trim());
          } else setMode("list");
        }, placeholder: "enter search query" })
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "confirm-delete" && filteredSubs.length > 0 && /* @__PURE__ */ jsxs3(Text3, { color: "red", children: [
      'Delete "',
      filteredSubs[selectedIndex]?.name,
      '"? (y/N)'
    ] }),
    mode === "confirm-prime" && pendingChannel && /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Text3, { color: "cyan", children: [
        'Prime historical videos for "',
        pendingChannel.name,
        '"? (Y/n)'
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "This fetches all videos from the channel (may take a while)" })
    ] }),
    mode === "confirm-prime-all" && /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Text3, { color: "cyan", children: [
        "Prime historical videos for all ",
        subscriptions.length,
        " channels? (Y/n)"
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "This fetches all videos from every channel (may take a long time)" })
    ] }),
    mode === "confirm-mark-all" && /* @__PURE__ */ jsx4(Text3, { children: "Clear all new video indicators? (y/n)" }),
    mode === "list" && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: subscriptions.length === 0 ? /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "No subscriptions yet." }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press (a) to add a channel." })
    ] }) : visibleChannels.map((sub, index) => {
      const isSelected = scrollOffset + index === selectedIndex;
      return /* @__PURE__ */ jsx4(ClickableRow, { index, onSelect: handleRowSelect, onActivate: handleRowActivate, children: /* @__PURE__ */ jsx4(
        ChannelRow,
        {
          pointer: isSelected ? ">" : " ",
          name: sub.name,
          isSelected,
          hasNew: newCounts.get(sub.id) > 0,
          isFullyWatched: fullyWatched.has(sub.id)
        }
      ) }, sub.id);
    }) }),
    /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      error && /* @__PURE__ */ jsxs3(Text3, { color: "red", children: [
        "Error: ",
        error
      ] }),
      message && /* @__PURE__ */ jsx4(Text3, { color: "green", children: message }),
      /* @__PURE__ */ jsx4(StatusBar, { children: isFiltering ? /* @__PURE__ */ jsxs3(Text3, { children: [
        /* @__PURE__ */ jsx4(Text3, { color: "yellow", children: "Filter: " }),
        /* @__PURE__ */ jsx4(Text3, { children: filterText }),
        /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "_  (Enter to confirm, Esc to cancel)" })
      ] }) : mode === "list" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "a", description: "dd", onClick: () => {
          setMode("add");
          setAddUrl("");
        } }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "d", description: "elete", onClick: () => setMode("confirm-delete") }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "w", description: "atched", onClick: handleMarkChannelWatched }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "p", description: "rime all", onClick: () => setMode("confirm-prime-all") }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "v", description: "iew all", onClick: onBrowseAll }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "g", description: "lobal", onClick: () => {
          setMode("global-search");
          setSearchQuery("");
        } }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "/", description: " filter", onClick: () => setIsFiltering(true) }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "s", description: hideShorts ? " +shorts" : " -shorts", onClick: handleToggleShorts }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "r", description: "efresh", onClick: handleRefresh }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "q", description: "uit", onClick: onQuit })
      ] }) })
    ] })
  ] });
}

// src/screens/VideoList.jsx
import React7, { useState as useState3, useEffect as useEffect3, useCallback as useCallback4, useRef as useRef3 } from "react";
import { Box as Box6, Text as Text6, useInput as useInput2, useStdout as useStdout3 } from "ink";

// src/components/DescriptionPanel.jsx
import React5 from "react";
import { Box as Box5, Text as Text4 } from "ink";
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function DescriptionPanel({ loading, description, onClose }) {
  return /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, marginBottom: 1, children: [
    loading ? /* @__PURE__ */ jsx5(Text4, { color: "gray", children: "Loading description..." }) : description && /* @__PURE__ */ jsxs4(Fragment3, { children: [
      /* @__PURE__ */ jsx5(Box5, { marginBottom: 1, children: /* @__PURE__ */ jsx5(Text4, { bold: true, color: "cyan", children: description.title }) }),
      /* @__PURE__ */ jsx5(Box5, { marginBottom: 1, children: /* @__PURE__ */ jsx5(Text4, { color: "yellow", children: description.channelName }) }),
      /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsxs4(Text4, { wrap: "wrap", children: [
        description.description?.slice(0, 500),
        description.description?.length > 500 ? "..." : ""
      ] }) })
    ] }),
    /* @__PURE__ */ jsx5(Box5, { marginTop: 1, children: /* @__PURE__ */ jsx5(Text4, { color: "gray", children: "Press (i) to close" }) })
  ] });
}

// src/components/VideoRow.jsx
import React6, { memo as memo2 } from "react";
import { Text as Text5 } from "ink";
import { Fragment as Fragment4, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var VideoRow = memo2(function VideoRow2({
  pointer,
  channelText,
  titleText,
  metaText,
  extraText,
  isSelected,
  isWatched: isWatched2,
  showChannel = true
}) {
  const color = isSelected ? "cyan" : void 0;
  const dim = isWatched2 && !isSelected;
  return /* @__PURE__ */ jsxs5(Fragment4, { children: [
    /* @__PURE__ */ jsx6(Text5, { color, dimColor: dim, children: pointer }),
    showChannel && /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : "yellow", dimColor: dim, children: channelText }),
    /* @__PURE__ */ jsx6(Text5, { color, dimColor: dim, children: titleText }),
    /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : "gray", children: metaText }),
    extraText && /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : "magenta", children: extraText }),
    !isWatched2 && /* @__PURE__ */ jsx6(Text5, { color: "green", children: " \u25CF" })
  ] });
});
var VideoRow_default = VideoRow;

// src/lib/player.js
import { execa as execa2 } from "execa";
var SUPPORTED_PLAYERS = ["mpv", "iina", "vlc"];
var PLAYER_CONFIGS = {
  mpv: {
    args: ["--force-window=immediate", "--keep-open=no"]
  },
  iina: {
    args: ["--no-stdin"]
  },
  vlc: {
    args: ["--no-video-title-show"]
  }
};
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
async function checkPlayer(player) {
  try {
    await execa2("which", [player]);
    return true;
  } catch {
    return false;
  }
}
async function getAvailablePlayers() {
  const results = await Promise.all(
    SUPPORTED_PLAYERS.map(async (player) => ({
      player,
      available: await checkPlayer(player)
    }))
  );
  return results.filter((r) => r.available).map((r) => r.player);
}
async function autoDetectPlayer() {
  const available = await getAvailablePlayers();
  for (const player of SUPPORTED_PLAYERS) {
    if (available.includes(player)) {
      updateSettings2({ player });
      return player;
    }
  }
  return null;
}
function launchPlayer(player, args) {
  const subprocess = execa2(player, args, {
    stdio: "ignore",
    detached: true,
    reject: false
  });
  subprocess.unref();
  return subprocess;
}
async function playVideo(videoUrl, videoId) {
  let settings = getSettings2();
  let player = settings.player || "mpv";
  const id = videoId || extractVideoId(videoUrl);
  if (id) {
    markAsWatched2(id);
  }
  if (!await checkPlayer(player)) {
    const detected = await autoDetectPlayer();
    if (!detected) {
      return {
        success: false,
        error: "No video player found. Please install mpv, iina, or vlc."
      };
    }
    player = detected;
  }
  try {
    const config = PLAYER_CONFIGS[player];
    if (config) {
      launchPlayer(player, [...config.args, videoUrl]);
      return { success: true, player };
    }
    launchPlayer("open", [videoUrl]);
    return { success: true, player: "browser" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// src/screens/VideoList.jsx
import { Fragment as Fragment5, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState3([]);
  const [watchedIds, setWatchedIds] = useState3(() => getWatchedIds2());
  const [selectedIndex, setSelectedIndex] = useState3(0);
  const [scrollOffset, setScrollOffset] = useState3(0);
  const [loading, setLoading] = useState3(true);
  const [playing, setPlaying] = useState3(false);
  const [hideShorts, setHideShorts] = useState3(() => getSettings2().hideShorts ?? true);
  const [filterText, setFilterText] = useState3("");
  const [isFiltering, setIsFiltering] = useState3(false);
  const [currentPage, setCurrentPage] = useState3(0);
  const [totalVideos, setTotalVideos] = useState3(0);
  const [pageSize, setPageSize] = useState3(100);
  const [mode, setMode] = useState3("list");
  const [showDescription, setShowDescription] = useState3(false);
  const [description, setDescription] = useState3(null);
  const [loadingDescription, setLoadingDescription] = useState3(false);
  const { message, setMessage, error, setError } = useAutoHideMessage();
  const channelIdsRef = useRef3(null);
  const { stdout } = useStdout3();
  const terminalWidth = stdout?.columns || 80;
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);
  const filteredVideos = allVideos.filter((v) => {
    if (hideShorts && v.isShort) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return v.title?.toLowerCase().includes(search) || v.channelName?.toLowerCase().includes(search);
    }
    return true;
  });
  const visibleVideos = filteredVideos.slice(scrollOffset, scrollOffset + visibleCount);
  const totalPages = Math.ceil(totalVideos / pageSize);
  const resetScroll = () => {
    setSelectedIndex(0);
    setScrollOffset(0);
  };
  const initialLoad = useCallback4(async () => {
    setLoading(true);
    setError(null);
    setWatchedIds(getWatchedIds2());
    try {
      if (channel) {
        const channelVideos = await getChannelVideos(channel, getSettings2().videosPerChannel || 15);
        setAllVideos(channelVideos);
        setTotalVideos(channelVideos.length);
        setCurrentPage(0);
      } else {
        const subscriptions = getSubscriptions2();
        if (subscriptions.length === 0) {
          setAllVideos([]);
          setTotalVideos(0);
          setError("No subscriptions. Go back and add some channels first.");
        } else {
          channelIdsRef.current = subscriptions.map((s) => s.id);
          await refreshAllVideos(subscriptions);
          const result = getVideoPage(channelIdsRef.current, 0, 100);
          setAllVideos(result.videos);
          setTotalVideos(result.total);
          setPageSize(result.pageSize);
          setCurrentPage(0);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channel, setError]);
  const loadPage = useCallback4((page) => {
    if (!channelIdsRef.current || channel) return;
    const result = getVideoPage(channelIdsRef.current, page, 100);
    setAllVideos(result.videos);
    setTotalVideos(result.total);
    setSelectedIndex(0);
  }, [channel]);
  useEffect3(() => {
    initialLoad();
  }, [initialLoad]);
  useEffect3(() => {
    if (!loading && !channel && channelIdsRef.current && currentPage > 0) loadPage(currentPage);
  }, [currentPage, loading, channel, loadPage]);
  const handlePlay = async () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    if (!video?.url) {
      setError("No video selected");
      return;
    }
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds2());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  };
  const fetchDescription = async () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    setLoadingDescription(true);
    setShowDescription(true);
    setDescription(null);
    try {
      setDescription(await getVideoDescription(video.id));
    } catch (err) {
      setDescription({ title: video.title, description: `Error: ${err.message}`, channelName: video.channelName });
    } finally {
      setLoadingDescription(false);
    }
  };
  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings2({ hideShorts: newValue });
    resetScroll();
    setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
  };
  const handleToggleWatched = () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    const nowWatched = toggleWatched2(video.id);
    setWatchedIds(getWatchedIds2());
    setMessage(nowWatched ? "Marked as watched" : "Marked as unwatched");
  };
  useInput2((input, key) => {
    if (playing) return;
    if (loading && mode !== "list") return;
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText("");
        resetScroll();
      } else if (key.return) setIsFiltering(false);
      else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        resetScroll();
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        resetScroll();
      }
      return;
    }
    if (mode === "confirm-mark-all") {
      if (input === "n" || input === "N" || key.escape) setMode("list");
      else if (input === "y" || input === "Y" || key.return) {
        markChannelAllWatched2(allVideos.map((v) => v.id));
        setWatchedIds(getWatchedIds2());
        setMessage(`Marked ${allVideos.length} videos as watched`);
        setMode("list");
      }
      return;
    }
    if (key.escape || input === "b") {
      if (filterText) {
        setFilterText("");
        resetScroll();
      } else onBack();
    } else if (input === "q") process.exit(0);
    else if (input === "r" && !loading) {
      setScrollOffset(0);
      initialLoad();
    } else if (input === "s") handleToggleShorts();
    else if (input === "/") setIsFiltering(true);
    else if (input === "n" && !channel && currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
      resetScroll();
    } else if (input === "p" && !channel && currentPage > 0) {
      setCurrentPage((p) => p - 1);
      resetScroll();
    } else if (input === "w") handleToggleWatched();
    else if (input === "m" && channel && filteredVideos.length > 0) setMode("confirm-mark-all");
    else if (input === "i" && filteredVideos.length > 0) {
      if (showDescription) {
        setShowDescription(false);
        setDescription(null);
      } else fetchDescription();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) setScrollOffset(newIndex);
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredVideos.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return && !loading) handlePlay();
  });
  const handleRowSelect = useCallback4((vi) => setSelectedIndex(scrollOffset + vi), [scrollOffset]);
  const handleRowActivate = useCallback4(async (vi) => {
    if (filteredVideos.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + vi;
    const video = filteredVideos[actualIndex];
    if (!video?.url) return;
    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds2());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  }, [filteredVideos, scrollOffset, playing, loading, setMessage, setError]);
  const showChannel = !channel;
  const channelColWidth = showChannel ? 32 : 0;
  const dateColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - dateColWidth - 2;
  const title = channel ? channel.name : "All Videos";
  const filterInfo = filterText ? ` (filter: "${filterText}")` : "";
  const pageInfo = !channel && totalPages > 1 ? ` [${currentPage + 1}/${totalPages}]` : "";
  const subtitle = `${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}${filterInfo}${pageInfo}`;
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx7(Header, { title, subtitle, loading, loadingMessage: loading ? "Refreshing..." : "", hideShorts }),
    mode === "confirm-mark-all" && /* @__PURE__ */ jsxs6(Text6, { children: [
      "Mark all ",
      allVideos.length,
      " videos as watched? (y/n)"
    ] }),
    error && !filteredVideos.length && /* @__PURE__ */ jsx7(Text6, { color: "red", children: error }),
    !loading && filteredVideos.length === 0 && !error && /* @__PURE__ */ jsx7(Text6, { color: "gray", children: "No videos found." }),
    showDescription && /* @__PURE__ */ jsx7(DescriptionPanel, { loading: loadingDescription, description }),
    filteredVideos.length > 0 && !showDescription && /* @__PURE__ */ jsx7(Box6, { flexDirection: "column", children: visibleVideos.map((video, index) => {
      const actualIndex = scrollOffset + index;
      const isSelected = actualIndex === selectedIndex;
      const isWatched2 = watchedIds.has(video.id);
      const pointer = isSelected ? ">" : " ";
      const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : "";
      const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
      const dateText = "  " + pad(video.relativeDate || "", dateColWidth - 2);
      return /* @__PURE__ */ jsx7(ClickableRow, { index, onSelect: handleRowSelect, onActivate: handleRowActivate, children: /* @__PURE__ */ jsx7(VideoRow_default, { pointer, channelText, titleText, metaText: dateText, isSelected, isWatched: isWatched2, showChannel }) }, video.id);
    }) }),
    /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
      message && /* @__PURE__ */ jsx7(Text6, { color: "green", children: message }),
      error && filteredVideos.length > 0 && /* @__PURE__ */ jsx7(Text6, { color: "red", children: error }),
      /* @__PURE__ */ jsx7(StatusBar, { children: isFiltering ? /* @__PURE__ */ jsxs6(Text6, { children: [
        /* @__PURE__ */ jsx7(Text6, { color: "yellow", children: "Filter: " }),
        /* @__PURE__ */ jsx7(Text6, { children: filterText }),
        /* @__PURE__ */ jsx7(Text6, { color: "gray", children: "_  (Enter to confirm, Esc to cancel)" })
      ] }) : showDescription ? /* @__PURE__ */ jsx7(KeyHint, { keyName: "i", description: " close info", onClick: () => {
        setShowDescription(false);
        setDescription(null);
      } }) : /* @__PURE__ */ jsxs6(Fragment5, { children: [
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "Enter", description: " play", onClick: handlePlay }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "i", description: "nfo", onClick: fetchDescription }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "w", description: "atched", onClick: handleToggleWatched }),
        channel && /* @__PURE__ */ jsx7(KeyHint, { keyName: "m", description: "ark all", onClick: () => setMode("confirm-mark-all") }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "/", description: " filter", onClick: () => setIsFiltering(true) }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "s", description: hideShorts ? " +shorts" : " -shorts", onClick: handleToggleShorts }),
        !channel && totalPages > 1 && /* @__PURE__ */ jsxs6(Fragment5, { children: [
          /* @__PURE__ */ jsx7(KeyHint, { keyName: "n", description: "ext", onClick: () => {
            if (currentPage < totalPages - 1) {
              setCurrentPage((p) => p + 1);
              resetScroll();
            }
          } }),
          /* @__PURE__ */ jsx7(KeyHint, { keyName: "p", description: "rev", onClick: () => {
            if (currentPage > 0) {
              setCurrentPage((p) => p - 1);
              resetScroll();
            }
          } })
        ] }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "r", description: "efresh", onClick: () => {
          if (!loading) {
            setScrollOffset(0);
            initialLoad();
          }
        } }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "b", description: "ack", onClick: () => {
          if (filterText) {
            setFilterText("");
            resetScroll();
          } else onBack();
        } }),
        /* @__PURE__ */ jsx7(KeyHint, { keyName: "q", description: "uit", onClick: () => process.exit(0) })
      ] }) })
    ] })
  ] });
}

// src/screens/SearchResults.jsx
import React8, { useState as useState4, useEffect as useEffect4, useCallback as useCallback5 } from "react";
import { Box as Box7, Text as Text7, useInput as useInput3, useStdout as useStdout4 } from "ink";
import TextInput2 from "ink-text-input";
import { Fragment as Fragment6, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function SearchResults({ query, onBack }) {
  const [currentQuery, setCurrentQuery] = useState4(query);
  const [searchInput, setSearchInput] = useState4("");
  const [results, setResults] = useState4([]);
  const [watchedIds, setWatchedIds] = useState4(() => getWatchedIds2());
  const [selectedIndex, setSelectedIndex] = useState4(0);
  const [scrollOffset, setScrollOffset] = useState4(0);
  const [loading, setLoading] = useState4(true);
  const [playing, setPlaying] = useState4(false);
  const [mode, setMode] = useState4("list");
  const [showDescription, setShowDescription] = useState4(false);
  const [description, setDescription] = useState4(null);
  const [loadingDescription, setLoadingDescription] = useState4(false);
  const { message, setMessage, error, setError } = useAutoHideMessage();
  const { stdout } = useStdout4();
  const terminalWidth = stdout?.columns || 80;
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);
  const visibleVideos = results.slice(scrollOffset, scrollOffset + visibleCount);
  const resetScroll = () => {
    setSelectedIndex(0);
    setScrollOffset(0);
  };
  useEffect4(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      resetScroll();
      try {
        setResults(await searchYouTube(currentQuery, 50));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [currentQuery, setError]);
  const handlePlay = async () => {
    if (results.length === 0) return;
    const video = results[selectedIndex];
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds2());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  };
  const handleAddChannel = async () => {
    const video = results[selectedIndex];
    const subs = getSubscriptions2();
    if (subs.some((s) => s.id === video.channelId)) {
      setMessage(`Already subscribed to ${video.channelName}`);
      setMode("list");
      return;
    }
    const result = addSubscription2({
      id: video.channelId,
      name: video.channelName,
      url: `https://www.youtube.com/channel/${video.channelId}`
    });
    setMessage(result.success ? `Added: ${video.channelName}` : null);
    if (!result.success) setError(result.error);
    setMode("list");
  };
  const fetchDescription = async () => {
    if (results.length === 0) return;
    const video = results[selectedIndex];
    setLoadingDescription(true);
    setShowDescription(true);
    setDescription(null);
    try {
      setDescription(await getVideoDescription(video.id));
    } catch (err) {
      setDescription({ title: video.title, description: `Error: ${err.message}`, channelName: video.channelName });
    } finally {
      setLoadingDescription(false);
    }
  };
  const handleNewSearch = (newQuery) => {
    if (!newQuery.trim()) {
      setMode("list");
      return;
    }
    setCurrentQuery(newQuery.trim());
    setSearchInput("");
    setMode("list");
  };
  useInput3((input, key) => {
    if (playing) return;
    if (mode === "new-search") {
      if (key.escape) {
        setMode("list");
        setSearchInput("");
      }
      return;
    }
    if (loading) return;
    if (mode === "confirm-add") {
      if (input === "n" || input === "N" || key.escape) setMode("list");
      else if (input === "y" || input === "Y" || key.return) handleAddChannel();
      return;
    }
    if (key.escape || input === "b") onBack();
    else if (input === "q") process.exit(0);
    else if (input === "g") {
      setMode("new-search");
      setSearchInput("");
    } else if (input === "a" && results.length > 0) {
      const video = results[selectedIndex];
      if (video.channelId) setMode("confirm-add");
      else setError("Cannot add channel - no channel ID available");
    } else if (input === "i" && results.length > 0) {
      if (showDescription) {
        setShowDescription(false);
        setDescription(null);
      } else fetchDescription();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) setScrollOffset(newIndex);
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(results.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return) handlePlay();
  });
  const handleRowSelect = useCallback5((vi) => setSelectedIndex(scrollOffset + vi), [scrollOffset]);
  const handleRowActivate = useCallback5(async (vi) => {
    if (results.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + vi;
    const video = results[actualIndex];
    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds2());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  }, [results, scrollOffset, playing, loading, setMessage, setError]);
  const channelColWidth = 22;
  const durationColWidth = 8;
  const viewsColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - durationColWidth - viewsColWidth - 2;
  const subtitle = loading ? "" : `${results.length} result${results.length !== 1 ? "s" : ""} for "${currentQuery}"`;
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx8(Header, { title: "Search YouTube", subtitle, loading, loadingMessage: loading ? "Searching..." : "" }),
    mode === "new-search" && /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs7(Box7, { children: [
        /* @__PURE__ */ jsx8(Text7, { color: "cyan", children: "New search: " }),
        /* @__PURE__ */ jsx8(TextInput2, { value: searchInput, onChange: setSearchInput, onSubmit: handleNewSearch, placeholder: "enter search query" })
      ] }),
      /* @__PURE__ */ jsx8(Text7, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "confirm-add" && results.length > 0 && /* @__PURE__ */ jsxs7(Text7, { color: "cyan", children: [
      'Subscribe to "',
      results[selectedIndex]?.channelName,
      '"? (Y/n)'
    ] }),
    showDescription && /* @__PURE__ */ jsx8(DescriptionPanel, { loading: loadingDescription, description }),
    error && !results.length && /* @__PURE__ */ jsx8(Text7, { color: "red", children: error }),
    !loading && results.length === 0 && !error && /* @__PURE__ */ jsx8(Text7, { color: "gray", children: "No results found." }),
    results.length > 0 && mode === "list" && !showDescription && /* @__PURE__ */ jsx8(Box7, { flexDirection: "column", children: visibleVideos.map((video, index) => {
      const actualIndex = scrollOffset + index;
      const isSelected = actualIndex === selectedIndex;
      const isWatched2 = watchedIds.has(video.id);
      const pointer = isSelected ? ">" : " ";
      const channelText = pad(truncate(video.channelName, channelColWidth - 1), channelColWidth);
      const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
      const durationText = pad(video.durationString || "--:--", durationColWidth);
      const viewsText = pad(formatViews(video.viewCount), viewsColWidth);
      return /* @__PURE__ */ jsx8(ClickableRow, { index, onSelect: handleRowSelect, onActivate: handleRowActivate, children: /* @__PURE__ */ jsx8(VideoRow_default, { pointer, channelText, titleText, metaText: durationText, extraText: viewsText, isSelected, isWatched: isWatched2 }) }, video.id);
    }) }),
    /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
      message && /* @__PURE__ */ jsx8(Text7, { color: "green", children: message }),
      error && results.length > 0 && /* @__PURE__ */ jsx8(Text7, { color: "red", children: error }),
      /* @__PURE__ */ jsxs7(StatusBar, { children: [
        mode === "list" && !showDescription && /* @__PURE__ */ jsxs7(Fragment6, { children: [
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "Enter", description: " play", onClick: handlePlay }),
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "i", description: "nfo", onClick: fetchDescription }),
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "a", description: "dd channel", onClick: () => {
            if (results.length > 0) {
              const video = results[selectedIndex];
              if (video.channelId) setMode("confirm-add");
              else setError("Cannot add channel - no channel ID available");
            }
          } }),
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "g", description: " new search", onClick: () => {
            setMode("new-search");
            setSearchInput("");
          } }),
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "b", description: "ack", onClick: onBack }),
          /* @__PURE__ */ jsx8(KeyHint, { keyName: "q", description: "uit", onClick: () => process.exit(0) })
        ] }),
        showDescription && /* @__PURE__ */ jsx8(KeyHint, { keyName: "i", description: " close info", onClick: () => {
          setShowDescription(false);
          setDescription(null);
        } })
      ] })
    ] })
  ] });
}

// src/App.jsx
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState5(initialChannel ? "videos" : "channels");
  const [selectedChannel, setSelectedChannel] = useState5(initialChannel || null);
  const [searchQuery, setSearchQuery] = useState5("");
  const hasCheckedForNew = useRef4(false);
  const savedChannelListIndex = useRef4(0);
  const handleSelectChannel = (channel, index) => {
    savedChannelListIndex.current = index;
    setSelectedChannel(channel);
    setScreen("videos");
  };
  const handleBrowseAll = () => {
    setSelectedChannel(null);
    setScreen("videos");
  };
  const handleGlobalSearch = (query) => {
    setSearchQuery(query);
    setScreen("search");
  };
  const handleBack = () => {
    setScreen("channels");
    setSelectedChannel(null);
    setSearchQuery("");
  };
  const handleQuit = () => {
    exit();
  };
  const markChecked = () => {
    hasCheckedForNew.current = true;
  };
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
    screen === "channels" && /* @__PURE__ */ jsx9(
      ChannelList,
      {
        onSelectChannel: handleSelectChannel,
        onBrowseAll: handleBrowseAll,
        onGlobalSearch: handleGlobalSearch,
        onQuit: handleQuit,
        skipRefresh: hasCheckedForNew.current,
        onRefreshDone: markChecked,
        savedIndex: savedChannelListIndex.current
      }
    ),
    screen === "videos" && /* @__PURE__ */ jsx9(
      VideoList,
      {
        channel: selectedChannel,
        onBack: handleBack
      }
    ),
    screen === "search" && /* @__PURE__ */ jsx9(
      SearchResults,
      {
        query: searchQuery,
        onBack: handleBack
      }
    )
  ] });
}

// src/cli.jsx
var cli = meow(`
  Usage
    $ youtube-cli                    Launch the TUI
    $ youtube-cli --add <url>        Quick-add a channel
    $ youtube-cli --list             List subscriptions (non-interactive)
    $ youtube-cli --channel <index>  Start on a specific channel (by index)
    $ youtube-cli --prime [query]    Prime historical videos (all or specific channel)

  Options
    --add, -a       Add a channel URL directly
    --list, -l      List all subscriptions
    --channel, -c   Start viewing a specific channel (1-indexed)
    --prime, -p     Fetch full history (slow, use once per channel)
    --help          Show this help message
    --version       Show version

  Examples
    $ youtube-cli
    $ youtube-cli --add https://youtube.com/@Fireship
    $ youtube-cli -c 1
    $ youtube-cli --prime
    $ youtube-cli --prime 3
    $ youtube-cli --prime "fireship"

  Navigation
    j/k or arrows   Move up/down
    Enter           Select / Play video
    /               Filter videos
    a               Add subscription
    d               Delete subscription
    v               View all videos
    b / Escape      Go back
    r               Refresh videos
    s               Toggle Shorts filter
    q               Quit
`, {
  importMeta: import.meta,
  flags: {
    add: { type: "string", shortFlag: "a" },
    list: { type: "boolean", shortFlag: "l" },
    channel: { type: "number", shortFlag: "c" },
    prime: { type: "string", shortFlag: "p" }
  }
});
function clearLine() {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}
function writeProgress(name, done, total) {
  clearLine();
  process.stdout.write(`${name}: ${done}/${total} videos`);
}
async function primeWithProgress(channel) {
  process.stdout.write(`${channel.name}: fetching...`);
  try {
    const result = await primeChannel(channel, (done, total) => writeProgress(channel.name, done, total));
    clearLine();
    const suffix = result.partial ? " (partial - some timed out)" : "";
    console.log(`${channel.name}: added ${result.added} videos${suffix}`);
    return true;
  } catch (err) {
    clearLine();
    console.log(`${channel.name}: failed - ${err.message}`);
    return false;
  }
}
async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.toLowerCase() !== "n";
}
function findChannelsByQuery(subs, query) {
  const index = parseInt(query, 10);
  if (!isNaN(index) && index >= 1 && index <= subs.length) {
    return [subs[index - 1]];
  }
  const search = query.toLowerCase();
  return subs.filter((s) => s.name.toLowerCase().includes(search));
}
async function handleAdd(url) {
  console.log(`Fetching channel info for: ${url}`);
  try {
    const channelInfo = await getChannelInfo(url);
    const result = addSubscription2(channelInfo);
    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(`Added: ${channelInfo.name}`);
    if (await promptYesNo("Prime historical videos? (Y/n) ")) {
      console.log("");
      await primeWithProgress(channelInfo);
    }
  } catch (err) {
    console.error(`Failed to add channel: ${err.message}`);
    process.exit(1);
  }
}
function handleList() {
  const subs = getSubscriptions2();
  if (subs.length === 0) {
    console.log("No subscriptions yet. Use --add <url> to add one.");
    return;
  }
  console.log("Subscriptions:");
  subs.forEach((sub, i) => {
    console.log(`  ${i + 1}. ${sub.name}`);
    console.log(`     ${sub.url}`);
  });
}
async function handlePrime(query) {
  const subs = getSubscriptions2();
  if (subs.length === 0) {
    console.log("No subscriptions yet. Use --add <url> to add one.");
    return;
  }
  let channelsToPrime = subs;
  if (query !== "") {
    const matches = findChannelsByQuery(subs, query);
    if (matches.length === 0) {
      console.error(`No channel found matching "${query}"`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.log(`Multiple channels match "${query}":`);
      matches.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
      console.log("\nBe more specific or use the index number.");
      process.exit(1);
    }
    channelsToPrime = matches;
  }
  console.log(`Priming ${channelsToPrime.length} channel(s) with full history...`);
  console.log("This may take a while.\n");
  for (const channel of channelsToPrime) {
    await primeWithProgress(channel);
  }
  console.log("\nDone!");
}
function handleChannel(index) {
  const subs = getSubscriptions2();
  const idx = index - 1;
  if (idx < 0 || idx >= subs.length) {
    console.error(`Invalid channel index. You have ${subs.length} subscription(s).`);
    process.exit(1);
  }
  return subs[idx];
}
function setupAltScreen() {
  process.stdout.write("\x1B[?1049h\x1B[H");
  const restore = () => process.stdout.write("\x1B[?1049l");
  process.on("exit", restore);
  process.on("SIGINT", () => {
    restore();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    restore();
    process.exit(0);
  });
}
async function main() {
  await initConfig();
  if (cli.flags.add) {
    await handleAdd(cli.flags.add);
    closeDb();
    return;
  }
  if (cli.flags.list) {
    handleList();
    closeDb();
    return;
  }
  if (cli.flags.prime !== void 0) {
    await handlePrime(cli.flags.prime);
    closeDb();
    return;
  }
  const initialChannel = cli.flags.channel ? handleChannel(cli.flags.channel) : null;
  setupAltScreen();
  render(
    React10.createElement(
      MouseProvider,
      { cacheInvalidationMs: 0 },
      React10.createElement(App, { initialChannel })
    )
  );
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
