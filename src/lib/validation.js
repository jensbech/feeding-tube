const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;

const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//,
  /^https?:\/\/(www\.)?youtube\.com\/@[\w.-]+/,
];

export function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isValidVideoId(id) {
  if (!id || typeof id !== 'string') return false;
  return YOUTUBE_VIDEO_ID_REGEX.test(id);
}

export function isValidChannelId(id) {
  if (!id || typeof id !== 'string') return false;
  return YOUTUBE_CHANNEL_ID_REGEX.test(id);
}

export function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') return '';
  return query.trim().slice(0, 500);
}

export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
