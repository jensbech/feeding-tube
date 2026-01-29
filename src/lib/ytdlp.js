import { execa } from 'execa';
import { storeVideos, getStoredVideos, getStoredVideosPaginated } from './config.js';

/**
 * Extract channel info from a YouTube URL using yt-dlp
 */
export async function getChannelInfo(url) {
  try {
    // Normalize the URL - handle various formats
    let channelUrl = url.trim();
    
    // If it's a video URL, we need to extract channel from it
    const isVideoUrl = channelUrl.includes('/watch?') || channelUrl.includes('youtu.be/');
    
    if (isVideoUrl) {
      // Get channel info from a video
      const { stdout } = await execa('yt-dlp', [
        '--dump-json',
        '--playlist-items', '1',
        '--no-warnings',
        channelUrl,
      ]);
      
      const data = JSON.parse(stdout);
      return {
        id: data.channel_id,
        name: data.channel || data.uploader,
        url: data.channel_url || `https://www.youtube.com/channel/${data.channel_id}`,
      };
    }
    
    // For channel URLs, get the uploads playlist
    const { stdout } = await execa('yt-dlp', [
      '--dump-json',
      '--playlist-items', '1',
      '--no-warnings',
      channelUrl,
    ]);
    
    const data = JSON.parse(stdout);
    return {
      id: data.channel_id,
      name: data.channel || data.uploader,
      url: data.channel_url || channelUrl,
    };
  } catch (error) {
    throw new Error(`Failed to get channel info: ${error.message}`);
  }
}

/**
 * Get latest videos from a channel using RSS + stored history
 */
export async function getChannelVideos(channel, limit = 15) {
  // Fetch fresh from RSS
  const freshVideos = await fetchChannelRSS(channel.id, channel.name);
  
  // Store new videos
  storeVideos(freshVideos);
  
  // Get all stored videos for this channel
  const storedVideos = getStoredVideos(channel.id);
  
  // Merge: use stored data but prefer fresh data for duplicates
  const videoMap = new Map();
  for (const v of storedVideos) {
    videoMap.set(v.id, v);
  }
  for (const v of freshVideos) {
    videoMap.set(v.id, v);
  }
  
  // Convert to array, add relative dates, sort by date
  const allVideos = Array.from(videoMap.values()).map((v) => ({
    ...v,
    relativeDate: v.publishedDate ? getRelativeDateFromDate(v.publishedDate) : '',
  }));
  
  allVideos.sort((a, b) => {
    if (!a.publishedDate || !b.publishedDate) return 0;
    return b.publishedDate.getTime() - a.publishedDate.getTime();
  });
  
  return allVideos;
}

/**
 * Fetch videos from RSS feed (faster and has dates)
 */
async function fetchChannelRSS(channelId, channelName) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const { stdout } = await execa('curl', ['-s', rssUrl]);
    
    return parseRSSFeed(stdout, channelId, channelName);
  } catch {
    return [];
  }
}

/**
 * Fetch RSS feeds for multiple channels in a single curl call
 * Much faster than spawning separate processes
 */
async function fetchAllChannelsRSS(subscriptions) {
  if (subscriptions.length === 0) return [];

  // Use Promise.all with individual fetches - more reliable than bulk curl
  // Fetch in batches of 20 to avoid overwhelming the network
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

/**
 * Parse RSS feed XML into video objects
 */
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
    const isShort = link?.includes('/shorts/') ?? false;
    
    if (videoId && title) {
      const publishedDate = published ? new Date(published) : null;
      entries.push({
        id: videoId,
        title: decodeXMLEntities(title),
        url: link || `https://www.youtube.com/watch?v=${videoId}`,
        isShort,
        duration: null,
        durationString: '--:--',
        channelName,
        channelId,
        publishedDate,
        uploadDate: publishedDate ? formatDateYYYYMMDD(publishedDate) : null,
        relativeDate: publishedDate ? getRelativeDateFromDate(publishedDate) : '',
      });
    }
    match = entryRegex.exec(xml);
  }
  
  return entries;
}

/**
 * Decode XML entities
 */
function decodeXMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Format Date to YYYYMMDD
 */
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Get relative date from Date object
 */
function getRelativeDateFromDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'upcoming';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Refresh videos from RSS feeds for all subscriptions
 * Call this once on initial load, then use getVideoPage() for pagination
 * @returns {Promise<number>} Number of new videos added
 */
export async function refreshAllVideos(subscriptions) {
  // Use bulk fetch for speed (single curl process)
  const freshVideos = await fetchAllChannelsRSS(subscriptions);
  
  // Store new videos (only writes if there are actually new ones)
  const newCount = freshVideos.length > 0 ? storeVideos(freshVideos) : 0;
  return newCount;
}

/**
 * Get a page of videos from the store (fast, no network)
 * @param {Array<string>} channelIds - Channel IDs to filter by
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Videos per page (default 100)
 * @returns {{ total, page, pageSize, videos }}
 */
export function getVideoPage(channelIds, page = 0, pageSize = 100) {
  const { total, videos } = getStoredVideosPaginated(channelIds, page, pageSize);
  
  // Add relative dates
  const videosWithDates = videos.map((v) => ({
    ...v,
    relativeDate: v.publishedDate ? getRelativeDateFromDate(v.publishedDate) : '',
  }));
  
  return {
    total,
    page,
    pageSize,
    videos: videosWithDates,
  };
}

/**
 * Get videos from multiple channels using RSS feeds + stored history
 * Returns paginated results: { total, videos }
 * @deprecated Use refreshAllVideos() + getVideoPage() for better perf
 */
