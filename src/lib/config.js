import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'ytsub');
const CONFIG_FILE = join(CONFIG_DIR, 'subscriptions.json');
const WATCHED_FILE = join(CONFIG_DIR, 'watched.json');
const VIDEOS_FILE = join(CONFIG_DIR, 'videos.json');

const DEFAULT_CONFIG = {
  subscriptions: [],
  settings: {
    player: 'mpv',
    videosPerChannel: 15,
    hideShorts: false,
  },
};

/**
 * Ensure config directory and file exist
 */
function ensureConfig() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

/**
 * Load the config file
 */
export function loadConfig() {
  ensureConfig();
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Save the config file
 */
export function saveConfig(config) {
  ensureConfig();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get all subscriptions (sorted alphabetically by name)
 */
export function getSubscriptions() {
  const config = loadConfig();
  const subs = config.subscriptions || [];
  return subs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Add a subscription
 */
export function addSubscription(subscription) {
  const config = loadConfig();
  
  // Check if already exists
  const exists = config.subscriptions.some(
    (s) => s.url === subscription.url || s.id === subscription.id
  );
  
  if (exists) {
    return { success: false, error: 'Subscription already exists' };
  }
  
  config.subscriptions.push(subscription);
  saveConfig(config);
  return { success: true };
}

/**
 * Remove a subscription by index or id
 */
export function removeSubscription(identifier) {
  const config = loadConfig();
  
  if (typeof identifier === 'number') {
    if (identifier < 0 || identifier >= config.subscriptions.length) {
      return { success: false, error: 'Invalid index' };
    }
    config.subscriptions.splice(identifier, 1);
  } else {
    const index = config.subscriptions.findIndex((s) => s.id === identifier);
    if (index === -1) {
      return { success: false, error: 'Subscription not found' };
    }
    config.subscriptions.splice(index, 1);
  }
  
  saveConfig(config);
  return { success: true };
}

/**
 * Get settings
 */
export function getSettings() {
  const config = loadConfig();
  return config.settings || DEFAULT_CONFIG.settings;
}

/**
 * Update settings
 */
export function updateSettings(newSettings) {
  const config = loadConfig();
  config.settings = { ...config.settings, ...newSettings };
  saveConfig(config);
  return config.settings;
}

export { CONFIG_DIR, CONFIG_FILE };

// ============ Watched Videos Tracking ============

/**
 * Load watched videos list
 */
export function loadWatched() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(WATCHED_FILE)) {
    return { videos: {} };
  }
  try {
    const data = readFileSync(WATCHED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { videos: {} };
  }
}

/**
 * Save watched videos list
 */
function saveWatched(watched) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(WATCHED_FILE, JSON.stringify(watched, null, 2));
}

/**
 * Mark a video as watched
 * @param {string} videoId - YouTube video ID
 */
export function markAsWatched(videoId) {
  const watched = loadWatched();
  watched.videos[videoId] = {
    watchedAt: new Date().toISOString(),
  };
  saveWatched(watched);
}

/**
 * Check if a video has been watched
 * @param {string} videoId - YouTube video ID
 */
export function isWatched(videoId) {
  const watched = loadWatched();
  return !!watched.videos[videoId];
}

/**
 * Get all watched video IDs
 */
export function getWatchedIds() {
  const watched = loadWatched();
  return new Set(Object.keys(watched.videos));
}

// ============ Video Store (persistent video history) ============

/**
 * Load stored videos
 * Structure: { videos: { [videoId]: { ...videoData } } }
 */
export function loadVideoStore() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(VIDEOS_FILE)) {
    return { videos: {} };
  }
  try {
    const data = readFileSync(VIDEOS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { videos: {} };
  }
}

/**
 * Save video store
 */
function saveVideoStore(store) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(VIDEOS_FILE, JSON.stringify(store, null, 2));
}

/**
 * Add videos to the store (merges with existing)
 * @param {Array} videos - Array of video objects
 */
export function storeVideos(videos) {
  const store = loadVideoStore();
  for (const video of videos) {
    if (video.id) {
      // Store essential fields only
      store.videos[video.id] = {
        id: video.id,
        title: video.title,
        url: video.url,
        isShort: video.isShort,
        channelName: video.channelName,
        channelId: video.channelId,
        publishedDate: video.publishedDate?.toISOString?.() || video.publishedDate,
        storedAt: store.videos[video.id]?.storedAt || new Date().toISOString(),
      };
    }
  }
  saveVideoStore(store);
}

/**
 * Get stored videos for a channel
 * @param {string} channelId - Channel ID
 * @returns {Array} Array of video objects
 */
export function getStoredVideos(channelId) {
  const store = loadVideoStore();
  return Object.values(store.videos)
    .filter((v) => v.channelId === channelId)
    .map((v) => ({
      ...v,
      publishedDate: v.publishedDate ? new Date(v.publishedDate) : null,
    }));
}

/**
 * Get all stored videos
 * @returns {Array} Array of video objects
 */
export function getAllStoredVideos() {
  const store = loadVideoStore();
  return Object.values(store.videos).map((v) => ({
    ...v,
    publishedDate: v.publishedDate ? new Date(v.publishedDate) : null,
  }));
}

// ============ Last Opened Tracking (for "new" indicators) ============

/**
 * Get the last opened timestamp
 */
export function getLastOpened() {
  const config = loadConfig();
  return config.lastOpened ? new Date(config.lastOpened) : null;
}

/**
 * Update last opened timestamp to now
 */
export function updateLastOpened() {
  const config = loadConfig();
  config.lastOpened = new Date().toISOString();
  saveConfig(config);
}

/**
 * Count new videos per channel since last opened
 * @returns {Map<string, number>} Map of channelId -> count of new videos
 */
export function getNewVideoCounts() {
  const lastOpened = getLastOpened();
  if (!lastOpened) {
    return new Map();
  }
  
  const store = loadVideoStore();
  const counts = new Map();
  
  for (const video of Object.values(store.videos)) {
    if (video.publishedDate) {
      const pubDate = new Date(video.publishedDate);
      if (pubDate > lastOpened) {
        const current = counts.get(video.channelId) || 0;
        counts.set(video.channelId, current + 1);
      }
    }
  }
  
  return counts;
}
