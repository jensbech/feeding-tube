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

/**
 * Toggle watched status for a video
 * @param {string} videoId - YouTube video ID
 * @returns {boolean} New watched state (true = watched, false = unwatched)
 */
export function toggleWatched(videoId) {
  const watched = loadWatched();
  if (watched.videos[videoId]) {
    delete watched.videos[videoId];
    saveWatched(watched);
    return false;
  } else {
    watched.videos[videoId] = {
      watchedAt: new Date().toISOString(),
    };
    saveWatched(watched);
    return true;
  }
}

/**
 * Mark multiple videos as watched (batch operation)
 * @param {Array<string>} videoIds - Array of video IDs to mark as watched
 * @returns {number} Number of videos marked
 */
export function markChannelAllWatched(videoIds) {
  const watched = loadWatched();
  const now = new Date().toISOString();
  let count = 0;
  
  for (const videoId of videoIds) {
    if (!watched.videos[videoId]) {
      watched.videos[videoId] = { watchedAt: now };
      count++;
    }
  }
  
  if (count > 0) {
    saveWatched(watched);
  }
  return count;
}

// ============ Video Store (persistent video history) ============

// In-memory cache
let videoStoreCache = null;
let sortedIndexCache = null; // Array of video IDs sorted by date (for "all")
let filteredIndexCache = null; // { key: string, ids: string[] } for filtered views

/**
 * Load stored videos (with caching)
 * Structure: { videos: { [videoId]: { ...videoData } } }
 */
export function loadVideoStore() {
  if (videoStoreCache) {
    return videoStoreCache;
  }
  
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(VIDEOS_FILE)) {
    videoStoreCache = { videos: {} };
    return videoStoreCache;
  }
  try {
    const data = readFileSync(VIDEOS_FILE, 'utf-8');
    videoStoreCache = JSON.parse(data);
    return videoStoreCache;
  } catch {
    videoStoreCache = { videos: {} };
    return videoStoreCache;
  }
}

/**
 * Save video store (also updates cache)
 */
function saveVideoStore(store) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  videoStoreCache = store;
  sortedIndexCache = null; // Invalidate sorted index
  filteredIndexCache = null; // Invalidate filtered index
  writeFileSync(VIDEOS_FILE, JSON.stringify(store, null, 2));
}

/**
 * Get or build the sorted index (deferred sorting)
 * Returns array of video IDs sorted by publishedDate descending
 */
function getSortedIndex(channelIds = null) {
  const store = loadVideoStore();
  
  // For filtered views (specific channels)
  if (channelIds) {
    const cacheKey = channelIds.slice().sort().join(',');
    
    // Return cached if same filter
    if (filteredIndexCache && filteredIndexCache.key === cacheKey) {
      return filteredIndexCache.ids;
    }
    
    // Build filtered index with Set for O(1) lookup
    const channelSet = new Set(channelIds);
    const filtered = Object.values(store.videos)
      .filter((v) => channelSet.has(v.channelId))
      .sort((a, b) => {
        // Compare ISO strings directly (lexicographic order works for ISO dates)
        const dateA = a.publishedDate || '';
        const dateB = b.publishedDate || '';
        return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
      });
    
    filteredIndexCache = { key: cacheKey, ids: filtered.map((v) => v.id) };
    return filteredIndexCache.ids;
  }
  
  // For "all videos", use cached sorted index
  if (sortedIndexCache) {
    return sortedIndexCache;
  }
  
  // Build and cache sorted index
  const allVideos = Object.values(store.videos);
  allVideos.sort((a, b) => {
    const dateA = a.publishedDate || '';
    const dateB = b.publishedDate || '';
    return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
  });
  sortedIndexCache = allVideos.map((v) => v.id);
  return sortedIndexCache;
}

/**
 * Add videos to the store (merges with existing)
 * Only writes to disk if there are actually new videos
 * @param {Array} videos - Array of video objects
 * @returns {number} Number of new videos added
 */
export function storeVideos(videos) {
  const store = loadVideoStore();
  let newCount = 0;
  
  for (const video of videos) {
    if (video.id && !store.videos[video.id]) {
      // Only add if video doesn't exist
      store.videos[video.id] = {
        id: video.id,
        title: video.title,
        url: video.url,
        isShort: video.isShort,
        channelName: video.channelName,
        channelId: video.channelId,
        publishedDate: video.publishedDate?.toISOString?.() || video.publishedDate,
        storedAt: new Date().toISOString(),
      };
      newCount++;
    }
  }
  
  // Only write to disk and invalidate cache if we added new videos
  if (newCount > 0) {
    saveVideoStore(store);
  }
  
  return newCount;
}

