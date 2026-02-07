import { execa } from 'execa';
import { getSettings, updateSettings, markAsWatched } from './config.js';

const SUPPORTED_PLAYERS = ['mpv', 'iina', 'vlc'];

const PLAYER_CONFIGS = {
  mpv: {
    args: ['--force-window=immediate', '--keep-open=no'],
  },
  iina: {
    args: ['--no-stdin'],
  },
  vlc: {
    args: ['--no-video-title-show'],
  },
};

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

export async function checkPlayer(player) {
  try {
    await execa('which', [player]);
    return true;
  } catch {
    return false;
  }
}

export async function getAvailablePlayers() {
  const results = await Promise.all(
    SUPPORTED_PLAYERS.map(async (player) => ({
      player,
      available: await checkPlayer(player),
    }))
  );
  return results.filter((r) => r.available).map((r) => r.player);
}

export async function autoDetectPlayer() {
  const available = await getAvailablePlayers();
  for (const player of SUPPORTED_PLAYERS) {
    if (available.includes(player)) {
      updateSettings({ player });
      return player;
    }
  }
  return null;
}

function launchPlayer(player, args) {
  const subprocess = execa(player, args, {
    stdio: 'ignore',
    detached: true,
    reject: false,
  });
  subprocess.unref();
  return subprocess;
}

export async function playVideo(videoUrl, videoId) {
  let settings = getSettings();
  let player = settings.player || 'mpv';

  const id = videoId || extractVideoId(videoUrl);
  if (id) {
    markAsWatched(id);
  }

  if (!(await checkPlayer(player))) {
    const detected = await autoDetectPlayer();
    if (!detected) {
      return {
        success: false,
        error: 'No video player found. Please install mpv, iina, or vlc.',
      };
    }
    player = detected;
  }

  try {
    const config = PLAYER_CONFIGS[player];
    if (config) {
      launchPlayer(player, [...config.args, videoUrl]);
      return { success: true, player };
    }

    launchPlayer('open', [videoUrl]);
    return { success: true, player: 'browser' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
