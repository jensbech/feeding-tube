#!/usr/bin/env node

// src/cli.jsx
import React8 from "react";
import { render } from "ink";
import { MouseProvider } from "@ink-tools/ink-mouse";
import meow from "meow";
import readline from "readline";

// src/App.jsx
import React7, { useState as useState4, useRef as useRef4 } from "react";
import { Box as Box7, useApp } from "ink";

// src/screens/ChannelList.jsx
import React4, { useState, useEffect, memo, useCallback as useCallback2 } from "react";
import { Box as Box4, Text as Text3, useInput, useStdout as useStdout3 } from "ink";
import TextInput from "ink-text-input";

// src/components/Header.jsx
import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ title, subtitle, hints, loading, loadingMessage, hideShorts, onToggleShorts }) {
  const { stdout } = useStdout();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
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
    hints && /* @__PURE__ */ jsx(Box, { marginTop: 0, children: /* @__PURE__ */ jsx(Text, { color: "gray", children: hints }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "gray", children: "\u2500".repeat(width) }) })
  ] });
}

// src/components/StatusBar.jsx
import React2, { useRef } from "react";
import { Box as Box2, Text as Text2, useStdout as useStdout2 } from "ink";
import { useOnClick } from "@ink-tools/ink-mouse";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function StatusBar({ children }) {
  const { stdout } = useStdout2();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
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
import React3, { useRef as useRef2, useCallback } from "react";
import { Box as Box3 } from "ink";
import { useOnClick as useOnClick2 } from "@ink-tools/ink-mouse";
import { jsx as jsx3 } from "react/jsx-runtime";
var DOUBLE_CLICK_THRESHOLD = 400;
var globalLastClickTime = 0;
var globalLastClickIndex = -1;
var globalClickLock = false;
function ClickableRow({ index, onSelect, onActivate, children }) {
  const ref = useRef2(null);
  const handleClick = useCallback(() => {
    if (globalClickLock) return;
    globalClickLock = true;
    setTimeout(() => {
      globalClickLock = false;
    }, 50);
    const now = Date.now();
    const timeDiff = now - globalLastClickTime;
    if (timeDiff < DOUBLE_CLICK_THRESHOLD && globalLastClickIndex === index) {
      onActivate?.(index);
      globalLastClickTime = 0;
      globalLastClickIndex = -1;
    } else {
      onSelect?.(index);
      globalLastClickTime = now;
      globalLastClickIndex = index;
    }
  }, [index, onSelect, onActivate]);
  useOnClick2(ref, handleClick);
  return /* @__PURE__ */ jsx3(Box3, { ref, children });
}

// src/lib/config.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var CONFIG_DIR = join(homedir(), ".config", "youtube-cli");
var CONFIG_FILE = join(CONFIG_DIR, "subscriptions.json");
var WATCHED_FILE = join(CONFIG_DIR, "watched.json");
var VIDEOS_FILE = join(CONFIG_DIR, "videos.json");
var DEFAULT_CONFIG = {
  subscriptions: [],
  settings: {
    player: "mpv",
    videosPerChannel: 15,
    hideShorts: true
  }
};
function ensureConfig() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}
function loadConfig() {
  ensureConfig();
  try {
    const data = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return DEFAULT_CONFIG;
  }
}
function saveConfig(config) {
  ensureConfig();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
function getSubscriptions() {
  const config = loadConfig();
  const subs = config.subscriptions || [];
  return subs.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
}
function addSubscription(subscription) {
  const config = loadConfig();
  const exists = config.subscriptions.some(
    (s) => s.url === subscription.url || s.id === subscription.id
  );
  if (exists) {
    return { success: false, error: "Subscription already exists" };
  }
  config.subscriptions.push(subscription);
  saveConfig(config);
  return { success: true };
}
function removeSubscription(identifier) {
  const config = loadConfig();
  if (typeof identifier === "number") {
    if (identifier < 0 || identifier >= config.subscriptions.length) {
      return { success: false, error: "Invalid index" };
    }
    config.subscriptions.splice(identifier, 1);
  } else {
    const index = config.subscriptions.findIndex((s) => s.id === identifier);
    if (index === -1) {
      return { success: false, error: "Subscription not found" };
    }
    config.subscriptions.splice(index, 1);
  }
  saveConfig(config);
  return { success: true };
}
function getSettings() {
  const config = loadConfig();
  return config.settings || DEFAULT_CONFIG.settings;
}
function updateSettings(newSettings) {
  const config = loadConfig();
  config.settings = { ...config.settings, ...newSettings };
  saveConfig(config);
  return config.settings;
}
function loadWatched() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(WATCHED_FILE)) {
    return { videos: {} };
  }
  try {
    const data = readFileSync(WATCHED_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { videos: {} };
  }
}
function saveWatched(watched) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(WATCHED_FILE, JSON.stringify(watched, null, 2));
}
function markAsWatched(videoId) {
  const watched = loadWatched();
  watched.videos[videoId] = {
    watchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveWatched(watched);
}
function getWatchedIds() {
  const watched = loadWatched();
  return new Set(Object.keys(watched.videos));
}
function toggleWatched(videoId) {
  const watched = loadWatched();
  if (watched.videos[videoId]) {
    delete watched.videos[videoId];
    saveWatched(watched);
    return false;
  } else {
    watched.videos[videoId] = {
      watchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveWatched(watched);
    return true;
  }
}
function markChannelAllWatched(videoIds) {
  const watched = loadWatched();
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
var videoStoreCache = null;
var sortedIndexCache = null;
var filteredIndexCache = null;
function loadVideoStore() {
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
    const data = readFileSync(VIDEOS_FILE, "utf-8");
    videoStoreCache = JSON.parse(data);
    return videoStoreCache;
  } catch {
    videoStoreCache = { videos: {} };
    return videoStoreCache;
  }
}
function saveVideoStore(store) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  videoStoreCache = store;
  sortedIndexCache = null;
  filteredIndexCache = null;
  writeFileSync(VIDEOS_FILE, JSON.stringify(store, null, 2));
}
function getSortedIndex(channelIds = null) {
  const store = loadVideoStore();
  if (channelIds) {
    const cacheKey = channelIds.slice().sort().join(",");
    if (filteredIndexCache && filteredIndexCache.key === cacheKey) {
      return filteredIndexCache.ids;
    }
    const channelSet = new Set(channelIds);
    const filtered = Object.values(store.videos).filter((v) => channelSet.has(v.channelId)).sort((a, b) => {
      const dateA = a.publishedDate || "";
      const dateB = b.publishedDate || "";
      return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
    });
    filteredIndexCache = { key: cacheKey, ids: filtered.map((v) => v.id) };
    return filteredIndexCache.ids;
  }
  if (sortedIndexCache) {
    return sortedIndexCache;
  }
  const allVideos = Object.values(store.videos);
  allVideos.sort((a, b) => {
    const dateA = a.publishedDate || "";
    const dateB = b.publishedDate || "";
    return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
  });
  sortedIndexCache = allVideos.map((v) => v.id);
  return sortedIndexCache;
}
function storeVideos(videos) {
  const store = loadVideoStore();
  let newCount = 0;
  for (const video of videos) {
    if (video.id && !store.videos[video.id]) {
      store.videos[video.id] = {
        id: video.id,
        title: video.title,
        url: video.url,
        isShort: video.isShort,
        channelName: video.channelName,
        channelId: video.channelId,
        publishedDate: video.publishedDate?.toISOString?.() || video.publishedDate,
        storedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      newCount++;
    }
  }
  if (newCount > 0) {
    saveVideoStore(store);
  }
  return newCount;
}
function getStoredVideos(channelId) {
  const store = loadVideoStore();
  const sortedIds = getSortedIndex([channelId]);
  return sortedIds.map((id) => {
    const v = store.videos[id];
    return {
      ...v,
      publishedDate: v.publishedDate ? new Date(v.publishedDate) : null
    };
  });
}
function getStoredVideosPaginated(channelIds = null, page = 0, pageSize = 100) {
  const store = loadVideoStore();
  const sortedIds = getSortedIndex(channelIds);
  const start = page * pageSize;
  const pageIds = sortedIds.slice(start, start + pageSize);
  const videos = pageIds.map((id) => {
    const v = store.videos[id];
    return {
      ...v,
      publishedDate: v.publishedDate ? new Date(v.publishedDate) : null
    };
  });
  return {
    total: sortedIds.length,
    page,
    pageSize,
    videos
  };
}
function updateChannelLastViewed(channelId) {
  const config = loadConfig();
  if (!config.channelLastViewed) {
    config.channelLastViewed = {};
  }
  config.channelLastViewed[channelId] = (/* @__PURE__ */ new Date()).toISOString();
  saveConfig(config);
}
function markAllChannelsViewed(channelIds) {
  const config = loadConfig();
  if (!config.channelLastViewed) {
    config.channelLastViewed = {};
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const channelId of channelIds) {
    config.channelLastViewed[channelId] = now;
  }
  saveConfig(config);
}
function getNewVideoCounts(hideShorts = false) {
  const config = loadConfig();
  const channelLastViewed = config.channelLastViewed || {};
  const store = loadVideoStore();
  const counts = /* @__PURE__ */ new Map();
  for (const video of Object.values(store.videos)) {
    if (video.publishedDate && video.channelId) {
      if (hideShorts && video.isShort) continue;
      const lastViewed = channelLastViewed[video.channelId];
      if (!lastViewed || video.publishedDate > lastViewed) {
        const current = counts.get(video.channelId) || 0;
        counts.set(video.channelId, current + 1);
      }
    }
  }
  return counts;
}
function getFullyWatchedChannels(hideShorts = false) {
  const store = loadVideoStore();
  const watched = loadWatched();
  const watchedIds = new Set(Object.keys(watched.videos));
  const channelVideos = /* @__PURE__ */ new Map();
  for (const video of Object.values(store.videos)) {
    if (video.channelId) {
      if (hideShorts && video.isShort) continue;
      if (!channelVideos.has(video.channelId)) {
        channelVideos.set(video.channelId, []);
      }
      channelVideos.get(video.channelId).push(video.id);
    }
  }
  const fullyWatched = /* @__PURE__ */ new Set();
  for (const [channelId, videoIds] of channelVideos) {
    if (videoIds.length > 0 && videoIds.every((id) => watchedIds.has(id))) {
      fullyWatched.add(channelId);
    }
  }
  return fullyWatched;
}

// src/lib/ytdlp.js
import { execa } from "execa";
async function getChannelInfo(url) {
  try {
    let channelUrl = url.trim();
    const isVideoUrl = channelUrl.includes("/watch?") || channelUrl.includes("youtu.be/");
    if (isVideoUrl) {
      const { stdout: stdout2 } = await execa("yt-dlp", [
        "--dump-json",
        "--playlist-items",
        "1",
        "--no-warnings",
        channelUrl
      ]);
      const data2 = JSON.parse(stdout2);
      return {
        id: data2.channel_id,
        name: data2.channel || data2.uploader,
        url: data2.channel_url || `https://www.youtube.com/channel/${data2.channel_id}`
      };
    }
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
      url: data.channel_url || channelUrl
    };
  } catch (error) {
    throw new Error(`Failed to get channel info: ${error.message}`);
  }
}
async function getChannelVideos(channel, limit = 15) {
  const freshVideos = await fetchChannelRSS(channel.id, channel.name);
  storeVideos(freshVideos);
  const storedVideos = getStoredVideos(channel.id);
  const videoMap = /* @__PURE__ */ new Map();
  for (const v of storedVideos) {
    videoMap.set(v.id, v);
  }
  for (const v of freshVideos) {
    videoMap.set(v.id, v);
  }
  const allVideos = Array.from(videoMap.values()).map((v) => ({
    ...v,
    relativeDate: v.publishedDate ? getRelativeDateFromDate(v.publishedDate) : ""
  }));
  allVideos.sort((a, b) => {
    if (!a.publishedDate || !b.publishedDate) return 0;
    return b.publishedDate.getTime() - a.publishedDate.getTime();
  });
  return allVideos;
}
async function fetchChannelRSS(channelId, channelName) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
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
    const promises = batch.map((sub) => fetchChannelRSS(sub.id, sub.name));
    const results = await Promise.all(promises);
    allVideos.push(...results.flat());
  }
  return allVideos;
}
function parseRSSFeed(xml, channelId, channelName) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match = entryRegex.exec(xml);
  while (match !== null) {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const link = entry.match(/<link rel="alternate" href="([^"]+)"\/>/)?.[1];
    const isShort = link?.includes("/shorts/") ?? false;
    if (videoId && title) {
      const publishedDate = published ? new Date(published) : null;
      entries.push({
        id: videoId,
        title: decodeXMLEntities(title),
        url: link || `https://www.youtube.com/watch?v=${videoId}`,
        isShort,
        duration: null,
        durationString: "--:--",
        channelName,
        channelId,
        publishedDate,
        uploadDate: publishedDate ? formatDateYYYYMMDD(publishedDate) : null,
        relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : ""
      });
    }
    match = entryRegex.exec(xml);
  }
  return entries;
}
function decodeXMLEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
function getRelativeDateFromDate(date) {
  const nowUtc = /* @__PURE__ */ new Date();
  const osloOffset = getOsloOffset(nowUtc);
  const nowOslo = new Date(nowUtc.getTime() + osloOffset);
  const dateOslo = new Date(date.getTime() + osloOffset);
  const diffMs = nowOslo - dateOslo;
  const diffMins = Math.floor(diffMs / (1e3 * 60));
  const diffHours = Math.floor(diffMs / (1e3 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
  if (diffMs < 0) return "upcoming";
  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
function getOsloOffset(date) {
  const year = date.getUTCFullYear();
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  marchLastSunday.setUTCHours(1, 0, 0, 0);
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  octoberLastSunday.setUTCHours(1, 0, 0, 0);
  const isDST = date >= marchLastSunday && date < octoberLastSunday;
  return isDST ? 2 * 60 * 60 * 1e3 : 1 * 60 * 60 * 1e3;
}
async function refreshAllVideos(subscriptions) {
  const freshVideos = await fetchAllChannelsRSS(subscriptions);
  const newCount = freshVideos.length > 0 ? storeVideos(freshVideos) : 0;
  return newCount;
}
function getVideoPage(channelIds, page = 0, pageSize = 100) {
  const { total, videos } = getStoredVideosPaginated(channelIds, page, pageSize);
  const videosWithDates = videos.map((v) => ({
    ...v,
    relativeDate: v.publishedDate ? getRelativeDateFromDate(v.publishedDate) : ""
  }));
  return {
    total,
    page,
    pageSize,
    videos: videosWithDates
  };
}
function formatDuration(seconds) {
  if (!seconds) return "--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
async function searchYouTube(query, limit = 20) {
  try {
    const { stdout } = await execa("yt-dlp", [
      `ytsearch${limit}:${query}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings"
    ], { timeout: 3e4 });
    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const data = JSON.parse(line);
      let publishedDate = null;
      if (data.release_timestamp) {
        publishedDate = new Date(data.release_timestamp * 1e3);
      } else if (data.timestamp) {
        publishedDate = new Date(data.timestamp * 1e3);
      }
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
    if (error.timedOut) {
      throw new Error("Search timed out");
    }
    throw new Error(`Search failed: ${error.message}`);
  }
}
async function primeChannel(channel, onProgress) {
  let url = channel.url;
  if (!url.includes("/videos")) {
    url = url.replace(/\/$/, "") + "/videos";
  }
  let added = 0;
  let total = 0;
  const existingVideos = getStoredVideos(channel.id);
  const existingIds = new Set(existingVideos.map((v) => v.id));
  try {
    let videoIds = [];
    try {
      const { stdout: listOut } = await execa("yt-dlp", [
        "--flat-playlist",
        "--print",
        "%(id)s",
        "--no-warnings",
        "--extractor-args",
        "youtube:skip=dash,hls",
        "--playlist-end",
        "5000",
        url
      ]);
      videoIds = listOut.trim().split("\n").filter(Boolean);
    } catch (listErr) {
      throw listErr;
    }
    const newVideoIds = videoIds.filter((id) => !existingIds.has(id));
    total = videoIds.length;
    const toFetch = newVideoIds.length;
    if (onProgress) onProgress(0, toFetch);
    if (toFetch === 0) {
      return { added: 0, total, skipped: existingIds.size };
    }
    const concurrency = 20;
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < newVideoIds.length; i += batchSize) {
      batches.push(newVideoIds.slice(i, i + batchSize));
    }
    let processed = 0;
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const results = await Promise.all(
        concurrentBatches.map(async (batch) => {
          const urls = batch.map((id) => `https://www.youtube.com/watch?v=${id}`);
          try {
            const { stdout } = await execa("yt-dlp", [
              "--dump-json",
              "--no-warnings",
              "--extractor-args",
              "youtube:skip=dash,hls",
              ...urls
            ]);
            return stdout.trim().split("\n").filter(Boolean).map((line) => {
              const data = JSON.parse(line);
              const uploadDate = data.upload_date;
              const publishedDate = uploadDate ? new Date(
                parseInt(uploadDate.slice(0, 4), 10),
                parseInt(uploadDate.slice(4, 6), 10) - 1,
                parseInt(uploadDate.slice(6, 8), 10)
              ) : null;
              const isShort = data.duration <= 60 || data.webpage_url?.includes("/shorts/");
              return {
                id: data.id,
                title: data.title,
                url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
                isShort,
                duration: data.duration,
                channelName: channel.name,
                channelId: channel.id,
                publishedDate
              };
            });
          } catch (err) {
            return [];
          }
        })
      );
      const videos = results.flat();
      if (videos.length > 0) {
        storeVideos(videos);
        added += videos.length;
      }
      processed += concurrentBatches.reduce((sum, b) => sum + b.length, 0);
      if (onProgress) onProgress(Math.min(processed, toFetch), toFetch);
    }
    return { added, total, skipped: existingIds.size };
  } catch (error) {
    if (added > 0) {
      return { added, total, skipped: existingIds.size, error: error.message };
    }
    throw new Error(`Failed to prime channel: ${error.message}`);
  }
}

// src/screens/ChannelList.jsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var ChannelRow = memo(function ChannelRow2({ name, isSelected, hasNew, isFullyWatched }) {
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsxs3(
      Text3,
      {
        color: isSelected ? "cyan" : void 0,
        dimColor: isFullyWatched && !isSelected,
        children: [
          isSelected ? ">" : " ",
          " ",
          name
        ]
      }
    ),
    hasNew && /* @__PURE__ */ jsx4(Text3, { color: "green", children: " \u25CF" })
  ] });
});
function ChannelList({ onSelectChannel, onBrowseAll, onGlobalSearch, onQuit, skipRefresh, onRefreshDone, savedIndex }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState("list");
  const [addUrl, setAddUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingChannel, setPendingChannel] = useState(null);
  const [newCounts, setNewCounts] = useState(/* @__PURE__ */ new Map());
  const [fullyWatched, setFullyWatched] = useState(/* @__PURE__ */ new Set());
  const [filterText, setFilterText] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [hideShorts, setHideShorts] = useState(() => getSettings().hideShorts ?? true);
  const { stdout } = useStdout3();
  const terminalHeight = stdout?.rows || 24;
  const visibleCount = Math.max(5, Math.floor((terminalHeight - 6) * 0.95));
  const filteredSubs = filterText ? subscriptions.filter((s) => s.name.toLowerCase().includes(filterText.toLowerCase())) : subscriptions;
  const visibleChannels = filteredSubs.slice(scrollOffset, scrollOffset + visibleCount);
  useEffect(() => {
    if (savedIndex > 0 && subscriptions.length > 0) {
      setSelectedIndex(savedIndex);
      if (savedIndex >= visibleCount) {
        setScrollOffset(savedIndex - Math.floor(visibleCount / 2));
      }
    }
  }, [savedIndex, subscriptions.length]);
  useEffect(() => {
    const init = async () => {
      const subs = getSubscriptions();
      setSubscriptions(subs);
      setNewCounts(getNewVideoCounts(hideShorts));
      setFullyWatched(getFullyWatchedChannels(hideShorts));
      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage("Checking for new videos...");
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage("");
        onRefreshDone?.();
        setNewCounts(getNewVideoCounts(hideShorts));
        setFullyWatched(getFullyWatchedChannels(hideShorts));
      }
    };
    init();
  }, []);
  useEffect(() => {
    setNewCounts(getNewVideoCounts(hideShorts));
    setFullyWatched(getFullyWatchedChannels(hideShorts));
  }, [hideShorts]);
  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 3e3);
      return () => clearTimeout(timer);
    }
  }, [message, error]);
  useInput((input, key) => {
    const blockingLoad = loading && (mode === "add" || mode === "confirm-prime" || mode === "confirm-prime-all" || mode === "global-search");
    if (blockingLoad) return;
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText("");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (key.return) {
        setIsFiltering(false);
      } else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        setSelectedIndex(0);
        setScrollOffset(0);
      }
      return;
    }
    if (mode === "add") {
      if (key.escape) {
        setMode("list");
        setAddUrl("");
      }
      return;
    }
    if (mode === "global-search") {
      if (key.escape) {
        setMode("list");
        setSearchQuery("");
      }
      return;
    }
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") {
        handleDelete();
      } else {
        setMode("list");
      }
      return;
    }
    if (mode === "confirm-prime") {
      if (input === "n" || input === "N") {
        setPendingChannel(null);
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) {
        handlePrime();
      }
      return;
    }
    if (mode === "confirm-prime-all") {
      if (input === "n" || input === "N" || key.escape) {
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) {
        handlePrimeAll();
      }
      return;
    }
    if (mode === "confirm-mark-all") {
      if (input === "n" || input === "N") {
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) {
        const channelIds = subscriptions.map((s) => s.id);
        markAllChannelsViewed(channelIds);
        setNewCounts(/* @__PURE__ */ new Map());
        setMessage("Marked all channels as read");
        setMode("list");
      }
      return;
    }
    if (input === "q") {
      onQuit();
    } else if (key.escape || input === "b") {
      if (filterText) {
        setFilterText("");
        setSelectedIndex(0);
        setScrollOffset(0);
      }
    } else if (input === "a") {
      setMode("add");
      setAddUrl("");
    } else if (input === "g") {
      setMode("global-search");
      setSearchQuery("");
    } else if (input === "/") {
      setIsFiltering(true);
    } else if (input === "d" && filteredSubs.length > 0) {
      setMode("confirm-delete");
    } else if (input === "v") {
      onBrowseAll();
    } else if (input === "r" && subscriptions.length > 0 && !loading) {
      const refresh = async () => {
        setLoading(true);
        setLoadingMessage("Checking for new videos...");
        await refreshAllVideos(subscriptions);
        setNewCounts(getNewVideoCounts(hideShorts));
        setFullyWatched(getFullyWatchedChannels(hideShorts));
        setLoading(false);
        setLoadingMessage("");
        setMessage("Refreshed");
      };
      refresh();
    } else if (input === "s") {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
    } else if (input === "w" && filteredSubs.length > 0) {
      const channel = filteredSubs[selectedIndex];
      const videos = getStoredVideos(channel.id);
      const filteredVideos = hideShorts ? videos.filter((v) => !v.isShort) : videos;
      const videoIds = filteredVideos.map((v) => v.id);
      const count = markChannelAllWatched(videoIds);
      setNewCounts(getNewVideoCounts(hideShorts));
      setFullyWatched(getFullyWatchedChannels(hideShorts));
      setMessage(`Marked ${count} videos as watched in ${channel.name}`);
    } else if (input === "p" && subscriptions.length > 0) {
      setMode("confirm-prime-all");
    } else if (input === "m") {
      setMode("confirm-mark-all");
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredSubs.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) {
          setScrollOffset(newIndex - visibleCount + 1);
        }
        return newIndex;
      });
    } else if (key.return) {
      if (filteredSubs.length > 0) {
        const channel = filteredSubs[selectedIndex];
        updateChannelLastViewed(channel.id);
        setNewCounts((prev) => {
          const next = new Map(prev);
          next.delete(channel.id);
          return next;
        });
        onSelectChannel(channel, selectedIndex);
      }
    }
  });
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
      const result = addSubscription(channelInfo);
      if (result.success) {
        setSubscriptions(getSubscriptions());
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
  const handlePrime = async () => {
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
      setNewCounts(getNewVideoCounts(hideShorts));
      setFullyWatched(getFullyWatchedChannels(hideShorts));
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
      } catch (err) {
        failures++;
      }
    }
    setLoading(false);
    setLoadingMessage("");
    setNewCounts(getNewVideoCounts(hideShorts));
    setFullyWatched(getFullyWatchedChannels(hideShorts));
    const failInfo = failures > 0 ? `, ${failures} failed` : "";
    setMessage(`Primed all: ${totalAdded} videos added (${totalSkipped} cached${failInfo})`);
  };
  const handleDelete = () => {
    if (filteredSubs.length === 0) return;
    const channel = filteredSubs[selectedIndex];
    const result = removeSubscription(channel.id);
    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode("list");
  };
  const handleGlobalSearch = (query) => {
    if (!query.trim()) {
      setMode("list");
      return;
    }
    setMode("list");
    setSearchQuery("");
    onGlobalSearch(query.trim());
  };
  const handleRowSelect = useCallback2((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);
  const handleRowActivate = useCallback2((visibleIndex) => {
    if (filteredSubs.length === 0 || mode !== "list") return;
    const actualIndex = scrollOffset + visibleIndex;
    const channel = filteredSubs[actualIndex];
    updateChannelLastViewed(channel.id);
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
  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings({ hideShorts: newValue });
    setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
  };
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
        /* @__PURE__ */ jsx4(
          TextInput,
          {
            value: addUrl,
            onChange: setAddUrl,
            onSubmit: handleAddSubmit,
            placeholder: "https://youtube.com/@channel"
          }
        )
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "global-search" && /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Box4, { children: [
        /* @__PURE__ */ jsx4(Text3, { color: "cyan", children: "Search YouTube: " }),
        /* @__PURE__ */ jsx4(
          TextInput,
          {
            value: searchQuery,
            onChange: setSearchQuery,
            onSubmit: handleGlobalSearch,
            placeholder: "enter search query"
          }
        )
      ] }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "confirm-delete" && filteredSubs.length > 0 && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: /* @__PURE__ */ jsxs3(Text3, { color: "red", children: [
      'Delete "',
      filteredSubs[selectedIndex]?.name,
      '"? (y/N)'
    ] }) }),
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
    mode === "list" && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: subscriptions.length === 0 ? /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "No subscriptions yet." }),
      /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "Press (a) to add a channel." })
    ] }) : visibleChannels.map((sub, index) => {
      const hasNew = newCounts.get(sub.id) > 0;
      const isFullyWatched = fullyWatched.has(sub.id);
      const actualIndex = scrollOffset + index;
      return /* @__PURE__ */ jsx4(
        ClickableRow,
        {
          index,
          onSelect: handleRowSelect,
          onActivate: handleRowActivate,
          children: /* @__PURE__ */ jsx4(
            ChannelRow,
            {
              name: sub.name,
              isSelected: actualIndex === selectedIndex,
              hasNew,
              isFullyWatched
            }
          )
        },
        sub.id
      );
    }) }),
    mode === "confirm-mark-all" && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: /* @__PURE__ */ jsx4(Text3, { children: "Clear all new video indicators? (y/n)" }) }),
    /* @__PURE__ */ jsxs3(Box4, { flexDirection: "column", children: [
      error && /* @__PURE__ */ jsx4(Box4, { children: /* @__PURE__ */ jsxs3(Text3, { color: "red", children: [
        "Error: ",
        error
      ] }) }),
      message && /* @__PURE__ */ jsx4(Box4, { children: /* @__PURE__ */ jsx4(Text3, { color: "green", children: message }) }),
      /* @__PURE__ */ jsx4(StatusBar, { children: isFiltering ? /* @__PURE__ */ jsxs3(Text3, { children: [
        /* @__PURE__ */ jsx4(Text3, { color: "yellow", children: "Filter: " }),
        /* @__PURE__ */ jsx4(Text3, { children: filterText }),
        /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "_" }),
        /* @__PURE__ */ jsx4(Text3, { color: "gray", children: "  (Enter to confirm, Esc to cancel)" })
      ] }) : mode === "list" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "a", description: "dd", onClick: () => {
          setMode("add");
          setAddUrl("");
        } }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "d", description: "elete", onClick: () => setMode("confirm-delete") }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "w", description: "atched", onClick: () => {
          if (filteredSubs.length > 0) {
            const channel = filteredSubs[selectedIndex];
            const videos = getStoredVideos(channel.id);
            const filteredVideos = hideShorts ? videos.filter((v) => !v.isShort) : videos;
            const videoIds = filteredVideos.map((v) => v.id);
            const count = markChannelAllWatched(videoIds);
            setNewCounts(getNewVideoCounts(hideShorts));
            setFullyWatched(getFullyWatchedChannels(hideShorts));
            setMessage(`Marked ${count} videos as watched in ${channel.name}`);
          }
        } }),
        subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "p", description: "rime all", onClick: () => {
          setMode("confirm-prime-all");
        } }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "v", description: "iew all", onClick: onBrowseAll }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "g", description: "lobal", onClick: () => {
          setMode("global-search");
          setSearchQuery("");
        } }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "/", description: " filter", onClick: () => setIsFiltering(true) }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "s", description: hideShorts ? " +shorts" : " -shorts", onClick: () => {
          const newValue = !hideShorts;
          setHideShorts(newValue);
          updateSettings({ hideShorts: newValue });
          setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
        } }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "r", description: "efresh", onClick: () => {
          if (subscriptions.length > 0 && !loading) {
            const refresh = async () => {
              setLoading(true);
              setLoadingMessage("Checking for new videos...");
              await refreshAllVideos(subscriptions);
              setNewCounts(getNewVideoCounts(hideShorts));
              setFullyWatched(getFullyWatchedChannels(hideShorts));
              setLoading(false);
              setLoadingMessage("");
              setMessage("Refreshed");
            };
            refresh();
          }
        } }),
        /* @__PURE__ */ jsx4(KeyHint, { keyName: "q", description: "uit", onClick: onQuit })
      ] }) })
    ] })
  ] });
}

