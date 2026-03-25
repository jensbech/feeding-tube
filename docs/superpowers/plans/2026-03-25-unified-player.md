# Unified Player (HLS + Plyr) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split iOS/desktop streaming paths with a single HLS pipeline and a consistent Plyr-based player UI.

**Architecture:** yt-dlp extracts format info via `--dump-json`; FFmpeg outputs HLS segments to `/tmp/ft-hls/{id}/`; two new Axum endpoints serve the playlist and segments behind session auth. The frontend uses hls.js on desktop and native HLS on iOS, both wrapped in a Plyr player for consistent controls.

**Tech Stack:** Rust/Axum/Tokio backend, vanilla JS frontend (no build step), FFmpeg HLS output, hls.js + Plyr loaded from jsDelivr CDN.

---

## File Map

| File | Change |
|---|---|
| `Cargo.toml` | Add `fs`, `signal` to tokio features |
| `src/ytdlp.rs` | Add `hls_format_string()`, `is_valid_segment_name()`, `HlsInfo`, `get_hls_info()`; remove `get_stream_urls()` |
| `src/web.rs` | Add `AppState` (with `FromRef`), `HlsSession`, `HlsState`; add playlist + segment handlers; add graceful shutdown; remove `stream_video`, `direct_url` |
| `static/index.html` | Add Plyr + hls.js CDN links; replace `openPlayer()`; replace `startBgAudio()`; update `closePlayer()`, `visibilitychange`, and `bgPlayBtn` handlers; remove `isMobile` streaming branch |

**Task order note:** Tasks 8–10 (frontend) must complete before Task 11 (remove old backend endpoints), because `startBgAudio` calls `/api/videos/{id}/direct-url` until Task 10 replaces it.

---

## Task 1: Update Cargo.toml — add `fs` and `signal` tokio features

**Files:**
- Modify: `Cargo.toml:16`

- [ ] **Step 1: Edit Cargo.toml**

Change line 16 from:
```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "process", "time", "sync"] }
```
to:
```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "process", "time", "sync", "fs", "signal"] }
```

- [ ] **Step 2: Verify it compiles**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add Cargo.toml
git commit -m "chore: add tokio fs and signal features"
```

---

## Task 2: Add HLS helpers to `src/ytdlp.rs`

Two pure functions (fully unit-testable) plus an async function that calls yt-dlp.

**Files:**
- Modify: `src/ytdlp.rs`

- [ ] **Step 1: Write failing tests**

Add to the `#[cfg(test)] mod tests` block at the bottom of `src/ytdlp.rs`:

```rust
// ── HLS helper tests ─────────────────────────────────────

#[test]
fn test_hls_format_string_1080() {
    let f = hls_format_string("1080");
    assert!(f.contains("height<=1080"), "should cap at 1080p");
    assert!(f.contains("avc1"), "should prefer H.264");
    assert!(f.contains("mp4a"), "should prefer AAC");
}

#[test]
fn test_hls_format_string_max() {
    let f = hls_format_string("max");
    assert!(!f.contains("height<="), "should not cap resolution when max");
    assert!(f.contains("avc1"), "should still prefer H.264");
}

#[test]
fn test_is_valid_segment_name_valid() {
    assert!(is_valid_segment_name("seg0000.ts"));
    assert!(is_valid_segment_name("segment_00-01.ts"));
    assert!(is_valid_segment_name("a.ts"));
}

#[test]
fn test_is_valid_segment_name_rejects_traversal() {
    assert!(!is_valid_segment_name("../etc/passwd"));
    assert!(!is_valid_segment_name("../../foo.ts"));
}

#[test]
fn test_is_valid_segment_name_rejects_wrong_extension() {
    assert!(!is_valid_segment_name("foo.mp4"));
    assert!(!is_valid_segment_name("foo.m3u8"));
    assert!(!is_valid_segment_name("foo"));
}

#[test]
fn test_is_valid_segment_name_rejects_spaces_and_empty() {
    assert!(!is_valid_segment_name("foo bar.ts"));
    assert!(!is_valid_segment_name(""));
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cargo test hls_format_string is_valid_segment_name
```
Expected: compiler errors — functions not yet defined

