#!/usr/bin/env node

// src/cli.jsx
import React7 from "react";
import { render } from "ink";
import meow from "meow";

// src/App.jsx
import React6, { useState as useState3 } from "react";
import { Box as Box6, useApp } from "ink";

// src/screens/ChannelList.jsx
import React4, { useState, useEffect } from "react";
import { Box as Box4, Text as Text4, useInput } from "ink";
import TextInput from "ink-text-input";

// src/components/Header.jsx
import React from "react";
import { Box, Text, useStdout } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ title, subtitle, hints }) {
  const { stdout } = useStdout();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: "ytsub" }),
      title && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { color: "gray", children: " - " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: title })
      ] }),
      subtitle && /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
        " (",
        subtitle,
        ")"
      ] })
    ] }),
    hints && /* @__PURE__ */ jsx(Box, { marginTop: 0, children: /* @__PURE__ */ jsx(Text, { color: "gray", children: hints }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "gray", children: "\u2500".repeat(width) }) })
  ] });
}

// src/components/Loading.jsx
import React2 from "react";
import { Box as Box2, Text as Text2 } from "ink";
import Spinner from "ink-spinner";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Loading({ message = "Loading..." }) {
  return /* @__PURE__ */ jsxs2(Box2, { children: [
    /* @__PURE__ */ jsx2(Text2, { color: "cyan", children: /* @__PURE__ */ jsx2(Spinner, { type: "dots" }) }),
    /* @__PURE__ */ jsxs2(Text2, { children: [
      " ",
      message
    ] })
  ] });
}

// src/components/StatusBar.jsx
import React3 from "react";
import { Box as Box3, Text as Text3, useStdout as useStdout2 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function StatusBar({ children }) {
  const { stdout } = useStdout2();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
  return /* @__PURE__ */ jsxs3(Box3, { marginTop: 1, flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(Box3, { children: /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "\u2500".repeat(width) }) }),
    /* @__PURE__ */ jsx3(Box3, { children })
  ] });
}
function KeyHint({ keyName, description }) {
  return /* @__PURE__ */ jsxs3(Box3, { marginRight: 2, children: [
    /* @__PURE__ */ jsxs3(Text3, { color: "yellow", children: [
      "(",
      keyName,
      ")"
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: "gray", children: description })
  ] });
}

// src/lib/config.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var CONFIG_DIR = join(homedir(), ".config", "ytsub");
var CONFIG_FILE = join(CONFIG_DIR, "subscriptions.json");
var WATCHED_FILE = join(CONFIG_DIR, "watched.json");
var DEFAULT_CONFIG = {
  subscriptions: [],
  settings: {
    player: "mpv",
    videosPerChannel: 15,
    hideShorts: false
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
  const videos = await fetchChannelRSS(channel.id, channel.name);
  return videos.slice(0, limit);
}
async function fetchChannelRSS(channelId, channelName) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const { stdout } = await execa("curl", ["-s", rssUrl]);
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match = entryRegex.exec(stdout);
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
      match = entryRegex.exec(stdout);
    }
    return entries;
  } catch {
    return [];
  }
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
  const now = /* @__PURE__ */ new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
  if (diffDays < 0) return "upcoming";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
async function getAllVideos(subscriptions, limitPerChannel = 15) {
  const promises = subscriptions.map(
    (sub) => fetchChannelRSS(sub.id, sub.name)
  );
  const results = await Promise.all(promises);
  const allVideos = results.flat();
  allVideos.sort((a, b) => {
    if (!a.publishedDate || !b.publishedDate) return 0;
    return b.publishedDate.getTime() - a.publishedDate.getTime();
  });
  return allVideos.slice(0, limitPerChannel * subscriptions.length);
}

