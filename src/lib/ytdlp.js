import { execa } from 'execa';
import { storeVideos, getStoredVideos, getStoredVideosPaginated } from './config.js';
import { isValidYouTubeUrl, isValidVideoId, sanitizeSearchQuery, validateUrl } from './validation.js';
import { getRelativeDateFromDate, formatDateYYYYMMDD, parseDateYYYYMMDD, formatDuration, decodeXMLEntities } from './dateUtils.js';

function addRelativeDate(video) {
  return {
    ...video,
    relativeDate: video.publishedDate ? getRelativeDateFromDate(video.publishedDate) : '',
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
    isShort: link?.includes('/shorts/') ?? false,
    duration: null,
    durationString: '--:--',
    channelName,
    channelId,
    publishedDate,
    uploadDate: publishedDate ? formatDateYYYYMMDD(publishedDate) : null,
    relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : '',
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
    const { stdout } = await execa('curl', ['-s', rssUrl]);
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

export async function getChannelInfo(url) {
  const channelUrl = url.trim();
  if (!validateUrl(channelUrl)) throw new Error('Invalid URL format');
  if (!isValidYouTubeUrl(channelUrl)) throw new Error('Not a valid YouTube URL');

  const isVideoUrl = channelUrl.includes('/watch?') || channelUrl.includes('youtu.be/');

  try {
    const { stdout } = await execa('yt-dlp', [
      '--dump-json', '--playlist-items', '1', '--no-warnings', channelUrl,
    ]);
    const data = JSON.parse(stdout);
    return {
      id: data.channel_id,
      name: data.channel || data.uploader,
      url: data.channel_url || (isVideoUrl ? `https://www.youtube.com/channel/${data.channel_id}` : channelUrl),
    };
  } catch (error) {
    throw new Error(`Failed to get channel info: ${error.message}`);
  }
}

export async function getChannelVideos(channel, limit = 15) {
  const freshVideos = await fetchChannelRSS(channel.id, channel.name);
  storeVideos(freshVideos);

  const storedVideos = getStoredVideos(channel.id);
  const videoMap = new Map();

  for (const v of storedVideos) videoMap.set(v.id, v);
  for (const v of freshVideos) videoMap.set(v.id, v);

  return Array.from(videoMap.values())
    .map(addRelativeDate)
    .sort((a, b) => {
      if (!a.publishedDate || !b.publishedDate) return 0;
      return b.publishedDate.getTime() - a.publishedDate.getTime();
    });
}

export async function refreshAllVideos(subscriptions) {
  const freshVideos = await fetchAllChannelsRSS(subscriptions);
  return freshVideos.length > 0 ? storeVideos(freshVideos) : 0;
}

export function getVideoPage(channelIds, page = 0, pageSize = 100) {
  const { total, videos } = getStoredVideosPaginated(channelIds, page, pageSize);
  return { total, page, pageSize, videos: videos.map(addRelativeDate) };
}

export async function getAllVideos(subscriptions, limitPerChannel = 15, page = 0) {
  const pageSize = 100;
  const channelIds = subscriptions.map((s) => s.id);

  const results = await Promise.all(
    subscriptions.map((sub) => fetchChannelRSS(sub.id, sub.name))
  );
  const freshVideos = results.flat();

  if (freshVideos.length > 0) storeVideos(freshVideos);

  const { total, videos } = getStoredVideosPaginated(channelIds, page, pageSize);
  return { total, page, pageSize, videos: videos.map(addRelativeDate) };
}

export async function getStreamUrl(videoUrl) {
  try {
    const { stdout } = await execa('yt-dlp', [
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '-g', '--no-warnings', videoUrl,
    ]);
    return stdout.trim().split('\n');
  } catch (error) {
    throw new Error(`Failed to get stream URL: ${error.message}`);
  }
}

export async function searchYouTube(query, limit = 20) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) throw new Error('Search query cannot be empty');

  const safeLimit = Math.min(Math.max(1, limit), 50);

  try {
    const { stdout } = await execa('yt-dlp', [
      `ytsearch${safeLimit}:${sanitizedQuery}`,
      '--flat-playlist', '--dump-json', '--no-warnings',
    ], { timeout: 30000 });

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const data = JSON.parse(line);
      const publishedDate = data.release_timestamp
        ? new Date(data.release_timestamp * 1000)
        : data.timestamp ? new Date(data.timestamp * 1000) : null;

      return {
        id: data.id,
        title: data.title,
        url: data.webpage_url || data.url || `https://www.youtube.com/watch?v=${data.id}`,
        channelName: data.channel || data.uploader || 'Unknown',
        channelId: data.channel_id || null,
        duration: data.duration,
        durationString: data.duration_string || formatDuration(data.duration),
        viewCount: data.view_count,
        publishedDate,
        relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : '',
      };
    });
  } catch (error) {
    if (error.timedOut) throw new Error('Search timed out');
    throw new Error(`Search failed: ${error.message}`);
  }
}

