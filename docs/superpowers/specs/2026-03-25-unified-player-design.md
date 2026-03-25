# Unified Player Design

**Date:** 2026-03-25
**Status:** Approved
**Goal:** Eliminate inconsistencies between the iOS Safari and Firefox web player — both in streaming quality and visual appearance.

---

## Problem

The current implementation splits playback into two paths based on user-agent:

- **Desktop (Firefox):** FFmpeg transcodes and pipes a fragmented MP4 via `/api/stream/{id}`
- **Mobile/iOS:** yt-dlp direct URL set as `<video src>`, bypasses FFmpeg entirely

This causes different codecs, inconsistent quality selection, different buffering behavior, and native browser controls that look completely different on each platform.

---

## Solution

Replace both paths with a single HLS streaming pipeline (backend) and a unified custom player UI using Plyr + hls.js (frontend).

---

## Backend

### New Endpoints

Both new endpoints require session authentication (`require_user()`), consistent with all other API routes.

**`GET /api/hls/{id}/playlist.m3u8`**

- Requires authenticated session
- Extracts stream URLs via yt-dlp using the per-user resolution setting
- Format string: `bestvideo[vcodec^=avc1][height<={res}]+bestaudio[acodec^=mp4a]/bestvideo[height<={res}]+bestaudio/best`
  - The `vcodec^=avc1` / `acodec^=mp4a` selectors prefer H.264+AAC, enabling FFmpeg stream-copy (no transcoding, minimal CPU)
  - If no H.264/AAC combination exists at the target resolution, the fallback `bestvideo[height<={res}]+bestaudio/best` may yield VP9/Opus; FFmpeg will then transcode to H.264/AAC. This increases CPU and delays first segment, but is correct and acceptable behavior
- FFmpeg args: `-c:v copy -c:a copy -f hls -hls_time 4 -hls_list_size 0`
  - `hls_list_size 0` retains all segments in the playlist (no deletion), preventing stale-segment failures for paused clients. No `hls_flags` are needed for this VOD-style pipeline.
  - Transcoding fallback: replace `-c:v copy -c:a copy` with `-c:v libx264 -c:a aac` when stream-copy is not possible (detected by checking yt-dlp format codecs before spawning FFmpeg)
- HLS output directory: `/tmp/ft-hls/{video_id}/`
- Waits up to 30 seconds for the first `.ts` segment to appear before returning the playlist; returns HTTP 500 if the timeout is reached
- Returns `Content-Type: application/vnd.apple.mpegurl`

**`GET /api/hls/{id}/{segment}`**

- Route registered as `/api/hls/{id}/{segment}` in Axum; the `{segment}` extractor captures the full path component including the `.ts` extension (e.g., `segment0000.ts`). The handler uses the captured value as-is when constructing the file path.
- Requires authenticated session
- Validates `{segment}` against `^[a-zA-Z0-9_\-]+\.ts$` before constructing the path; returns 400 if invalid
- Constructs file path as `std::path::Path::new("/tmp/ft-hls/{video_id}/").join(segment)` and verifies the resolved path starts with `/tmp/ft-hls/{video_id}/` before serving, preventing path traversal
- Serves individual `.ts` segment files from `/tmp/ft-hls/{video_id}/`
- Returns `Content-Type: video/mp2t`
- If the segment file does not yet exist, polls for up to 5 seconds before returning 404
- Returns 404 (not 500) if the segment never appears, so hls.js/the browser can handle it gracefully

### Removed Endpoints

- `GET /api/stream/{id}` — fragmented MP4 pipe, removed
- `GET /api/videos/{id}/direct-url` — removed; background audio now uses the HLS playlist (see Frontend)

### HLS Session Lifecycle

- One active HLS session globally (personal app, single user)
- When a new video is requested, the previous FFmpeg process is killed and its temp dir deleted before starting the new one
- Segments are never deleted mid-session (`delete_segments` flag is not used); disk accumulates within a session and is cleaned between sessions — acceptable for a personal app
- On server shutdown, a graceful shutdown handler (`tokio::signal` + `axum::serve::with_graceful_shutdown`) removes all `/tmp/ft-hls/` directories before exit
- If FFmpeg exits with a non-zero code, the playlist endpoint returns HTTP 500 with the error output