- [ ] **Step 3: Add the HLS helpers**

Insert the following block after the `get_stream_urls` function (after line ~451, before `// ── Priming`):

```rust
// ── HLS Helpers ────────────────────────────────────────────

pub fn hls_format_string(max_resolution: &str) -> String {
    if max_resolution == "1080" {
        "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best".to_string()
    } else {
        "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best".to_string()
    }
}

pub fn is_valid_segment_name(name: &str) -> bool {
    Regex::new(r"^[a-zA-Z0-9_\-]+\.ts$").unwrap().is_match(name)
}

#[derive(Debug)]
pub struct HlsInfo {
    pub video_url: String,
    pub audio_url: Option<String>,
    pub needs_transcode: bool,
}

pub async fn get_hls_info(video_id: &str, max_resolution: &str) -> Result<HlsInfo, String> {
    if !is_valid_video_id(video_id) {
        return Err("Invalid video ID".to_string());
    }
    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    let format = hls_format_string(max_resolution);

    let result = timeout(
        Duration::from_secs(30),
        Command::new("yt-dlp")
            .args(["--dump-json", "-f", &format, "--no-warnings", &url])
            .output(),
    )
    .await
    .map_err(|_| "yt-dlp timed out".to_string())?
    .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("yt-dlp error: {}", stderr.trim()));
    }

    let data: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&result.stdout))
            .map_err(|e| format!("Failed to parse yt-dlp output: {e}"))?;

    // YouTube usually returns requested_formats (separate video+audio).
    // Fall back to a single muxed URL when not present.
    if let Some(formats) = data["requested_formats"].as_array() {
        let video = formats.iter().find(|f| {
            f["vcodec"].as_str().map(|v| v != "none").unwrap_or(false)
        });
        let audio = formats.iter().find(|f| {
            f["acodec"].as_str().map(|a| a != "none").unwrap_or(false)
                && f["vcodec"].as_str().map(|v| v == "none").unwrap_or(true)
        });

        let video_url = video
            .and_then(|f| f["url"].as_str())
            .ok_or("No video URL in yt-dlp output")?
            .to_string();
        let audio_url = audio.and_then(|f| f["url"].as_str()).map(|s| s.to_string());

        let v_codec = video.and_then(|f| f["vcodec"].as_str()).unwrap_or("");
        let a_codec = audio.and_then(|f| f["acodec"].as_str()).unwrap_or("");
        let needs_transcode = !v_codec.starts_with("avc1") || !a_codec.starts_with("mp4a");

        Ok(HlsInfo { video_url, audio_url, needs_transcode })
    } else {
        let video_url = data["url"]
            .as_str()
            .ok_or("No URL in yt-dlp output")?
            .to_string();
        let v_codec = data["vcodec"].as_str().unwrap_or("");
        let a_codec = data["acodec"].as_str().unwrap_or("");
        let needs_transcode = !v_codec.starts_with("avc1") || !a_codec.starts_with("mp4a");

        Ok(HlsInfo { video_url, audio_url: None, needs_transcode })
    }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cargo test hls_format_string is_valid_segment_name
```
Expected: all pass

- [ ] **Step 5: Full compile check**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/ytdlp.rs
git commit -m "feat: add HLS helper functions to ytdlp module"
```

---

## Task 3: Add `AppState`, `HlsSession`, and graceful shutdown to `src/web.rs`

The existing handlers all extract `State(db): State<Db>`. With Axum's `FromRef`, we wrap `db` and `hls` in an `AppState` struct — Axum automatically extracts the right field per handler. **No existing handler signatures need to change.**

**Files:**
- Modify: `src/web.rs`

- [ ] **Step 1: Update imports**

Replace line 5:
```rust
use axum::extract::{Path, Query, State};
```
with:
```rust
use axum::extract::{FromRef, Path, Query, State};
```

- [ ] **Step 2: Add state types after line 17 (`type Db = ...`)**

```rust
type HlsState = Arc<Mutex<Option<HlsSession>>>;