/**
 * Get stored videos for a channel
 * @param {string} channelId - Channel ID
 * @returns {Array} Array of video objects
 */
export function getStoredVideos(channelId) {
  const store = loadVideoStore();
  const sortedIds = getSortedIndex([channelId]);
  
  return sortedIds.map((id) => {
    const v = store.videos[id];
    return {
      ...v,
      publishedDate: v.publishedDate ? new Date(v.publishedDate) : null,
    };
  });
}

/**
 * Get all stored videos (deprecated - use paginated version)
 * @returns {Array} Array of video objects
 */
export function getAllStoredVideos() {
  const store = loadVideoStore();
  return Object.values(store.videos).map((v) => ({
    ...v,
    publishedDate: v.publishedDate ? new Date(v.publishedDate) : null,
  }));
}

/**
 * Get paginated stored videos (lazy loading)
 * @param {Array<string>} channelIds - Filter to these channel IDs (null for all)
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Videos per page
 * @returns {{ total: number, videos: Array }} Paginated result
 */
export function getStoredVideosPaginated(channelIds = null, page = 0, pageSize = 100) {
  const store = loadVideoStore();
  const sortedIds = getSortedIndex(channelIds);
  
  const start = page * pageSize;
  const pageIds = sortedIds.slice(start, start + pageSize);
  
  const videos = pageIds.map((id) => {
    const v = store.videos[id];
    return {
      ...v,
      publishedDate: v.publishedDate ? new Date(v.publishedDate) : null,
    };
  });
  
  return {
    total: sortedIds.length,
    page,
    pageSize,
    videos,
  };
}

// ============ Channel View Tracking (for "new" indicators) ============

/**
 * Get the last viewed timestamp for a channel
 * @param {string} channelId
 * @returns {Date|null}
 */
export function getChannelLastViewed(channelId) {
  const config = loadConfig();
  const timestamp = config.channelLastViewed?.[channelId];
  return timestamp ? new Date(timestamp) : null;
}

/**
 * Update last viewed timestamp for a channel to now
 * @param {string} channelId
 */
export function updateChannelLastViewed(channelId) {
  const config = loadConfig();
  if (!config.channelLastViewed) {
    config.channelLastViewed = {};
  }
  config.channelLastViewed[channelId] = new Date().toISOString();
  saveConfig(config);
}

/**
 * Mark all channels as viewed (clears all "new" dots)
 * @param {Array<string>} channelIds - List of channel IDs to mark as viewed
 */
export function markAllChannelsViewed(channelIds) {
  const config = loadConfig();
  if (!config.channelLastViewed) {
    config.channelLastViewed = {};
  }
  const now = new Date().toISOString();
  for (const channelId of channelIds) {
    config.channelLastViewed[channelId] = now;
  }
  saveConfig(config);
}

/**
 * Count new videos per channel since each channel was last viewed
 * @returns {Map<string, number>} Map of channelId -> count of new videos
 */
export function getNewVideoCounts() {
  const config = loadConfig();
  const channelLastViewed = config.channelLastViewed || {};
  const store = loadVideoStore();
  const counts = new Map();
  
  for (const video of Object.values(store.videos)) {
    if (video.publishedDate && video.channelId) {
      const lastViewed = channelLastViewed[video.channelId];
      // If never viewed, or video published after last view
      if (!lastViewed || video.publishedDate > lastViewed) {
        const current = counts.get(video.channelId) || 0;
        counts.set(video.channelId, current + 1);
      }
    }
  }
  
  return counts;
}

/**
 * Get channels where all videos have been watched
 * @returns {Set<string>} Set of channelIds where all videos are watched
 */
export function getFullyWatchedChannels() {
  const store = loadVideoStore();
  const watched = loadWatched();
  const watchedIds = new Set(Object.keys(watched.videos));
  
  // Group videos by channel
  const channelVideos = new Map();
  for (const video of Object.values(store.videos)) {
    if (video.channelId) {
      if (!channelVideos.has(video.channelId)) {
        channelVideos.set(video.channelId, []);
      }
      channelVideos.get(video.channelId).push(video.id);
    }
  }
  
  // Check which channels have all videos watched
  const fullyWatched = new Set();
  for (const [channelId, videoIds] of channelVideos) {
    if (videoIds.length > 0 && videoIds.every((id) => watchedIds.has(id))) {
      fullyWatched.add(channelId);
    }
  }
  
  return fullyWatched;
}