// src/screens/VideoList.jsx
import React5, { useState as useState2, useEffect as useEffect2, useCallback as useCallback3, useRef as useRef3, memo as memo2 } from "react";
import { Box as Box5, Text as Text4, useInput as useInput2, useStdout as useStdout4 } from "ink";

// src/lib/player.js
import { execa as execa2 } from "execa";
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
  const players = ["mpv", "iina", "vlc"];
  const available = [];
  for (const player of players) {
    if (await checkPlayer(player)) {
      available.push(player);
    }
  }
  return available;
}
async function autoDetectPlayer() {
  const available = await getAvailablePlayers();
  const preferred = ["mpv", "iina", "vlc"];
  for (const player of preferred) {
    if (available.includes(player)) {
      updateSettings({ player });
      return player;
    }
  }
  return null;
}
async function playVideo(videoUrl, videoId) {
  let settings = getSettings();
  let player = settings.player || "mpv";
  const id = videoId || extractVideoId(videoUrl);
  if (id) {
    markAsWatched(id);
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
    if (player === "mpv") {
      const subprocess2 = execa2("mpv", [
        "--force-window=immediate",
        "--keep-open=no",
        videoUrl
      ], {
        stdio: "ignore",
        detached: true,
        reject: false
      });
      subprocess2.unref();
      return { success: true, player: "mpv" };
    }
    if (player === "iina") {
      const subprocess2 = execa2("iina", [
        "--no-stdin",
        videoUrl
      ], {
        stdio: "ignore",
        detached: true,
        reject: false
      });
      subprocess2.unref();
      return { success: true, player: "iina" };
    }
    if (player === "vlc") {
      const subprocess2 = execa2("vlc", [
        "--no-video-title-show",
        videoUrl
      ], {
        stdio: "ignore",
        detached: true,
        reject: false
      });
      subprocess2.unref();
      return { success: true, player: "vlc" };
    }
    const subprocess = execa2("open", [videoUrl], {
      stdio: "ignore",
      detached: true,
      reject: false
    });
    subprocess.unref();
    return { success: true, player: "browser" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// src/screens/VideoList.jsx
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var VideoRow = memo2(function VideoRow2({
  pointer,
  channelText,
  titleText,
  dateText,
  isSelected,
  isWatched,
  showChannel
}) {
  const getColor = (defaultColor) => {
    if (isSelected) return "cyan";
    return defaultColor;
  };
  return /* @__PURE__ */ jsxs4(Fragment3, { children: [
    /* @__PURE__ */ jsx5(Text4, { color: getColor(void 0), dimColor: isWatched && !isSelected, children: pointer }),
    showChannel && /* @__PURE__ */ jsx5(Text4, { color: getColor("yellow"), dimColor: isWatched && !isSelected, children: channelText }),
    /* @__PURE__ */ jsx5(Text4, { color: getColor(void 0), dimColor: isWatched && !isSelected, children: titleText }),
    /* @__PURE__ */ jsx5(Text4, { color: getColor("gray"), children: dateText }),
    !isWatched && /* @__PURE__ */ jsx5(Text4, { color: "green", children: " \u25CF" })
  ] });
});
function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState2([]);
  const [watchedIds, setWatchedIds] = useState2(() => getWatchedIds());
  const [selectedIndex, setSelectedIndex] = useState2(0);
  const [scrollOffset, setScrollOffset] = useState2(0);
  const [loading, setLoading] = useState2(true);
  const [error, setError] = useState2(null);
  const [message, setMessage] = useState2(null);
  const [playing, setPlaying] = useState2(false);
  const [hideShorts, setHideShorts] = useState2(() => getSettings().hideShorts ?? true);
  const [filterText, setFilterText] = useState2("");
  const [isFiltering, setIsFiltering] = useState2(false);
  const [currentPage, setCurrentPage] = useState2(0);
  const [totalVideos, setTotalVideos] = useState2(0);
  const [pageSize, setPageSize] = useState2(100);
  const [mode, setMode] = useState2("list");
  const channelIdsRef = useRef3(null);
  const { stdout } = useStdout4();
  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const visibleCount = Math.max(5, Math.floor((terminalHeight - 6) * 0.95));
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
  const initialLoad = useCallback3(async () => {
    setLoading(true);
    setError(null);
    setWatchedIds(getWatchedIds());
    try {
      const settings = getSettings();
      const limit = settings.videosPerChannel || 15;
      if (channel) {
        const channelVideos = await getChannelVideos(channel, limit);
        setAllVideos(channelVideos);
        setTotalVideos(channelVideos.length);
        setCurrentPage(0);
      } else {
        const subscriptions = getSubscriptions();
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
  }, [channel]);
  const loadPage = useCallback3((page) => {
    if (!channelIdsRef.current || channel) return;
    const result = getVideoPage(channelIdsRef.current, page, 100);
    setAllVideos(result.videos);
    setTotalVideos(result.total);
    setSelectedIndex(0);
  }, [channel]);
  useEffect2(() => {
    initialLoad();
  }, [initialLoad]);
  useEffect2(() => {
    if (!loading && !channel && channelIdsRef.current && currentPage > 0) {
      loadPage(currentPage);
    }
  }, [currentPage, loading, channel, loadPage]);
  useEffect2(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 3e3);
      return () => clearTimeout(timer);
    }
  }, [message, error]);
  useInput2((input, key) => {
    if (playing) return;
    const blockingLoad = loading && mode !== "list";
    if (blockingLoad) return;
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText("");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (key.return) {
        setIsFiltering(false);
      } else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        setSelectedIndex(0);
        setScrollOffset(0);
      }
      return;
    }
    if (mode === "confirm-mark-all") {
      if (input === "n" || input === "N" || key.escape) {
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) {
        const videoIds = allVideos.map((v) => v.id);
        markChannelAllWatched(videoIds);
        setWatchedIds(getWatchedIds());
        setMessage(`Marked ${videoIds.length} videos as watched`);
        setMode("list");
      }
      return;
    }
    if (key.escape || input === "b") {
      if (filterText) {
        setFilterText("");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else {
        onBack();
      }
    } else if (input === "q") {
      process.exit(0);
    } else if (input === "r" && !loading) {
      setScrollOffset(0);
      initialLoad();
    } else if (input === "s") {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setSelectedIndex(0);
      setScrollOffset(0);
      setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
    } else if (input === "/") {
      setIsFiltering(true);
    } else if (input === "n" && !channel && currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (input === "p" && !channel && currentPage > 0) {
      setCurrentPage((p) => p - 1);
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (input === "w" && filteredVideos.length > 0) {
      const video = filteredVideos[selectedIndex];
      const nowWatched = toggleWatched(video.id);
      setWatchedIds(getWatchedIds());
      setMessage(nowWatched ? "Marked as watched" : "Marked as unwatched");
    } else if (input === "m" && channel && filteredVideos.length > 0) {
      setMode("confirm-mark-all");
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredVideos.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) {
          setScrollOffset(newIndex - visibleCount + 1);
        }
        return newIndex;
      });
    } else if (key.return && !loading) {
      handlePlay();
    }
  });
  const handlePlay = async () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    if (!video || !video.url) {
      setError("No video selected");
      return;
    }
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }
    setPlaying(false);
  };
  const handleRowSelect = useCallback3((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);
  const handleRowActivate = useCallback3(async (visibleIndex) => {
    if (filteredVideos.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + visibleIndex;
    const video = filteredVideos[actualIndex];
    if (!video || !video.url) {
      return;
    }
    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }
    setPlaying(false);
  }, [filteredVideos, scrollOffset, playing, loading]);
  const truncate = (text, maxLen) => {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen - 1) + "\u2026" : text;
  };
  const pad = (text, width) => {
    if (!text) return " ".repeat(width);
    if (text.length >= width) return text.slice(0, width);
    return text + " ".repeat(width - text.length);
  };
  const showChannel = !channel;
  const channelColWidth = showChannel ? 32 : 0;
  const dateColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - dateColWidth - 2;
  const title = channel ? channel.name : "All Videos";
  const filterInfo = filterText ? ` (filter: "${filterText}")` : "";
  const pageInfo = !channel && totalPages > 1 ? ` [${currentPage + 1}/${totalPages}]` : "";
  const subtitle = `${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}${filterInfo}${pageInfo}`;
  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings({ hideShorts: newValue });
    setSelectedIndex(0);
    setScrollOffset(0);
    setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
  };
  return /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx5(
      Header,
      {
        title,
        subtitle,
        loading,
        loadingMessage: loading ? "Refreshing..." : "",
        hideShorts,
        onToggleShorts: handleToggleShorts
      }
    ),
    mode === "confirm-mark-all" && /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsxs4(Text4, { children: [
      "Mark all ",
      allVideos.length,
      " videos as watched? (y/n)"
    ] }) }),
    error && !filteredVideos.length && /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsx5(Text4, { color: "red", children: error }) }),
    !loading && filteredVideos.length === 0 && !error && /* @__PURE__ */ jsx5(Text4, { color: "gray", children: "No videos found." }),
    filteredVideos.length > 0 && /* @__PURE__ */ jsx5(Box5, { flexDirection: "column", children: visibleVideos.map((video, index) => {
      const actualIndex = scrollOffset + index;
      const isSelected = actualIndex === selectedIndex;
      const isWatched = watchedIds.has(video.id);
      const pointer = isSelected ? ">" : " ";
      const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : "";
      const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
      const dateText = "  " + pad(video.relativeDate || "", dateColWidth - 2);
      return /* @__PURE__ */ jsx5(
        ClickableRow,
        {
          index,
          onSelect: handleRowSelect,
          onActivate: handleRowActivate,
          children: /* @__PURE__ */ jsx5(
            VideoRow,
            {
              pointer,
              channelText,
              titleText,
              dateText,
              isSelected,
              isWatched,
              showChannel
            }
          )
        },
        video.id
      );
    }) }),
    /* @__PURE__ */ jsxs4(Box5, { flexDirection: "column", children: [
      message && /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsx5(Text4, { color: "green", children: message }) }),
      error && filteredVideos.length > 0 && /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsx5(Text4, { color: "red", children: error }) }),
      /* @__PURE__ */ jsx5(StatusBar, { children: isFiltering ? /* @__PURE__ */ jsxs4(Text4, { children: [
        /* @__PURE__ */ jsx5(Text4, { color: "yellow", children: "Filter: " }),
        /* @__PURE__ */ jsx5(Text4, { children: filterText }),
        /* @__PURE__ */ jsx5(Text4, { color: "gray", children: "_" }),
        /* @__PURE__ */ jsx5(Text4, { color: "gray", children: "  (Enter to confirm, Esc to cancel)" })
      ] }) : /* @__PURE__ */ jsxs4(Fragment3, { children: [
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "Enter", description: " play", onClick: handlePlay }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "w", description: "atched", onClick: () => {
          if (filteredVideos.length > 0) {
            const video = filteredVideos[selectedIndex];
            const nowWatched = toggleWatched(video.id);
            setWatchedIds(getWatchedIds());
            setMessage(nowWatched ? "Marked as watched" : "Marked as unwatched");
          }
        } }),
        channel && /* @__PURE__ */ jsx5(KeyHint, { keyName: "m", description: "ark all", onClick: () => setMode("confirm-mark-all") }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "/", description: " filter", onClick: () => setIsFiltering(true) }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "s", description: hideShorts ? " +shorts" : " -shorts", onClick: () => {
          const newValue = !hideShorts;
          setHideShorts(newValue);
          updateSettings({ hideShorts: newValue });
          setSelectedIndex(0);
          setScrollOffset(0);
          setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
        } }),
        !channel && totalPages > 1 && /* @__PURE__ */ jsxs4(Fragment3, { children: [
          /* @__PURE__ */ jsx5(KeyHint, { keyName: "n", description: "ext", onClick: () => {
            if (currentPage < totalPages - 1) {
              setCurrentPage((p) => p + 1);
              setSelectedIndex(0);
              setScrollOffset(0);
            }
          } }),
          /* @__PURE__ */ jsx5(KeyHint, { keyName: "p", description: "rev", onClick: () => {
            if (currentPage > 0) {
              setCurrentPage((p) => p - 1);
              setSelectedIndex(0);
              setScrollOffset(0);
            }
          } })
        ] }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "r", description: "efresh", onClick: () => {
          if (!loading) {
            setScrollOffset(0);
            initialLoad();
          }
        } }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "b", description: "ack", onClick: () => {
          if (filterText) {
            setFilterText("");
            setSelectedIndex(0);
            setScrollOffset(0);
          } else {
            onBack();
          }
        } }),
        /* @__PURE__ */ jsx5(KeyHint, { keyName: "q", description: "uit", onClick: () => process.exit(0) })
      ] }) })
    ] })
  ] });
}

