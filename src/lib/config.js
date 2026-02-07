import {
  getDb,
  getSubscriptions as dbGetSubscriptions,
  addSubscription as dbAddSubscription,
  removeSubscription as dbRemoveSubscription,
  getSettings as dbGetSettings,
  updateSettings as dbUpdateSettings,
  markAsWatched as dbMarkAsWatched,
  isWatched as dbIsWatched,
  getWatchedIds as dbGetWatchedIds,
  toggleWatched as dbToggleWatched,
  markChannelAllWatched as dbMarkChannelAllWatched,
  storeVideos as dbStoreVideos,
  getStoredVideos as dbGetStoredVideos,
  getAllStoredVideos as dbGetAllStoredVideos,
  getStoredVideosPaginated as dbGetStoredVideosPaginated,
  getChannelLastViewed as dbGetChannelLastViewed,
  updateChannelLastViewed as dbUpdateChannelLastViewed,
  markAllChannelsViewed as dbMarkAllChannelsViewed,
  getNewVideoCounts as dbGetNewVideoCounts,
  getFullyWatchedChannels as dbGetFullyWatchedChannels,
  closeDb,
  CONFIG_DIR,
  CONFIG_FILE,
} from './db.js';

let initialized = false;

export async function initConfig() {
  if (initialized) return;
  await getDb();
  initialized = true;
}

function ensureInit() {
  if (!initialized) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
}

export function loadConfig() {
  ensureInit();
  return {
    subscriptions: dbGetSubscriptions(),
    settings: dbGetSettings(),
  };
}

export function saveConfig() {
  ensureInit();
}

export function getSubscriptions() {
  ensureInit();
  return dbGetSubscriptions();
}

export function addSubscription(subscription) {
  ensureInit();
  return dbAddSubscription(subscription);
}

export function removeSubscription(identifier) {
  ensureInit();
  return dbRemoveSubscription(identifier);
}

export function getSettings() {
  ensureInit();
  return dbGetSettings();
}

export function updateSettings(newSettings) {
  ensureInit();
  return dbUpdateSettings(newSettings);
}

export function loadWatched() {
  ensureInit();
  const watchedIds = dbGetWatchedIds();
  const videos = {};
  for (const id of watchedIds) {
    videos[id] = { watchedAt: new Date().toISOString() };
  }
  return { videos };
}

export function markAsWatched(videoId) {
  ensureInit();
  return dbMarkAsWatched(videoId);
}

export function isWatched(videoId) {
  ensureInit();
  return dbIsWatched(videoId);
}

export function getWatchedIds() {
  ensureInit();
  return dbGetWatchedIds();
}

export function toggleWatched(videoId) {
  ensureInit();
  return dbToggleWatched(videoId);
}

export function markChannelAllWatched(videoIds) {
  ensureInit();
  return dbMarkChannelAllWatched(videoIds);
}

export function loadVideoStore() {
  ensureInit();
  const videos = dbGetAllStoredVideos();
  const store = { videos: {} };
  for (const v of videos) {
    store.videos[v.id] = v;
  }
  return store;
}

export function storeVideos(videos) {
  ensureInit();
  return dbStoreVideos(videos);
}

export function getStoredVideos(channelId) {
  ensureInit();
  return dbGetStoredVideos(channelId);
}

export function getAllStoredVideos() {
  ensureInit();
  return dbGetAllStoredVideos();
}

export function getStoredVideosPaginated(channelIds = null, page = 0, pageSize = 100) {
  ensureInit();
  return dbGetStoredVideosPaginated(channelIds, page, pageSize);
}

export function getChannelLastViewed(channelId) {
  ensureInit();
  return dbGetChannelLastViewed(channelId);
}

export function updateChannelLastViewed(channelId) {
  ensureInit();
  return dbUpdateChannelLastViewed(channelId);
}

export function markAllChannelsViewed(channelIds) {
  ensureInit();
  return dbMarkAllChannelsViewed(channelIds);
}

export function getNewVideoCounts(hideShorts = false) {
  ensureInit();
  return dbGetNewVideoCounts(hideShorts);
}

export function getFullyWatchedChannels(hideShorts = false) {
  ensureInit();
  return dbGetFullyWatchedChannels(hideShorts);
}

export { closeDb, CONFIG_DIR, CONFIG_FILE };