struct HlsSession {
    video_id: String,
    process: tokio::process::Child,
    dir: std::path::PathBuf,
}

#[derive(Clone, FromRef)]
struct AppState {
    db: Db,
    hls: HlsState,
}
```

- [ ] **Step 3: Update `start()` to build `AppState` and add graceful shutdown**

In `start()`, after the `let db: Db = Arc::new(...)` line (line 65), add:
```rust
    let hls: HlsState = Arc::new(Mutex::new(None));
    let hls_cleanup = hls.clone();
```

Replace `.with_state(db)` with:
```rust
        .with_state(AppState { db, hls })
```

Replace the final three lines of `start()`:
```rust
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
```
with:
```rust
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;

    if let Ok(mut guard) = hls_cleanup.lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.process.kill().await;
            let _ = tokio::fs::remove_dir_all(&session.dir).await;
        }
    }
    let _ = tokio::fs::remove_dir_all("/tmp/ft-hls").await;

    Ok(())
```

- [ ] **Step 4: Compile check**

```bash
cargo check --features web
```
Expected: no errors. All existing handlers still compile unchanged because `FromRef<AppState> for Db` is auto-generated.

- [ ] **Step 5: Commit**

```bash
git add src/web.rs
git commit -m "feat: add AppState, HlsSession, and graceful shutdown"
```

---

## Task 4: Add HLS routes to the router

**Files:**
- Modify: `src/web.rs`

- [ ] **Step 1: Add routes**

In the `Router::new()` chain in `start()`, after `.route("/api/stream/{id}", get(stream_video))`, add:

```rust
        .route("/api/hls/{id}/playlist.m3u8", get(hls_playlist))
        .route("/api/hls/{id}/{segment}", get(hls_segment))
```

- [ ] **Step 2: Add stub handlers**

Add at the end of `src/web.rs`:

```rust
async fn hls_playlist(
    State(_db): State<Db>,
    State(_hls): State<HlsState>,
    _headers: HeaderMap,
    Path(_id): Path<String>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    Err(err_json(StatusCode::NOT_IMPLEMENTED, "not yet implemented"))
}

async fn hls_segment(
    State(_db): State<Db>,
    _headers: HeaderMap,
    Path((_id, _segment)): Path<(String, String)>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    Err(err_json(StatusCode::NOT_IMPLEMENTED, "not yet implemented"))
}
```

- [ ] **Step 3: Compile check**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/web.rs
git commit -m "feat: register HLS routes with stub handlers"
```

---

## Task 5: Implement `hls_playlist` handler

**Files:**
- Modify: `src/web.rs`

**Important:** Never hold a `std::sync::Mutex` guard across an `.await` point. The pattern below takes the session `out` of the mutex, drops the guard, then awaits async operations.

Replace the `hls_playlist` stub with:

- [ ] **Step 1: Replace the stub**