// src/screens/SearchResults.jsx
import React6, { useState as useState3, useEffect as useEffect3, memo as memo3, useCallback as useCallback4 } from "react";
import { Box as Box6, Text as Text5, useInput as useInput3, useStdout as useStdout5 } from "ink";
import TextInput2 from "ink-text-input";
import { Fragment as Fragment4, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var VideoRow3 = memo3(function VideoRow4({
  pointer,
  channelText,
  titleText,
  durationText,
  isSelected,
  isWatched
}) {
  return /* @__PURE__ */ jsxs5(Fragment4, { children: [
    /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : void 0, dimColor: isWatched && !isSelected, children: pointer }),
    /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : "yellow", dimColor: isWatched && !isSelected, children: channelText }),
    /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : void 0, dimColor: isWatched && !isSelected, children: titleText }),
    /* @__PURE__ */ jsx6(Text5, { color: isSelected ? "cyan" : "gray", children: durationText }),
    !isWatched && /* @__PURE__ */ jsx6(Text5, { color: "green", children: " \u25CF" })
  ] });
});
function SearchResults({ query, onBack, onNewSearch }) {
  const [currentQuery, setCurrentQuery] = useState3(query);
  const [searchInput, setSearchInput] = useState3("");
  const [results, setResults] = useState3([]);
  const [watchedIds, setWatchedIds] = useState3(() => getWatchedIds());
  const [selectedIndex, setSelectedIndex] = useState3(0);
  const [scrollOffset, setScrollOffset] = useState3(0);
  const [loading, setLoading] = useState3(true);
  const [error, setError] = useState3(null);
  const [message, setMessage] = useState3(null);
  const [playing, setPlaying] = useState3(false);
  const [mode, setMode] = useState3("list");
  const { stdout } = useStdout5();
  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const visibleCount = Math.max(5, Math.floor((terminalHeight - 6) * 0.95));
  const visibleVideos = results.slice(scrollOffset, scrollOffset + visibleCount);
  useEffect3(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      setSelectedIndex(0);
      setScrollOffset(0);
      try {
        const searchResults = await searchYouTube(currentQuery, 50);
        setResults(searchResults);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [currentQuery]);
  useEffect3(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 3e3);
      return () => clearTimeout(timer);
    }
  }, [message, error]);
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
      if (input === "n" || input === "N" || key.escape) {
        setMode("list");
      } else if (input === "y" || input === "Y" || key.return) {
        handleAddChannel();
      }
      return;
    }
    if (key.escape || input === "b") {
      onBack();
    } else if (input === "q") {
      process.exit(0);
    } else if (input === "g") {
      setMode("new-search");
      setSearchInput("");
    } else if (input === "a" && results.length > 0) {
      const video = results[selectedIndex];
      if (video.channelId) {
        setMode("confirm-add");
      } else {
        setError("Cannot add channel - no channel ID available");
      }
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const newIndex = Math.min(results.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) {
          setScrollOffset(newIndex - visibleCount + 1);
        }
        return newIndex;
      });
    } else if (key.return) {
      handlePlay();
    }
  });
  const handlePlay = async () => {
    if (results.length === 0) return;
    const video = results[selectedIndex];
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }
    setPlaying(false);
  };
  const handleRowSelect = useCallback4((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);
  const handleRowActivate = useCallback4(async (visibleIndex) => {
    if (results.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + visibleIndex;
    const video = results[actualIndex];
    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }
    setPlaying(false);
  }, [results, scrollOffset, playing, loading]);
  const handleAddChannel = async () => {
    const video = results[selectedIndex];
    const subs = getSubscriptions();
    if (subs.some((s) => s.id === video.channelId)) {
      setMessage(`Already subscribed to ${video.channelName}`);
      setMode("list");
      return;
    }
    const channelInfo = {
      id: video.channelId,
      name: video.channelName,
      url: `https://www.youtube.com/channel/${video.channelId}`
    };
    const result = addSubscription(channelInfo);
    if (result.success) {
      setMessage(`Added: ${video.channelName}`);
    } else {
      setError(result.error);
    }
    setMode("list");
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
  const truncate = (text, maxLen) => {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen - 1) + "..." : text;
  };
  const pad = (text, width) => {
    if (!text) return " ".repeat(width);
    if (text.length >= width) return text.slice(0, width);
    return text + " ".repeat(width - text.length);
  };
  const channelColWidth = 24;
  const durationColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - durationColWidth - 2;
  const subtitle = loading ? "" : `${results.length} result${results.length !== 1 ? "s" : ""} for "${currentQuery}"`;
  return /* @__PURE__ */ jsxs5(Box6, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx6(
      Header,
      {
        title: "Search YouTube",
        subtitle,
        loading,
        loadingMessage: loading ? "Searching..." : ""
      }
    ),
    mode === "new-search" && /* @__PURE__ */ jsxs5(Box6, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs5(Box6, { children: [
        /* @__PURE__ */ jsx6(Text5, { color: "cyan", children: "New search: " }),
        /* @__PURE__ */ jsx6(
          TextInput2,
          {
            value: searchInput,
            onChange: setSearchInput,
            onSubmit: handleNewSearch,
            placeholder: "enter search query"
          }
        )
      ] }),
      /* @__PURE__ */ jsx6(Text5, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    mode === "confirm-add" && results.length > 0 && /* @__PURE__ */ jsx6(Box6, { children: /* @__PURE__ */ jsxs5(Text5, { color: "cyan", children: [
      'Subscribe to "',
      results[selectedIndex]?.channelName,
      '"? (Y/n)'
    ] }) }),
    error && !results.length && /* @__PURE__ */ jsx6(Box6, { children: /* @__PURE__ */ jsx6(Text5, { color: "red", children: error }) }),
    !loading && results.length === 0 && !error && /* @__PURE__ */ jsx6(Text5, { color: "gray", children: "No results found." }),
    results.length > 0 && mode === "list" && /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", children: visibleVideos.map((video, index) => {
      const actualIndex = scrollOffset + index;
      const isSelected = actualIndex === selectedIndex;
      const isWatched = watchedIds.has(video.id);
      const pointer = isSelected ? ">" : " ";
      const channelText = pad(truncate(video.channelName, channelColWidth - 1), channelColWidth);
      const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
      const durationText = pad(video.durationString || "--:--", durationColWidth);
      return /* @__PURE__ */ jsx6(
        ClickableRow,
        {
          index,
          onSelect: handleRowSelect,
          onActivate: handleRowActivate,
          children: /* @__PURE__ */ jsx6(
            VideoRow3,
            {
              pointer,
              channelText,
              titleText,
              durationText,
              isSelected,
              isWatched
            }
          )
        },
        video.id
      );
    }) }),
    /* @__PURE__ */ jsxs5(Box6, { flexDirection: "column", children: [
      message && /* @__PURE__ */ jsx6(Box6, { children: /* @__PURE__ */ jsx6(Text5, { color: "green", children: message }) }),
      error && results.length > 0 && /* @__PURE__ */ jsx6(Box6, { children: /* @__PURE__ */ jsx6(Text5, { color: "red", children: error }) }),
      /* @__PURE__ */ jsx6(StatusBar, { children: mode === "list" && /* @__PURE__ */ jsxs5(Fragment4, { children: [
        /* @__PURE__ */ jsx6(KeyHint, { keyName: "Enter", description: " play", onClick: handlePlay }),
        /* @__PURE__ */ jsx6(KeyHint, { keyName: "a", description: "dd channel", onClick: () => {
          if (results.length > 0) {
            const video = results[selectedIndex];
            if (video.channelId) {
              setMode("confirm-add");
            } else {
              setError("Cannot add channel - no channel ID available");
            }
          }
        } }),
        /* @__PURE__ */ jsx6(KeyHint, { keyName: "g", description: " new search", onClick: () => {
          setMode("new-search");
          setSearchInput("");
        } }),
        /* @__PURE__ */ jsx6(KeyHint, { keyName: "b", description: "ack", onClick: onBack }),
        /* @__PURE__ */ jsx6(KeyHint, { keyName: "q", description: "uit", onClick: () => process.exit(0) })
      ] }) })
    ] })
  ] });
}

