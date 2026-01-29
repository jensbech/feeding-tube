import { execa } from 'execa';
import { getSettings, updateSettings, markAsWatched } from './config.js';

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Check if a player is available
 */
export async function checkPlayer(player) {
  try {
    await execa('which', [player]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of available players
 */
export async function getAvailablePlayers() {
  const players = ['mpv', 'iina', 'vlc'];
  const available = [];
  
  for (const player of players) {
    if (await checkPlayer(player)) {
      available.push(player);
    }
  }
  
  return available;
}

/**
 * Auto-detect and set the best available player
 */
export async function autoDetectPlayer() {
  const available = await getAvailablePlayers();
  
  // Preference order: mpv > iina > vlc
  const preferred = ['mpv', 'iina', 'vlc'];
  for (const player of preferred) {
    if (available.includes(player)) {
      updateSettings({ player });
      return player;
    }
  }
  
  return null;
}

/**
 * Play a video using the configured player
 * Uses yt-dlp to pipe directly to mpv/iina for streaming
 * @param {string} videoUrl - YouTube video URL
 * @param {string} [videoId] - Optional video ID (extracted from URL if not provided)
 */
export async function playVideo(videoUrl, videoId) {
  let settings = getSettings();
  let player = settings.player || 'mpv';
  
  // Mark video as watched
  const id = videoId || extractVideoId(videoUrl);
  if (id) {
    markAsWatched(id);
  }
  
  // Check if player exists, if not try to auto-detect
  if (!(await checkPlayer(player))) {
    const detected = await autoDetectPlayer();
    if (!detected) {
      return { 
        success: false, 
        error: 'No video player found. Please install mpv, iina, or vlc.' 
      };
    }
    player = detected;
  }
  
  try {
    if (player === 'mpv') {
      // mpv with ytdl integration - streams without downloading
      const subprocess = execa('mpv', [
        '--force-window=immediate',
        '--keep-open=no',
        videoUrl,
      ], {
        stdio: 'ignore',
        detached: true,
        reject: false,
      });

      subprocess.unref();
      return { success: true, player: 'mpv' };
    }
    
    if (player === 'iina') {
      // IINA can also handle YouTube URLs directly via yt-dlp
      const subprocess = execa('iina', [
        '--no-stdin',
        videoUrl,
      ], {
        stdio: 'ignore',
        detached: true,
        reject: false,
      });
      
      subprocess.unref();
      return { success: true, player: 'iina' };
    }
    
    if (player === 'vlc') {
      // VLC can stream YouTube URLs directly
      const subprocess = execa('vlc', [
        '--no-video-title-show',
        videoUrl,
      ], {
        stdio: 'ignore',
        detached: true,
        reject: false,
      });
      
      subprocess.unref();
      return { success: true, player: 'vlc' };
    }
    
    // Fallback: use macOS 'open' command with the URL
    // This will open in browser or default handler
    const subprocess = execa('open', [videoUrl], {
      stdio: 'ignore',
      detached: true,
      reject: false,
    });
    subprocess.unref();
    return { success: true, player: 'browser' };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