export async function getVideoDescription(videoId) {
  if (!isValidVideoId(videoId)) throw new Error('Invalid video ID format');

  try {
    const { stdout } = await execa('yt-dlp', [
      '--dump-json', '--no-warnings',
      '--extractor-args', 'youtube:skip=dash,hls',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 15000 });

    const data = JSON.parse(stdout);
    return {
      title: data.title || '',
      description: data.description || 'No description available.',
      channelName: data.channel || data.uploader || 'Unknown',
    };
  } catch (error) {
    if (error.timedOut) throw new Error('Request timed out');
    throw new Error(`Failed to get description: ${error.message}`);
  }
}

async function fetchWithRetry(args, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { stdout } = await execa('yt-dlp', args, { timeout: 60000 });
      return stdout;
    } catch (error) {
      lastError = error;
      const isThrottled = error.message?.includes('429') ||
                          error.message?.includes('Too Many Requests') ||
                          error.message?.includes('rate limit');
      const isTimeout = error.timedOut;

      if (attempt < maxRetries - 1 && (isThrottled || isTimeout)) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
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
      '--dump-json', '--no-warnings',
      '--extractor-args', 'youtube:skip=dash,hls',
      '--socket-timeout', '30',
      ...urls,
    ], retries);

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      try {
        const data = JSON.parse(line);
        return {
          id: data.id,
          title: data.title,
          url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
          isShort: data.duration <= 60 || data.webpage_url?.includes('/shorts/'),
          duration: data.duration,
          channelName: channel.name,
          channelId: channel.id,
          publishedDate: parseDateYYYYMMDD(data.upload_date),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

class WorkerPool {
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
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  async drain() {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

export async function primeChannel(channel, onProgress) {
  let url = channel.url;
  if (!url.includes('/videos')) url = url.replace(/\/$/, '') + '/videos';

  const existingVideos = getStoredVideos(channel.id);
  const existingIds = new Set(existingVideos.map((v) => v.id));

  let added = 0;
  let total = 0;
  let failed = 0;

  try {
    const listOut = await fetchWithRetry([
      '--flat-playlist', '--print', '%(id)s', '--no-warnings',
      '--extractor-args', 'youtube:skip=dash,hls', '--playlist-end', '5000', url,
    ], 3, 2000);

    const videoIds = listOut.trim().split('\n').filter(Boolean);
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

    const batchPromises = batches.map((batch, idx) =>
      pool.run(async () => {
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
          if (toStore.length > 0) storeVideos(toStore);
        }

        return videos;
      })
    );

    await Promise.all(batchPromises);

    if (pendingStores.length > 0) {
      const remaining = pendingStores.flat();
      if (remaining.length > 0) storeVideos(remaining);
    }

    onProgress?.(newVideoIds.length, newVideoIds.length);

    return { added, total, skipped: existingIds.size, failed: failed > 0 ? failed : undefined };
  } catch (error) {
    if (added > 0) {
      return { added, total, skipped: existingIds.size, failed, error: error.message };
    }
    throw new Error(`Failed to prime channel: ${error.message}`);
  }
}
