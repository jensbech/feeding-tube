import { execa } from 'execa';
import { storeVideos, getStoredVideos, getAllStoredVideos } from './config.js';

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
    
    // Parse XML manually (simple regex for our needs)
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match = entryRegex.exec(stdout);
    
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
      match = entryRegex.exec(stdout);
    }
    
    return entries;
  } catch {
    return [];
  }
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
 * Get videos from multiple channels using RSS feeds + stored history
 */
export async function getAllVideos(subscriptions, limitPerChannel = 15) {
  // Fetch all channels in parallel using RSS
  const promises = subscriptions.map((sub) => 
    fetchChannelRSS(sub.id, sub.name)
  );
  
  const results = await Promise.all(promises);
  const freshVideos = results.flat();
  
  // Store new videos
  storeVideos(freshVideos);
  
  // Get all stored videos
  const storedVideos = getAllStoredVideos();
  
  // Filter to only subscribed channels
  const subscribedIds = new Set(subscriptions.map((s) => s.id));
  const relevantStored = storedVideos.filter((v) => subscribedIds.has(v.channelId));
  
  // Merge: use stored data but prefer fresh data for duplicates
  const videoMap = new Map();
  for (const v of relevantStored) {
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
 * Prime historical videos for a channel using yt-dlp
 * Fetches all videos with full metadata (has dates)
 * @param {Object} channel - Channel object with id, name, url
 * @param {Function} onProgress - Callback for progress updates (count, total)
 * @returns {Promise<{added: number, total: number}>}
 */
export async function primeChannel(channel, onProgress) {
  let url = channel.url;
  if (!url.includes('/videos')) {
    url = url.replace(/\/$/, '') + '/videos';
  }
  
  try {
    // First get list of video IDs (fast)
    const { stdout: listOut } = await execa('yt-dlp', [
      '--flat-playlist',
      '--print', '%(id)s',
      '--no-warnings',
      url,
    ], { timeout: 60000 });
    
    const videoIds = listOut.trim().split('\n').filter(Boolean);
    const total = videoIds.length;
    let added = 0;
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
            // Return empty on error, continue with other batches
            return [];
          }
        })
      );
      
      // Store results
      const videos = results.flat();
      if (videos.length > 0) {
        storeVideos(videos);
        added += videos.length;
      }
      
      processed += concurrentBatches.reduce((sum, b) => sum + b.length, 0);
      if (onProgress) onProgress(Math.min(processed, total), total);
    }
    
    return { added, total };
  } catch (error) {
    throw new Error(`Failed to prime channel: ${error.message}`);
  }
}