// src/screens/ChannelList.jsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function ChannelList({ onSelectChannel, onBrowseAll, onQuit }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState("list");
  const [addUrl, setAddUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    setSubscriptions(getSubscriptions());
  }, []);
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
    if (loading) return;
    if (mode === "add") {
      if (key.escape) {
        setMode("list");
        setAddUrl("");
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
    if (input === "q") {
      onQuit();
    } else if (input === "a") {
      setMode("add");
      setAddUrl("");
    } else if (input === "d" && subscriptions.length > 0) {
      setMode("confirm-delete");
    } else if (input === "v") {
      onBrowseAll();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(subscriptions.length - 1, i + 1));
    } else if (key.return) {
      if (subscriptions.length > 0) {
        onSelectChannel(subscriptions[selectedIndex]);
      }
    }
  });
  const handleAddSubmit = async (url) => {
    if (!url.trim()) {
      setMode("list");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const channelInfo = await getChannelInfo(url);
      const result = addSubscription(channelInfo);
      if (result.success) {
        setSubscriptions(getSubscriptions());
        setMessage(`Added: ${channelInfo.name}`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setMode("list");
      setAddUrl("");
    }
  };
  const handleDelete = () => {
    if (subscriptions.length === 0) return;
    const channel = subscriptions[selectedIndex];
    const result = removeSubscription(selectedIndex);
    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode("list");
  };
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx4(
      Header,
      {
        title: "Channels",
        subtitle: `${subscriptions.length} subscription${subscriptions.length !== 1 ? "s" : ""}`
      }
    ),
    loading && /* @__PURE__ */ jsx4(Loading, { message: "Fetching channel info..." }),
    !loading && mode === "add" && /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: "Enter channel URL: " }),
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
      /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Press ESC to cancel" })
    ] }),
    !loading && mode === "confirm-delete" && subscriptions.length > 0 && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: /* @__PURE__ */ jsxs4(Text4, { color: "red", children: [
      'Delete "',
      subscriptions[selectedIndex].name,
      '"? (y/N)'
    ] }) }),
    !loading && mode === "list" && /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: subscriptions.length === 0 ? /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "No subscriptions yet." }),
      /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Press (a) to add a channel." })
    ] }) : subscriptions.map((sub, index) => /* @__PURE__ */ jsx4(Box4, { children: /* @__PURE__ */ jsxs4(Text4, { color: index === selectedIndex ? "cyan" : void 0, children: [
      index === selectedIndex ? ">" : " ",
      " ",
      sub.name
    ] }) }, sub.id || index)) }),
    error && /* @__PURE__ */ jsx4(Box4, { marginTop: 1, children: /* @__PURE__ */ jsxs4(Text4, { color: "red", children: [
      "Error: ",
      error
    ] }) }),
    message && /* @__PURE__ */ jsx4(Box4, { marginTop: 1, children: /* @__PURE__ */ jsx4(Text4, { color: "green", children: message }) }),
    /* @__PURE__ */ jsx4(StatusBar, { children: mode === "list" && /* @__PURE__ */ jsxs4(Fragment2, { children: [
      /* @__PURE__ */ jsx4(KeyHint, { keyName: "a", description: "dd" }),
      subscriptions.length > 0 && /* @__PURE__ */ jsx4(KeyHint, { keyName: "d", description: "elete" }),
      /* @__PURE__ */ jsx4(KeyHint, { keyName: "v", description: "iew all" }),
      /* @__PURE__ */ jsx4(KeyHint, { keyName: "Enter", description: " browse" }),
      /* @__PURE__ */ jsx4(KeyHint, { keyName: "q", description: "uit" })
    ] }) })
  ] });
}