```rust
async fn hls_playlist(
    State(db): State<Db>,
    State(hls): State<HlsState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    if !ytdlp::is_valid_video_id(&id) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid video ID"));
    }

    let max_resolution = {
        let db_guard = lock_db(&db)?;
        db_guard.get_settings(user.id).max_resolution
    };

    // Determine if we need a new session (different video or no current session).
    // Take ownership of the old session outside the lock to avoid holding the
    // Mutex guard across .await calls.
    let old_session: Option<HlsSession> = {
        let guard = hls
            .lock()
            .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
        let is_same = guard.as_ref().map(|s| s.video_id == id).unwrap_or(false);
        if is_same {
            None // reuse existing session
        } else {
            drop(guard);
            let mut guard = hls
                .lock()
                .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
            guard.take() // take old session, leaving None
        }
    };

    // Kill old session (outside the lock — no guard held across .await)
    if let Some(mut old) = old_session {
        let _ = old.process.kill().await;
        let _ = tokio::fs::remove_dir_all(&old.dir).await;
    }

    // Start new FFmpeg session only if no current session for this video
    let needs_new = {
        let guard = hls
            .lock()
            .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
        guard.is_none()
    };

    if needs_new {
        let info = ytdlp::get_hls_info(&id, &max_resolution)
            .await
            .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;

        let dir = std::path::PathBuf::from(format!("/tmp/ft-hls/{}", id));
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create HLS dir: {e}")))?;

        let playlist_path = dir.join("playlist.m3u8");
        let segment_pattern = dir.join("seg%04d.ts");

        let mut ffmpeg_args: Vec<String> =
            vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
        ffmpeg_args.extend(["-i".into(), info.video_url]);
        if let Some(audio_url) = info.audio_url {
            ffmpeg_args.extend(["-i".into(), audio_url]);
        }
        if info.needs_transcode {
            ffmpeg_args.extend([
                "-c:v".into(), "libx264".into(),
                "-preset".into(), "fast".into(),
                "-c:a".into(), "aac".into(),
            ]);
        } else {
            ffmpeg_args.extend(["-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
        }
        ffmpeg_args.extend([
            "-f".into(), "hls".into(),
            "-hls_time".into(), "4".into(),
            "-hls_list_size".into(), "0".into(),
            "-hls_segment_filename".into(), segment_pattern.to_str().unwrap().to_string(),
            playlist_path.to_str().unwrap().to_string(),
        ]);

        let child = tokio::process::Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start ffmpeg: {e}"))
            })?;

        // Store session (guard acquired and released immediately, no .await)
        {
            let mut guard = hls
                .lock()
                .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
            *guard = Some(HlsSession { video_id: id.clone(), process: child, dir });
        }
    }

    // Wait up to 30 seconds for the first segment. Also check for early FFmpeg exit.
    let first_seg = std::path::PathBuf::from(format!("/tmp/ft-hls/{}/seg0000.ts", id));
    let playlist_path = std::path::PathBuf::from(format!("/tmp/ft-hls/{}/playlist.m3u8", id));
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);

    loop {
        if tokio::fs::metadata(&first_seg).await.is_ok() {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Timed out waiting for HLS stream to start",
            ));
        }
        // Check if FFmpeg exited early (no .await held while guard is alive)
        let exited = {
            let mut guard = hls
                .lock()
                .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
            if let Some(ref mut session) = *guard {
                if session.video_id == id {
                    session.process.try_wait().ok().flatten().map(|s| !s.success()).unwrap_or(false)
                } else {
                    false
                }
            } else {
                false
            }
        };
        if exited {
            return Err(err_json(StatusCode::INTERNAL_SERVER_ERROR, "FFmpeg exited unexpectedly"));
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let content = tokio::fs::read_to_string(&playlist_path)
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read playlist: {e}")))?;

    Response::builder()
        .header("Content-Type", "application/vnd.apple.mpegurl")
        .header("Cache-Control", "no-cache")
        .body(Body::from(content))
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/web.rs
git commit -m "feat: implement HLS playlist endpoint"
```

---

## Task 6: Implement `hls_segment` handler

**Files:**
- Modify: `src/web.rs`

Replace the `hls_segment` stub with:

- [ ] **Step 1: Replace the stub**

```rust
async fn hls_segment(
    State(db): State<Db>,
    headers: HeaderMap,
    Path((id, segment)): Path<(String, String)>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    require_user(&db, &headers)?;
    if !ytdlp::is_valid_video_id(&id) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid video ID"));
    }
    if !ytdlp::is_valid_segment_name(&segment) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid segment name"));
    }

    let base = std::path::PathBuf::from(format!("/tmp/ft-hls/{}", id));
    let path = base.join(&segment);
    // Belt-and-suspenders: verify the resolved path stays inside the expected dir
    if !path.starts_with(&base) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid segment path"));
    }

    // Poll up to 5 seconds for the segment to be written by FFmpeg
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if tokio::fs::metadata(&path).await.is_ok() {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse { error: "Segment not found".into() }),
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to open segment: {e}")))?;
    let stream = ReaderStream::new(file);

    Response::builder()
        .header("Content-Type", "video/mp2t")
        .header("Cache-Control", "no-cache")
        .body(Body::from_stream(stream))
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/web.rs
git commit -m "feat: implement HLS segment endpoint with path traversal protection"
```

