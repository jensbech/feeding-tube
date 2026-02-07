import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

const DB_DIR = join(homedir(), '.youtube-cli');
const DB_FILE = join(DB_DIR, 'data.db');
const LEGACY_CONFIG_DIR = join(homedir(), '.config', 'youtube-cli');

let db = null;
let SQL = null;

function requireDb() {
  if (!db) throw new Error('Database not initialized');
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
  writeFileSync(DB_FILE, Buffer.from(data), { mode: 0o600 });
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
  if (hasMigration('json_import')) return;

  const configFile = join(LEGACY_CONFIG_DIR, 'subscriptions.json');
  const watchedFile = join(LEGACY_CONFIG_DIR, 'watched.json');
  const videosFile = join(LEGACY_CONFIG_DIR, 'videos.json');

  let imported = false;

  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(readFileSync(configFile, 'utf-8'));

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
    } catch {}
  }

  if (existsSync(watchedFile)) {
    try {
      const watched = JSON.parse(readFileSync(watchedFile, 'utf-8'));
      if (watched.videos) {
        const stmt = db.prepare(`INSERT OR IGNORE INTO watched (video_id, watched_at) VALUES (?, ?)`);
        for (const [videoId, data] of Object.entries(watched.videos)) {
          stmt.run([videoId, data.watchedAt || new Date().toISOString()]);
        }
        stmt.free();
      }
      imported = true;
    } catch {}
  }

  if (existsSync(videosFile)) {
    try {
      const store = JSON.parse(readFileSync(videosFile, 'utf-8'));
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
            video.storedAt || new Date().toISOString()
          ]);
        }
        stmt.free();
      }
      imported = true;
    } catch {}
  }

  if (imported) {
    markMigration('json_import');

    const backupDir = join(LEGACY_CONFIG_DIR, 'backup');
    ensureDir(backupDir);

    for (const file of [configFile, watchedFile, videosFile]) {
      if (existsSync(file)) {
        const backupPath = join(backupDir, basename(file));
        try {
          renameSync(file, backupPath);
        } catch {}
      }
    }
  } else {
    markMigration('json_import');
  }
}

export async function getDb() {
  return await initDb();
}

export function getSubscriptions() {
  return queryRows(`SELECT id, name, url, added_at FROM subscriptions ORDER BY name COLLATE NOCASE`)
    .map(([id, name, url, addedAt]) => ({ id, name, url, addedAt }));
}

export function addSubscription(subscription) {
  if (queryRows(`SELECT 1 FROM subscriptions WHERE id = ? OR url = ?`, [subscription.id, subscription.url]).length > 0) {
    return { success: false, error: 'Subscription already exists' };
  }

  requireDb().run(`INSERT INTO subscriptions (id, name, url) VALUES (?, ?, ?)`, [subscription.id, subscription.name, subscription.url]);
  saveDbToFile();
  return { success: true };
}

export function removeSubscription(identifier) {
  const database = requireDb();

  if (typeof identifier === 'string') {
    if (queryRows(`SELECT id FROM subscriptions WHERE id = ?`, [identifier]).length === 0) {
      return { success: false, error: 'Subscription not found' };
    }
    database.run(`DELETE FROM subscriptions WHERE id = ?`, [identifier]);
  } else {
    const subs = getSubscriptions();
    if (identifier < 0 || identifier >= subs.length) {
      return { success: false, error: 'Invalid index' };
    }
    database.run(`DELETE FROM subscriptions WHERE id = ?`, [subs[identifier].id]);
  }

  saveDbToFile();
  return { success: true };
}

const DEFAULT_SETTINGS = {
  player: 'mpv',
  videosPerChannel: 15,
  hideShorts: true,
};

export function getSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of queryRows(`SELECT key, value FROM settings`)) {
    try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
  }
  return settings;
}

export function updateSettings(newSettings) {
  const stmt = requireDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(newSettings)) {
    stmt.run([key, JSON.stringify(value)]);
  }
  stmt.free();
  saveDbToFile();
  return getSettings();
}

export function markAsWatched(videoId) {
  requireDb().run(`INSERT OR REPLACE INTO watched (video_id) VALUES (?)`, [videoId]);
  saveDbToFile();
}

