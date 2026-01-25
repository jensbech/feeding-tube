import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'ytsub');
const CONFIG_FILE = join(CONFIG_DIR, 'subscriptions.json');
const WATCHED_FILE = join(CONFIG_DIR, 'watched.json');

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