---

## Task 7: Add Plyr + hls.js to `static/index.html`

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Add CDN links to `<head>`**

Locate `</head>` and insert before it:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css">
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.min.js"></script>
```

- [ ] **Step 2: Add Plyr CSS overrides**

In the `<style>` block, after the `.player-error a { ... }` rule (around line 505), add:

```css
.plyr {
  width: 100%;
}
.plyr--video {
  border-radius: 6px;
  overflow: hidden;
}
@media (max-width: 768px) {
  .plyr--video {
    max-height: 50vh;
  }
}
```

- [ ] **Step 3: Build**

```bash
cargo build --features web
```
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add static/index.html
git commit -m "feat: add Plyr and hls.js CDN dependencies"
```

---

## Task 8: Replace `openPlayer` and `closePlayer` with HLS + Plyr

**Files:**
- Modify: `static/index.html`

**Note on quality menu:** Plyr requires quality options to be set at construction time to render the menu. Since hls.js only knows the available levels after `MANIFEST_PARSED`, we create the Plyr instance inside the `MANIFEST_PARSED` handler, after the levels are available.

- [ ] **Step 1: Add player instance variables near line 1387 (`let bgAudio = null;`)**

```js
let currentPlyr = null;
let currentHls = null;
```

- [ ] **Step 2: Replace the entire `openPlayer` function (lines ~1315–1385)**