export function isWatched(videoId) {
  return queryRows(`SELECT 1 FROM watched WHERE video_id = ?`, [videoId]).length > 0;
}

export function getWatchedIds() {
  return new Set(queryRows(`SELECT video_id FROM watched`).map(([id]) => id));
}

export function toggleWatched(videoId) {
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

export function markChannelAllWatched(videoIds) {
  if (!videoIds || videoIds.length === 0) return 0;

  const existingSet = new Set(
    queryRows(`SELECT video_id FROM watched WHERE video_id IN (${videoIds.map(() => '?').join(',')})`, videoIds)
      .map(([id]) => id)
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
  if (!str || typeof str !== 'string') return str;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function storeVideos(videos) {
  if (!videos || !Array.isArray(videos)) return 0;

  const validVideos = videos.filter(v => v && v.id && typeof v.id === 'string');
  if (validVideos.length === 0) return 0;

  const existingSet = new Set(
    queryRows(`SELECT id FROM videos WHERE id IN (${validVideos.map(() => '?').join(',')})`, validVideos.map(v => v.id))
      .map(([id]) => id)
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
      truncateStr(video.title, 500) || '',
      truncateStr(video.url, 500) || '',
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

const VIDEO_COLUMNS = 'id, title, url, is_short, channel_name, channel_id, published_date, stored_at';

export function getStoredVideos(channelId) {
  return queryRows(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE channel_id = ? ORDER BY published_date DESC`, [channelId])
    .map(hydrateVideo);
}

export function getAllStoredVideos() {
  return queryRows(`SELECT ${VIDEO_COLUMNS} FROM videos ORDER BY published_date DESC`).map(hydrateVideo);
}

export function getStoredVideosPaginated(channelIds = null, page = 0, pageSize = 100) {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 1000);
  const offset = safePage * safePageSize;

  let total, videos;

  if (channelIds && Array.isArray(channelIds) && channelIds.length > 0) {
    const placeholders = channelIds.map(() => '?').join(',');
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

export function getChannelLastViewed(channelId) {
  const row = queryRows(`SELECT last_viewed_at FROM channel_views WHERE channel_id = ?`, [channelId])[0];
  return row ? new Date(row[0]) : null;
}

export function updateChannelLastViewed(channelId) {
  requireDb().run(`INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)`, [channelId, new Date().toISOString()]);
  saveDbToFile();
}

export function markAllChannelsViewed(channelIds) {
  const now = new Date().toISOString();
  const stmt = requireDb().prepare(`INSERT OR REPLACE INTO channel_views (channel_id, last_viewed_at) VALUES (?, ?)`);
  for (const channelId of channelIds) {
    stmt.run([channelId, now]);
  }
  stmt.free();
  saveDbToFile();
}

export function getNewVideoCounts(hideShorts = false) {
  const shortFilter = hideShorts ? 'AND v.is_short = 0' : '';
  const rows = queryRows(`
    SELECT v.channel_id, COUNT(*) as count FROM videos v
    LEFT JOIN channel_views cv ON v.channel_id = cv.channel_id
    WHERE v.published_date IS NOT NULL AND v.channel_id IS NOT NULL ${shortFilter}
      AND (cv.last_viewed_at IS NULL OR v.published_date > cv.last_viewed_at)
    GROUP BY v.channel_id
  `);
  return new Map(rows.map(([channelId, count]) => [channelId, count]));
}

export function getFullyWatchedChannels(hideShorts = false) {
  const shortFilter = hideShorts ? 'WHERE v.is_short = 0' : '';
  const rows = queryRows(`
    SELECT v.channel_id, COUNT(*) as total, SUM(CASE WHEN w.video_id IS NOT NULL THEN 1 ELSE 0 END) as watched
    FROM videos v LEFT JOIN watched w ON v.id = w.video_id ${shortFilter}
    GROUP BY v.channel_id HAVING total > 0 AND total = watched
  `);
  return new Set(rows.map(([channelId]) => channelId));
}

export function closeDb() {
  if (db) {
    saveDbToFile();
    db.close();
    db = null;
  }
}

export { DB_DIR, DB_FILE };
export const CONFIG_DIR = DB_DIR;
export const CONFIG_FILE = DB_FILE;