// src/screens/VideoList.jsx
import React5, { useState as useState2, useEffect as useEffect2, useCallback } from "react";
import { Box as Box5, Text as Text5, useInput as useInput2, useStdout as useStdout3 } from "ink";

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
        "--ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
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
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState2([]);
  const [watchedIds, setWatchedIds] = useState2(/* @__PURE__ */ new Set());
  const [selectedIndex, setSelectedIndex] = useState2(0);
  const [loading, setLoading] = useState2(true);
  const [error, setError] = useState2(null);
  const [message, setMessage] = useState2(null);
  const [playing, setPlaying] = useState2(false);
  const [hideShorts, setHideShorts] = useState2(() => getSettings().hideShorts ?? false);
  const videos = hideShorts ? allVideos.filter((v) => !v.isShort) : allVideos;
  const { stdout } = useStdout3();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;
  const maxVisibleVideos = Math.max(5, terminalHeight - 10);
  const scrollOffset = Math.max(0, selectedIndex - maxVisibleVideos + 3);
  const visibleVideos = videos.slice(scrollOffset, scrollOffset + maxVisibleVideos);
  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWatchedIds(getWatchedIds());
    try {
      const settings = getSettings();
      const limit = settings.videosPerChannel || 15;
      if (channel) {
        const channelVideos = await getChannelVideos(channel, limit);
        setAllVideos(channelVideos);
      } else {
        const subscriptions = getSubscriptions();
        if (subscriptions.length === 0) {
          setAllVideos([]);
          setError("No subscriptions. Go back and add some channels first.");
        } else {
          const fetchedVideos = await getAllVideos(subscriptions, Math.min(limit, 10));
          setAllVideos(fetchedVideos);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channel]);
  useEffect2(() => {
    loadVideos();
  }, [loadVideos]);
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
    if (loading || playing) return;
    if (key.escape || input === "b") {
      onBack();
    } else if (input === "q") {
      process.exit(0);
    } else if (input === "r") {
      loadVideos();
    } else if (input === "s") {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setSelectedIndex(0);
      setMessage(newValue ? "Hiding Shorts" : "Showing all videos");
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(videos.length - 1, i + 1));
    } else if (key.return) {
      handlePlay();
    }
  });
  const handlePlay = async () => {
    if (videos.length === 0) return;
    const video = videos[selectedIndex];
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
  const subtitle = loading ? "loading..." : `${videos.length} video${videos.length !== 1 ? "s" : ""}`;
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx5(Header, { title, subtitle }),
    loading && /* @__PURE__ */ jsx5(Loading, { message: channel ? `Fetching videos from ${channel.name}...` : "Fetching videos from all channels..." }),
    !loading && error && !videos.length && /* @__PURE__ */ jsx5(Box5, { children: /* @__PURE__ */ jsx5(Text5, { color: "red", children: error }) }),
    !loading && videos.length === 0 && !error && /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "No videos found." }),
    !loading && videos.length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      visibleVideos.map((video, displayIndex) => {
        const actualIndex = displayIndex + scrollOffset;
        const isSelected = actualIndex === selectedIndex;
        const isWatched = watchedIds.has(video.id);
        const getColor = (defaultColor) => {
          if (isSelected) return "cyan";
          if (isWatched) return defaultColor;
          return defaultColor;
        };
        const pointer = isSelected ? ">" : " ";
        const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : "";
        const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
        const dateText = (isWatched && !isSelected ? "* " : "  ") + pad(video.relativeDate || "", dateColWidth - 2);
        return /* @__PURE__ */ jsxs5(Box5, { children: [
          /* @__PURE__ */ jsx5(Text5, { color: getColor(void 0), dimColor: isWatched && !isSelected, children: pointer }),
          showChannel && /* @__PURE__ */ jsx5(Text5, { color: getColor("yellow"), dimColor: isWatched && !isSelected, children: channelText }),
          /* @__PURE__ */ jsx5(Text5, { color: getColor(void 0), dimColor: isWatched && !isSelected, children: titleText }),
          /* @__PURE__ */ jsx5(Text5, { color: getColor("gray"), children: dateText })
        ] }, video.id || actualIndex);
      }),
      videos.length > maxVisibleVideos && /* @__PURE__ */ jsx5(Box5, { marginTop: 1, children: /* @__PURE__ */ jsxs5(Text5, { color: "gray", children: [
        "Showing ",
        scrollOffset + 1,
        "-",
        Math.min(scrollOffset + maxVisibleVideos, videos.length),
        " of ",
        videos.length
      ] }) })
    ] }),
    message && /* @__PURE__ */ jsx5(Box5, { marginTop: 1, children: /* @__PURE__ */ jsx5(Text5, { color: "green", children: message }) }),
    error && videos.length > 0 && /* @__PURE__ */ jsx5(Box5, { marginTop: 1, children: /* @__PURE__ */ jsx5(Text5, { color: "red", children: error }) }),
    /* @__PURE__ */ jsxs5(StatusBar, { children: [
      /* @__PURE__ */ jsx5(KeyHint, { keyName: "Enter", description: " play" }),
      /* @__PURE__ */ jsx5(KeyHint, { keyName: "s", description: hideShorts ? " +shorts" : " -shorts" }),
      /* @__PURE__ */ jsx5(KeyHint, { keyName: "r", description: "efresh" }),
      /* @__PURE__ */ jsx5(KeyHint, { keyName: "b", description: "ack" }),
      /* @__PURE__ */ jsx5(KeyHint, { keyName: "q", description: "uit" })
    ] })
  ] });
}

// src/App.jsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState3(initialChannel ? "videos" : "channels");
  const [selectedChannel, setSelectedChannel] = useState3(initialChannel || null);
  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
    setScreen("videos");
  };
  const handleBrowseAll = () => {
    setSelectedChannel(null);
    setScreen("videos");
  };
  const handleBack = () => {
    setScreen("channels");
    setSelectedChannel(null);
  };
  const handleQuit = () => {
    exit();
  };
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
    screen === "channels" && /* @__PURE__ */ jsx6(
      ChannelList,
      {
        onSelectChannel: handleSelectChannel,
        onBrowseAll: handleBrowseAll,
        onQuit: handleQuit
      }
    ),
    screen === "videos" && /* @__PURE__ */ jsx6(
      VideoList,
      {
        channel: selectedChannel,
        onBack: handleBack
      }
    )
  ] });
}

// src/cli.jsx
var cli = meow(`
  Usage
    $ ytsub                    Launch the TUI
    $ ytsub --add <url>        Quick-add a channel
    $ ytsub --list             List subscriptions (non-interactive)
    $ ytsub --channel <index>  Start on a specific channel (by index)

  Options
    --add, -a       Add a channel URL directly
    --list, -l      List all subscriptions
    --channel, -c   Start viewing a specific channel (1-indexed)
    --help          Show this help message
    --version       Show version

  Examples
    $ ytsub
    $ ytsub --add https://youtube.com/@Fireship
    $ ytsub -c 1

  Navigation
    j/k or arrows   Move up/down
    Enter           Select / Play video
    a               Add subscription
    d               Delete subscription
    v               View all videos
    b / Escape      Go back
    r               Refresh videos
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
  render(React7.createElement(App, { initialChannel }));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