```js
async function openPlayer(videoId) {
  const video = state.videos.find(v => v.id === videoId);
  if (!video) return;

  currentPlayingId = videoId;
  document.getElementById('modalTitle').textContent = video.title;
  document.title = `${video.title} - FeedingTube`;

  const metaParts = [];
  if (video.channel_name) metaParts.push(`<span>${esc(video.channel_name)}</span>`);
  if (video.relative_date) metaParts.push(`<span>${esc(video.relative_date)}</span>`);
  if (video.duration_string) metaParts.push(`<span>${esc(video.duration_string)}</span>`);
  metaParts.push(`<a href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener">Open on YouTube &#8599;</a>`);
  document.getElementById('playerMeta').innerHTML = metaParts.join(' &middot; ');

  const container = document.getElementById('playerContainer');

  if (currentPlyr) { currentPlyr.destroy(); currentPlyr = null; }
  if (currentHls) { currentHls.destroy(); currentHls = null; }

  container.innerHTML = '<div class="player-loading"><div class="spinner"></div> Loading stream...</div>';
  document.getElementById('playerModal').classList.add('open');

  if (!state.watchedIds.has(videoId)) {
    api(`/api/videos/${encodeURIComponent(videoId)}/watched`, { method: 'POST' }).then(data => {
      if (data) {
        state.watchedIds.add(videoId);
        const row = document.querySelector(`tr[data-vid="${videoId}"]`);
        if (row) row.classList.add('watched');
      }
    });
  }

  const playlistUrl = `/api/hls/${encodeURIComponent(videoId)}/playlist.m3u8`;
  const vid = document.createElement('video');

  if (Hls.isSupported()) {
    const hls = new Hls({ xhrSetup: xhr => { xhr.withCredentials = true; } });
    currentHls = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if (currentPlayingId !== videoId) return;

      container.innerHTML = '';
      container.appendChild(vid);

      const heights = data.levels.map(l => l.height);

      currentPlyr = new Plyr(vid, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
        settings: ['quality', 'speed'],
        quality: {
          default: 0,
          options: [0, ...heights],
          forced: true,
          onChange: (newHeight) => {
            if (!currentHls) return;
            if (newHeight === 0) {
              currentHls.currentLevel = -1;
            } else {
              const idx = data.levels.findIndex(l => l.height === newHeight);
              if (idx !== -1) currentHls.currentLevel = idx;
            }
          },
        },
        i18n: { qualityLabel: { 0: 'Auto' } },
      });

      if (state.bgPlay) {
        vid.addEventListener('playing', () => startBgAudio(videoId), { once: true });
      }
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal && currentPlayingId === videoId) {
        container.innerHTML = `<div class="player-error"><span>Stream playback failed</span><a href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener">Open on YouTube</a></div>`;
      }
    });

    hls.loadSource(playlistUrl);
    hls.attachMedia(vid);
  } else {
    // iOS Safari: native HLS support
    container.innerHTML = '';
    container.appendChild(vid);
    vid.src = playlistUrl;

    currentPlyr = new Plyr(vid, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'],
    });

    vid.onerror = () => {
      if (currentPlayingId === videoId) {
        container.innerHTML = `<div class="player-error"><span>Stream playback failed</span><a href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener">Open on YouTube</a></div>`;
      }
    };

    if (state.bgPlay) {
      vid.addEventListener('playing', () => startBgAudio(videoId), { once: true });
    }
  }
}
```

- [ ] **Step 3: Replace the entire `closePlayer` function**

```js
function closePlayer() {
  currentPlayingId = null;
  document.title = 'FeedingTube';

  if (currentPlyr) { currentPlyr.destroy(); currentPlyr = null; }
  if (currentHls) { currentHls.destroy(); currentHls = null; }

  if (bgAudio) {
    bgAudio.pause();
    bgAudio.src = '';
    if (bgAudio._hls) { bgAudio._hls.destroy(); bgAudio._hls = null; }
    bgAudio = null;
  }

  document.getElementById('playerContainer').innerHTML = '';
  document.getElementById('playerModal').classList.remove('open');
  document.body.style.overflow = '';
}
```

- [ ] **Step 4: Build check**

```bash
cargo build --features web
```
Expected: clean build

- [ ] **Step 5: Commit**

```bash
git add static/index.html
git commit -m "feat: replace native video element with Plyr + hls.js player"
```

---

## Task 9: Update `startBgAudio` to use HLS

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Replace the entire `startBgAudio` function (lines ~1439–1465)**

```js
async function startBgAudio(videoId) {
  if (bgAudio) {
    bgAudio.pause();
    bgAudio.src = '';
    if (bgAudio._hls) { bgAudio._hls.destroy(); bgAudio._hls = null; }
    bgAudio = null;
  }

  const playlistUrl = `/api/hls/${encodeURIComponent(videoId)}/playlist.m3u8`;
  bgAudio = new Audio();

  if (Hls.isSupported()) {
    const bgHls = new Hls({ xhrSetup: xhr => { xhr.withCredentials = true; } });
    bgHls.loadSource(playlistUrl);
    bgHls.attachMedia(bgAudio);
    bgAudio._hls = bgHls;
  } else {
    bgAudio.src = playlistUrl;
  }

  const vid = document.getElementById('playerContainer').querySelector('video');
  if (vid) {
    bgAudio.currentTime = vid.currentTime;
    vid.addEventListener('seeked', () => { if (bgAudio) bgAudio.currentTime = vid.currentTime; });
  }

  bgAudio.play().catch(() => {});

  if ('mediaSession' in navigator) {
    const video = state.videos.find(v => v.id === videoId);
    if (video) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: video.title,
        artist: video.channel_name || 'FeedingTube',
      });
    }
  }
}
```

- [ ] **Step 2: Build check**

```bash
cargo build --features web
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: update background audio to use HLS stream"
```

---

## Task 10: Fix `visibilitychange` and `bgPlayBtn` handlers to destroy hls.js on cleanup

These handlers clean up `bgAudio` directly. After Task 9, `bgAudio` may have a `._hls` instance attached — it must be destroyed to avoid leaking the hls.js connection.

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Update the `visibilitychange` handler (lines ~1467–1483)**

Find the `else` branch of the `visibilitychange` listener where `bgAudio` is cleaned up:
```js
  } else {
    if (bgAudio) {
      const vid = document.getElementById('playerContainer').querySelector('video');
      if (vid) vid.currentTime = bgAudio.currentTime;
      bgAudio.pause();
      bgAudio.src = '';
      bgAudio = null;
    }
  }