// src/App.jsx
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState4(initialChannel ? "videos" : "channels");
  const [selectedChannel, setSelectedChannel] = useState4(initialChannel || null);
  const [searchQuery, setSearchQuery] = useState4("");
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
  return /* @__PURE__ */ jsxs6(Box7, { flexDirection: "column", children: [
    screen === "channels" && /* @__PURE__ */ jsx7(
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
    screen === "videos" && /* @__PURE__ */ jsx7(
      VideoList,
      {
        channel: selectedChannel,
        onBack: handleBack
      }
    ),
    screen === "search" && /* @__PURE__ */ jsx7(
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
    $ youtube-cli --prime            # Prime all channels
    $ youtube-cli --prime 3          # Prime channel #3
    $ youtube-cli --prime "fireship" # Prime by name

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
    add: {
      type: "string",
      shortFlag: "a"
    },
    list: {
      type: "boolean",
      shortFlag: "l"
    },
    channel: {
      type: "number",
      shortFlag: "c"
    },
    prime: {
      type: "string",
      shortFlag: "p"
    }
  }
});
async function main() {
  if (cli.flags.add) {
    console.log(`Fetching channel info for: ${cli.flags.add}`);
    try {
      const channelInfo = await getChannelInfo(cli.flags.add);
      const result = addSubscription(channelInfo);
      if (result.success) {
        console.log(`Added: ${channelInfo.name}`);
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        const answer = await new Promise((resolve) => {
          rl.question("Prime historical videos? (Y/n) ", resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== "n") {
          console.log("");
          process.stdout.write(`${channelInfo.name}: fetching...`);
          try {
            const primeResult = await primeChannel(channelInfo, (done, total) => {
              process.stdout.clearLine(0);
              process.stdout.cursorTo(0);
              process.stdout.write(`${channelInfo.name}: ${done}/${total} videos`);
            });
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            if (primeResult.partial) {
              console.log(`${channelInfo.name}: added ${primeResult.added} videos (partial - some timed out)`);
            } else {
              console.log(`${channelInfo.name}: added ${primeResult.added} videos`);
            }
          } catch (err) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            console.log(`${channelInfo.name}: failed - ${err.message}`);
          }
        }
      } else {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Failed to add channel: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  if (cli.flags.list) {
    const subs = getSubscriptions();
    if (subs.length === 0) {
      console.log("No subscriptions yet. Use --add <url> to add one.");
    } else {
      console.log("Subscriptions:");
      subs.forEach((sub, i) => {
        console.log(`  ${i + 1}. ${sub.name}`);
        console.log(`     ${sub.url}`);
      });
    }
    return;
  }
  if (cli.flags.prime !== void 0) {
    const subs = getSubscriptions();
    if (subs.length === 0) {
      console.log("No subscriptions yet. Use --add <url> to add one.");
      return;
    }
    let channelsToPrime = subs;
    if (cli.flags.prime !== "") {
      const query = cli.flags.prime;
      const index = parseInt(query, 10);
      if (!isNaN(index) && index >= 1 && index <= subs.length) {
        channelsToPrime = [subs[index - 1]];
      } else {
        const search = query.toLowerCase();
        const matches = subs.filter(
          (s) => s.name.toLowerCase().includes(search)
        );
        if (matches.length === 0) {
          console.error(`No channel found matching "${query}"`);
          process.exit(1);
        } else if (matches.length > 1) {
          console.log(`Multiple channels match "${query}":`);
          for (const [i, m] of matches.entries()) {
            console.log(`  ${i + 1}. ${m.name}`);
          }
          console.log("\nBe more specific or use the index number.");
          process.exit(1);
        }
        channelsToPrime = matches;
      }
    }
    console.log(`Priming ${channelsToPrime.length} channel(s) with full history...`);
    console.log("This may take a while.\n");
    for (const channel of channelsToPrime) {
      process.stdout.write(`${channel.name}: fetching...`);
      try {
        const result = await primeChannel(channel, (done, total) => {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`${channel.name}: ${done}/${total} videos`);
        });
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        if (result.partial) {
          console.log(`${channel.name}: added ${result.added} videos (partial - some timed out)`);
        } else {
          console.log(`${channel.name}: added ${result.added} videos`);
        }
      } catch (err) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(`${channel.name}: failed - ${err.message}`);
      }
    }
    console.log("\nDone!");
    return;
  }
  let initialChannel = null;
  if (cli.flags.channel) {
    const subs = getSubscriptions();
    const index = cli.flags.channel - 1;
    if (index >= 0 && index < subs.length) {
      initialChannel = subs[index];
    } else {
      console.error(`Invalid channel index. You have ${subs.length} subscription(s).`);
      process.exit(1);
    }
  }
  process.stdout.write("\x1B[?1049h");
  process.stdout.write("\x1B[H");
  const restoreScreen = () => {
    process.stdout.write("\x1B[?1049l");
  };
  process.on("exit", restoreScreen);
  process.on("SIGINT", () => {
    restoreScreen();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    restoreScreen();
    process.exit(0);
  });
  render(
    React8.createElement(
      MouseProvider,
      { cacheInvalidationMs: 0 },
      React8.createElement(App, { initialChannel })
    )
  );
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
