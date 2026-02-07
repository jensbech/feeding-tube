const OSLO_UTC_OFFSET_WINTER = 1 * 60 * 60 * 1000;
const OSLO_UTC_OFFSET_SUMMER = 2 * 60 * 60 * 1000;

export function getOsloOffset(date) {
  const year = date.getUTCFullYear();
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  marchLastSunday.setUTCHours(1, 0, 0, 0);

  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  octoberLastSunday.setUTCHours(1, 0, 0, 0);

  return date >= marchLastSunday && date < octoberLastSunday
    ? OSLO_UTC_OFFSET_SUMMER
    : OSLO_UTC_OFFSET_WINTER;
}

export function getRelativeDateFromDate(date, now = new Date()) {
  const osloOffset = getOsloOffset(now);
  const nowOslo = new Date(now.getTime() + osloOffset);
  const dateOslo = new Date(date.getTime() + osloOffset);

  const diffMs = nowOslo - dateOslo;
  if (diffMs < 0) return 'upcoming';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function parseDateYYYYMMDD(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  return new Date(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(4, 6), 10) - 1,
    parseInt(dateStr.slice(6, 8), 10)
  );
}

export function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function decodeXMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