```

Replace with:
```js
  } else {
    if (bgAudio) {
      const vid = document.getElementById('playerContainer').querySelector('video');
      if (vid) vid.currentTime = bgAudio.currentTime;
      bgAudio.pause();
      bgAudio.src = '';
      if (bgAudio._hls) { bgAudio._hls.destroy(); bgAudio._hls = null; }
      bgAudio = null;
    }
  }
```

- [ ] **Step 2: Update the `bgPlayBtn` click handler (lines ~1413–1424)**

Find the cleanup branch of the `bgPlayBtn` click listener:
```js
  } else if (!state.bgPlay && bgAudio) {
    bgAudio.pause();
    bgAudio.src = '';
    bgAudio = null;
  }
```

Replace with:
```js
  } else if (!state.bgPlay && bgAudio) {
    bgAudio.pause();
    bgAudio.src = '';
    if (bgAudio._hls) { bgAudio._hls.destroy(); bgAudio._hls = null; }
    bgAudio = null;
  }
```

- [ ] **Step 3: Build check**

```bash
cargo build --features web
```
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add static/index.html
git commit -m "fix: destroy hls.js instance on background audio cleanup"
```

---

## Task 11: Remove old streaming endpoints

**This task must come after Tasks 8–10 are complete**, because the old `/api/videos/{id}/direct-url` endpoint is still called by `startBgAudio` until Task 9 replaces it.

**Files:**
- Modify: `src/web.rs`
- Modify: `src/ytdlp.rs`

- [ ] **Step 1: Remove routes from the router in `start()`**

Delete these two lines:
```rust
        .route("/api/stream/{id}", get(stream_video))
        .route("/api/videos/{id}/direct-url", get(direct_url))
```

- [ ] **Step 2: Delete `stream_video` handler**

Delete the entire `stream_video` function (lines ~432–493 in `src/web.rs`).

- [ ] **Step 3: Delete `direct_url` handler and its response type**

Delete `DirectUrlResponse` struct and the entire `direct_url` function (lines ~495–542).

- [ ] **Step 4: Delete `get_stream_urls` from `src/ytdlp.rs`**

Delete the `get_stream_urls` function (lines ~423–451 in `src/ytdlp.rs`). It is no longer called anywhere.

- [ ] **Step 5: Compile check**

```bash
cargo check --features web
```
Expected: no errors

- [ ] **Step 6: Run all tests**

```bash
cargo test
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/web.rs src/ytdlp.rs
git commit -m "feat: remove legacy MP4 streaming and direct-url endpoints"
```

---

## Task 12: Final verification

**Files:** none

- [ ] **Step 1: Confirm no references to removed endpoints remain in the frontend**

```bash
grep -n "direct-url\|/api/stream" static/index.html
```
Expected: no output

- [ ] **Step 2: Final build and test**

```bash
cargo build --features web
cargo test
```
Expected: clean build, all tests pass

- [ ] **Step 3: Manual smoke test**

Start the server: `cargo run --features web -- --web`

1. Open `http://localhost:8080` in Firefox — play a video, confirm Plyr controls appear and stream starts
2. Open on iPhone/iOS Safari — play a video, confirm Plyr controls appear and stream starts
3. Firefox: confirm the quality menu lists available resolutions and switching works
4. Mobile: enable BG play, lock the screen — confirm audio continues
5. Open two videos in sequence — confirm the first stops cleanly before the second starts