---

## Frontend

### Libraries

Loaded via CDN `<script>` and `<link>` tags in `index.html` — no build step:

- **Plyr** — custom player UI (consistent controls across all platforms)
- **hls.js** — HLS playback via MSE on desktop/Android

### Player Initialization

When a video is opened:

1. Create a `<video>` element
2. If `Hls.isSupported()` (desktop, Android Chrome):
   - Create an `hls.js` instance with `xhrSetup: (xhr) => xhr.withCredentials = true` so session cookies are sent with segment requests
   - Load `/api/hls/{id}/playlist.m3u8`
   - Attach to the `<video>` element
3. Else (iOS Safari):
   - Set `src` directly to `/api/hls/{id}/playlist.m3u8` — iOS handles HLS natively; the browser sends cookies automatically
4. Wrap the `<video>` element with Plyr

Plyr wraps both paths with identical controls and appearance. Plyr handles `playsinline` and `webkit-playsinline` internally.

### Quality Selection

- **Desktop:** Wire hls.js level switching to Plyr's quality menu using the documented [Plyr + hls.js integration pattern](https://github.com/sampotts/plyr#hlsjs): expose `hls.levels` as Plyr quality options, override the `quality` setter to call `hls.currentLevel`. This is non-trivial glue code (~30 lines); refer to the Plyr docs and examples.
- **iOS:** Native HLS quality selection (automatic). Since both platforms use the same HLS stream generated by the same yt-dlp format string, quality is consistent at the segment level.

### Background Audio

The background audio feature is updated to use the HLS stream instead of the removed `direct-url` endpoint:

- On desktop: attach a second `hls.js` instance to the `<audio>` element with the same playlist URL (`/api/hls/{id}/playlist.m3u8`). This reads from the same already-running FFmpeg session's temp directory — no new FFmpeg process is spawned.
- On iOS: set `src` directly on the `<audio>` element — iOS `<audio>` supports HLS natively, and the cookie is sent automatically.

`MediaMetadata` lock screen integration and the visibility-change sync logic remain unchanged.

### Removed

- `isMobile` UA detection for streaming path selection
- Direct-URL fetch and application logic
- Manual `playsinline` / `webkit-playsinline` attribute setting (Plyr handles this)

---

## Error Handling

| Scenario | Behavior |
|---|---|
| yt-dlp fails to extract URL | `/api/hls/{id}/playlist.m3u8` returns HTTP 500 |
| FFmpeg exits early or errors | HTTP 500; temp dir cleaned up |
| First segment not ready within 30s | HTTP 500 timeout |
| Segment not yet written (normal lag) | Endpoint polls up to 5s, then returns 404 |
| New video opened while one is active | Previous FFmpeg killed, temp dir deleted, new session starts |
| Server shutdown | Graceful shutdown handler removes all `/tmp/ft-hls/` dirs |

---

## Implementation Notes

- **Graceful shutdown:** Requires replacing the bare `axum::serve(listener, app).await?` call with `axum::serve(...).with_graceful_shutdown(shutdown_signal())` where `shutdown_signal()` awaits `tokio::signal::ctrl_c()` and optionally `SIGTERM`.
- **Codec detection:** Before spawning FFmpeg, run `yt-dlp --dump-json -f <format_string> <url>` and inspect the codec fields to decide whether to use `-c copy` or transcode args. When yt-dlp selects a merged (video+audio) format, codec info is in the `requested_formats` array, not the top-level `vcodec`/`acodec` fields — check both. The JSON also contains `url` fields for each format entry, so this single call can replace the existing `-g` URL extraction call entirely.
- **Resolution `max` handling:** The per-user resolution setting is either `"1080"` or `"max"`. Do not substitute `"max"` literally into the `height<=` filter — it is not valid yt-dlp syntax. Use the capped format string when resolution is `"1080"`, and the uncapped `bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best` when it is `"max"` (matching the existing branch logic in `stream_video`).
- **hls.js credentials:** Must set `xhr.withCredentials = true` via `xhrSetup` on the hls.js config; otherwise the session cookie is not sent with segment requests and all segment fetches return 401.