export async function getAllVideos(subscriptions, limitPerChannel = 15, page = 0) {
  const pageSize = 100;
  const channelIds = subscriptions.map((s) => s.id);
  
  // Fetch RSS in parallel (quick, ~15 videos per channel)
  const promises = subscriptions.map((sub) => 
    fetchChannelRSS(sub.id, sub.name)
  );
  const results = await Promise.all(promises);
  const freshVideos = results.flat();
  
  // Store new videos (updates cache + invalidates sorted index)
  if (freshVideos.length > 0) {
    storeVideos(freshVideos);
  }
  
  // Use paginated store - already sorted, only loads page needed
  const { total, videos } = getStoredVideosPaginated(channelIds, page, pageSize);
  
  // Add relative dates
  const videosWithDates = videos.map((v) => ({
    ...v,
    relativeDate: v.publishedDate ? getRelativeDateFromDate(v.publishedDate) : '',
  }));
  
  return {
    total,
    page,
    pageSize,
    videos: videosWithDates,
  };
}

/**
 * Get the streaming URL for a video (for piping to player)
 */
export async function getStreamUrl(videoUrl) {
  try {
    const { stdout } = await execa('yt-dlp', [
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '-g',
      '--no-warnings',
      videoUrl,
    ]);
    
    // Returns video and audio URLs on separate lines
    const urls = stdout.trim().split('\n');
    return urls;
  } catch (error) {
    throw new Error(`Failed to get stream URL: ${error.message}`);
  }
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
function formatDuration(seconds) {
  if (!seconds) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert YYYYMMDD to relative date string
 */
function getRelativeDate(dateStr) {
  if (!dateStr) return '';
  
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  
  const date = new Date(year, month, day);
  return getRelativeDateFromDate(date);
}

/**
 * Search YouTube for videos
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 20)
 * @returns {Promise<Array>} Search results
 */
export async function searchYouTube(query, limit = 20) {
  try {
    const { stdout } = await execa('yt-dlp', [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
    ], { timeout: 30000 });
    
    const lines = stdout.trim().split('\n').filter(Boolean);
    
    return lines.map((line) => {
      const data = JSON.parse(line);
      
      // Parse release timestamp if available
      let publishedDate = null;
      if (data.release_timestamp) {
        publishedDate = new Date(data.release_timestamp * 1000);
      } else if (data.timestamp) {
        publishedDate = new Date(data.timestamp * 1000);
      }
      
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
    if (error.timedOut) {
      throw new Error('Search timed out');
    }
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Prime historical videos for a channel using yt-dlp
 * Fetches all videos with full metadata (has dates)
 * If timeouts occur, returns what was fetched so far instead of failing
 * @param {Object} channel - Channel object with id, name, url
 * @param {Function} onProgress - Callback for progress updates (count, total)
 * @returns {Promise<{added: number, total: number, partial: boolean}>}
 */
export async function primeChannel(channel, onProgress) {

  let url = channel.url;
  if (!url.includes('/videos')) {
    url = url.replace(/\/$/, '') + '/videos';
  }
  
  let added = 0;
  let total = 0;
  let partial = false;
  
  try {
    // First get list of video IDs (fast)
    let videoIds = [];
    try {
      const { stdout: listOut } = await execa('yt-dlp', [
        '--flat-playlist',
        '--print', '%(id)s',
        '--no-warnings',
        url,
      ], { timeout: 120000 });
      
      videoIds = listOut.trim().split('\n').filter(Boolean);
    } catch (listErr) {
      // If listing times out or fails, we can't continue
      if (listErr.timedOut) {
        return { added: 0, total: 0, partial: true, error: 'Timed out fetching video list' };
      }
      throw listErr;
    }
    
    total = videoIds.length;
    let processed = 0;
    
    if (onProgress) onProgress(0, total);
    
    // Process in parallel batches
    const concurrency = 10;
    const batchSize = 5;
    
    // Create batches of video IDs
    const batches = [];
    for (let i = 0; i < videoIds.length; i += batchSize) {
      batches.push(videoIds.slice(i, i + batchSize));
    }
    
    // Process batches with limited concurrency
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      
      const results = await Promise.all(
        concurrentBatches.map(async (batch) => {
          const urls = batch.map((id) => `https://www.youtube.com/watch?v=${id}`);
          
          try {
            const { stdout } = await execa('yt-dlp', [
              '--dump-json',
              '--no-warnings',
              ...urls,
            ], { timeout: 180000 });
            
            return stdout.trim().split('\n').filter(Boolean).map((line) => {
              const data = JSON.parse(line);
              const uploadDate = data.upload_date;
              const publishedDate = uploadDate ? new Date(
                parseInt(uploadDate.slice(0, 4), 10),
                parseInt(uploadDate.slice(4, 6), 10) - 1,
                parseInt(uploadDate.slice(6, 8), 10)
              ) : null;
              
              const isShort = data.duration <= 60 || data.webpage_url?.includes('/shorts/');
              
              return {
                id: data.id,
                title: data.title,
                url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
                isShort,
                duration: data.duration,
                channelName: channel.name,
                channelId: channel.id,
                publishedDate,
              };
            });
          } catch (err) {
            // Timeout or error on batch - mark as partial but continue
            if (err.timedOut) {
              partial = true;
            }
            return [];
          }
        })
      );
      
      // Store results incrementally
      const videos = results.flat();
      if (videos.length > 0) {
        storeVideos(videos);
        added += videos.length;
      }
      
      processed += concurrentBatches.reduce((sum, b) => sum + b.length, 0);
      if (onProgress) onProgress(Math.min(processed, total), total);
    }
    
    return { added, total, partial };
  } catch (error) {
    // If we got some videos before the error, return partial success
    if (added > 0) {
      return { added, total, partial: true, error: error.message };
    }
    throw new Error(`Failed to prime channel: ${error.message}`);
  }
}
