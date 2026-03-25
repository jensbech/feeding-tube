use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::{FromRef, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio_util::io::ReaderStream;
use tower_http::cors::CorsLayer;

use crate::db::{Database, Subscription, User, Video};
use crate::ytdlp;

type Db = Arc<Mutex<Database>>;

type HlsState = Arc<Mutex<Option<HlsSession>>>;

struct HlsSession {
    video_id: String,
    process: tokio::process::Child,
    dir: std::path::PathBuf,
}

#[derive(Clone)]
struct AppState {
    db: Db,
    hls: HlsState,
}

impl FromRef<AppState> for Db {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}

impl FromRef<AppState> for HlsState {
    fn from_ref(state: &AppState) -> Self {
        state.hls.clone()
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn err_json(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (status, Json(ErrorResponse { error: msg.into() }))
}

fn lock_db(db: &Db) -> Result<std::sync::MutexGuard<'_, Database>, (StatusCode, Json<ErrorResponse>)> {
    db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))
}

fn get_session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|c| {
                let c = c.trim();
                c.strip_prefix("ft_session=").map(|v| v.to_string())
            })
        })
}

fn require_user(db: &Db, headers: &HeaderMap) -> Result<User, (StatusCode, Json<ErrorResponse>)> {
    let token = get_session_token(headers)
        .ok_or_else(|| err_json(StatusCode::UNAUTHORIZED, "Not logged in"))?;
    let db = lock_db(db)?;
    db.get_session_user(&token)
        .ok_or_else(|| err_json(StatusCode::UNAUTHORIZED, "Invalid session"))
}

fn require_admin(db: &Db, headers: &HeaderMap) -> Result<User, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(db, headers)?;
    if user.role != "admin" {
        return Err(err_json(StatusCode::FORBIDDEN, "Admin access required"));
    }
    Ok(user)
}

static INDEX_HTML: &str = include_str!("../static/index.html");
const HLS_BASE_DIR: &str = "/tmp/ft-hls";

pub async fn start(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open().map_err(|e| format!("Failed to open database: {e}"))?;
    db.cleanup_expired_sessions();
    let db: Db = Arc::new(Mutex::new(db));
    let hls: HlsState = Arc::new(Mutex::new(None));
    let hls_cleanup = hls.clone();

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/api/auth/users", get(list_users_for_login))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(get_current_user))
        .route("/api/admin/users", get(admin_list_users))
        .route("/api/admin/users", post(admin_add_user))
        .route("/api/admin/users/{id}", delete(admin_remove_user))
        .route("/api/channels", get(list_channels))
        .route("/api/channels", post(add_channel))
        .route("/api/channels/{id}", delete(remove_channel))
        .route("/api/channels/{id}/videos", get(get_channel_videos))
        .route("/api/channels/{id}/mark-watched", post(mark_channel_watched))
        .route("/api/channels/{id}/prime", post(prime_channel))
        .route("/api/videos", get(get_all_videos))
        .route("/api/videos/{id}/watched", post(toggle_watched))
        .route("/api/stream/{id}", get(stream_video))
        .route("/api/hls/{id}/playlist.m3u8", get(hls_playlist))
        .route("/api/hls/{id}/{segment}", get(hls_segment))
        .route("/api/videos/{id}/direct-url", get(direct_url))
        .route("/api/videos/{id}/description", get(get_video_description))
        .route("/api/search", get(search))
        .route("/api/refresh", post(refresh))
        .route("/api/settings", get(get_settings))
        .route("/api/settings/hide-shorts", post(toggle_hide_shorts))
        .route("/api/settings/resolution", post(toggle_resolution))
        .route("/api/watched", get(get_watched))
        .layer(CorsLayer::new())
        .with_state(AppState { db, hls });

    let addr = format!("0.0.0.0:{port}");
    println!("Feeding Tube web UI: http://localhost:{port}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;

    let old_session = hls_cleanup.lock().ok().and_then(|mut g| g.take());
    if let Some(mut session) = old_session {
        let _ = session.process.kill().await;
        let _ = tokio::fs::remove_dir_all(&session.dir).await;
    }
    let _ = tokio::fs::remove_dir_all(HLS_BASE_DIR).await;

    Ok(())
}

async fn serve_index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

#[derive(Serialize)]
struct LoginUser {
    id: i64,
    name: String,
}

async fn list_users_for_login(
    State(db): State<Db>,
) -> Result<Json<Vec<LoginUser>>, (StatusCode, Json<ErrorResponse>)> {
    let db_guard = lock_db(&db)?;
    let users = db_guard.get_users();
    Ok(Json(users.into_iter().map(|u| LoginUser { id: u.id, name: u.name }).collect()))
}

#[derive(Deserialize)]
struct LoginRequest {
    user_id: i64,
}

async fn login(
    State(db): State<Db>,
    Json(body): Json<LoginRequest>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let db_guard = lock_db(&db)?;
    let user = db_guard.get_user(body.user_id)
        .ok_or_else(|| err_json(StatusCode::NOT_FOUND, "User not found"))?;
    let token = db_guard.create_session(user.id);
    drop(db_guard);

    Response::builder()
        .header("Set-Cookie", format!("ft_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_string(&user).unwrap()))
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}

async fn logout(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    if let Some(token) = get_session_token(&headers) {
        let db_guard = lock_db(&db)?;
        db_guard.delete_session(&token);
    }
    Response::builder()
        .header("Set-Cookie", "ft_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        .header("Content-Type", "application/json")
        .body(Body::from(r#"{"ok":true}"#))
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}

async fn get_current_user(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<User>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    Ok(Json(user))
}

async fn admin_list_users(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<Vec<User>>, (StatusCode, Json<ErrorResponse>)> {
    require_admin(&db, &headers)?;
    let db_guard = lock_db(&db)?;
    Ok(Json(db_guard.get_users()))
}

#[derive(Deserialize)]
struct AddUserRequest {
    name: String,
    role: Option<String>,
}

async fn admin_add_user(
    State(db): State<Db>,
    headers: HeaderMap,
    Json(body): Json<AddUserRequest>,
) -> Result<(StatusCode, Json<User>), (StatusCode, Json<ErrorResponse>)> {
    require_admin(&db, &headers)?;
    let name = body.name.trim().to_string();
    if name.is_empty() || name.len() > 64 {
        return Err(err_json(StatusCode::BAD_REQUEST, "Name must be 1-64 characters"));
    }
    let role = match body.role.as_deref() {
        Some("admin") => "admin",
        _ => "user",
    };
    let db_guard = lock_db(&db)?;
    let user = db_guard.add_user(&name, role)
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok((StatusCode::CREATED, Json(user)))
}

async fn admin_remove_user(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let admin = require_admin(&db, &headers)?;
    if admin.id == id {
        return Err(err_json(StatusCode::BAD_REQUEST, "Cannot remove yourself"));
    }
    let db_guard = lock_db(&db)?;
    db_guard.remove_user(id)
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct ChannelEntry {
    #[serde(flatten)]
    subscription: Subscription,
    new_count: usize,
    video_count: usize,
    latest_date: Option<String>,
    fully_watched: bool,
}

#[derive(Serialize)]
struct ChannelListResponse {
    channels: Vec<ChannelEntry>,
    hide_shorts: bool,
}

async fn list_channels(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<ChannelListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let settings = db.get_settings(user.id);
        let subs = db.get_subscriptions(user.id);
        let new_counts = db.get_new_video_counts(settings.hide_shorts, user.id);
        let stats = db.get_channel_stats(settings.hide_shorts);
        let fully_watched = db.get_fully_watched_channels(settings.hide_shorts, user.id);

        let channels = subs
            .into_iter()
            .map(|s| {
                let stat = stats.get(&s.id);
                ChannelEntry {
                    new_count: *new_counts.get(&s.id).unwrap_or(&0),
                    video_count: stat.map(|st| st.video_count).unwrap_or(0),
                    latest_date: stat.and_then(|st| st.latest_date.clone()),
                    fully_watched: fully_watched.contains(&s.id),
                    subscription: s,
                }
            })
            .collect();

        Ok(Json(ChannelListResponse {
            channels,
            hide_shorts: settings.hide_shorts,
        }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Deserialize)]
struct AddChannelRequest {
    url: String,
}

#[derive(Serialize)]
struct AddChannelResponse {
    channel: Subscription,
    videos_added: usize,
}

async fn add_channel(
    State(db): State<Db>,
    headers: HeaderMap,
    Json(body): Json<AddChannelRequest>,
) -> Result<(StatusCode, Json<AddChannelResponse>), (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let info = ytdlp::get_channel_info(&body.url)
        .await
        .map_err(|e| err_json(StatusCode::BAD_REQUEST, e))?;

    let sub = Subscription {
        id: info.id.clone(),
        name: info.name.clone(),
        url: info.url.clone(),
        added_at: None,
    };

    let channel_id = info.id.clone();
    let channel_name = info.name.clone();

    {
        let db_guard = lock_db(&db)?;
        db_guard
            .add_subscription(&sub, user.id)
            .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    }

    let subs_for_rss = vec![(channel_id, channel_name)];
    let videos = ytdlp::fetch_all_channels_rss(&subs_for_rss).await;

    let videos_added = {
        let db_guard = lock_db(&db)?;
        db_guard.store_videos(&videos)
    };

    let db_guard = lock_db(&db)?;
    let saved_sub = db_guard
        .get_subscriptions(user.id)
        .into_iter()
        .find(|s| s.id == sub.id)
        .unwrap_or(sub);

    Ok((
        StatusCode::CREATED,
        Json(AddChannelResponse {
            channel: saved_sub,
            videos_added,
        }),
    ))
}

async fn remove_channel(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        db.remove_subscription(&id, user.id)
            .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Deserialize)]
struct PaginationQuery {
    page: Option<usize>,
}

#[derive(Serialize)]
struct PaginatedVideosResponse {
    total: usize,
    page: usize,
    page_size: usize,
    videos: Vec<Video>,
}

async fn get_channel_videos(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(params): Query<PaginationQuery>,
) -> Result<Json<PaginatedVideosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let page = params.page.unwrap_or(0);
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let hide_shorts = db.get_settings(user.id).hide_shorts;
        let ids = vec![id];
        let result = db.get_stored_videos_paginated(Some(&ids), page, 50, hide_shorts);
        Ok(Json(PaginatedVideosResponse {
            total: result.total,
            page: result.page,
            page_size: result.page_size,
            videos: result.videos,
        }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

async fn get_all_videos(
    State(db): State<Db>,
    headers: HeaderMap,
    Query(params): Query<PaginationQuery>,
) -> Result<Json<PaginatedVideosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let page = params.page.unwrap_or(0);
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let hide_shorts = db.get_settings(user.id).hide_shorts;
        let result = db.get_stored_videos_paginated(None, page, 50, hide_shorts);
        Ok(Json(PaginatedVideosResponse {
            total: result.total,
            page: result.page,
            page_size: result.page_size,
            videos: result.videos,
        }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Serialize)]
struct WatchedResponse {
    watched: bool,
}

async fn toggle_watched(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<WatchedResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let watched = db.toggle_watched(&id, user.id);
        Ok(Json(WatchedResponse { watched }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

async fn stream_video(
    State(db): State<Db>,
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
    let video_url = format!("https://www.youtube.com/watch?v={}", id);
    let urls = ytdlp::get_stream_urls(&video_url, &max_resolution)
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let mut ffmpeg_args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
    ];
    for url in &urls {
        ffmpeg_args.push("-i".into());
        ffmpeg_args.push(url.clone());
    }
    ffmpeg_args.extend([
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "frag_keyframe+empty_moov+default_base_moof".into(),
        "-f".into(),
        "mp4".into(),
        "pipe:1".into(),
    ]);

    let mut child = tokio::process::Command::new("ffmpeg")
        .args(&ffmpeg_args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start ffmpeg: {e}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| err_json(StatusCode::INTERNAL_SERVER_ERROR, "No stdout from ffmpeg"))?;

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    let stream = ReaderStream::new(stdout);
    let body = Body::from_stream(stream);

    Response::builder()
        .header("Content-Type", "video/mp4")
        .header("Cache-Control", "no-cache")
        .body(body)
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}

#[derive(Serialize)]
struct DirectUrlResponse {
    url: String,
}

async fn direct_url(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<DirectUrlResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    if !ytdlp::is_valid_video_id(&id) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid video ID"));
    }
    let max_resolution = {
        let db_guard = lock_db(&db)?;
        db_guard.get_settings(user.id).max_resolution
    };
    let video_url = format!("https://www.youtube.com/watch?v={}", id);
    let format = if max_resolution == "1080" {
        "best[height<=1080][ext=mp4]/best[ext=mp4]/best[height<=1080]/best"
    } else {
        "best[ext=mp4]/best"
    };
    let output = tokio::process::Command::new("yt-dlp")
        .args(["-f", format, "-g", "--no-warnings", &video_url])
        .output()
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("yt-dlp error: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("yt-dlp error: {}", stderr.trim())));
    }

    let url = String::from_utf8_lossy(&output.stdout)
        .trim()
        .lines()
        .next()
        .unwrap_or("")
        .to_string();

    if url.is_empty() {
        return Err(err_json(StatusCode::INTERNAL_SERVER_ERROR, "No stream URL returned"));
    }

    Ok(Json(DirectUrlResponse { url }))
}

#[derive(Serialize)]
struct MarkWatchedResponse {
    marked: usize,
}

async fn mark_channel_watched(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<MarkWatchedResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db_guard = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let videos = db_guard.get_stored_videos(&id);
        let video_ids: Vec<String> = videos.iter().map(|v| v.id.clone()).collect();
        let marked = db_guard.mark_channel_all_watched(&video_ids, user.id);
        Ok(Json(MarkWatchedResponse { marked }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

async fn search(
    State(db): State<Db>,
    headers: HeaderMap,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<Video>>, (StatusCode, Json<ErrorResponse>)> {
    require_user(&db, &headers)?;
    let videos = ytdlp::search_youtube(&params.q, 20)
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(videos))
}

#[derive(Serialize)]
struct DescriptionResponse {
    title: String,
    description: String,
    channel_name: String,
}

async fn get_video_description(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<DescriptionResponse>, (StatusCode, Json<ErrorResponse>)> {
    require_user(&db, &headers)?;
    let desc = ytdlp::get_video_description(&id)
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(DescriptionResponse {
        title: desc.title,
        description: desc.description,
        channel_name: desc.channel_name,
    }))
}

#[derive(Serialize)]
struct RefreshResponse {
    videos_added: usize,
}

async fn refresh(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<RefreshResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let subs = {
        let db_guard = lock_db(&db)?;
        db_guard
            .get_subscriptions(user.id)
            .into_iter()
            .map(|s| (s.id, s.name))
            .collect::<Vec<_>>()
    };

    let videos = ytdlp::fetch_all_channels_rss(&subs).await;

    let db = db.clone();
    let videos_added = tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        Ok::<usize, (StatusCode, Json<ErrorResponse>)>(db.store_videos(&videos))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
    ?;

    Ok(Json(RefreshResponse { videos_added }))
}

#[derive(Serialize)]
struct PrimeResponse {
    added: usize,
    total: usize,
    skipped: usize,
}

async fn prime_channel(
    State(db): State<Db>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<PrimeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let (channel_name, channel_url, existing_ids) = {
        let db_guard = lock_db(&db)?;
        let subs = db_guard.get_subscriptions(user.id);
        let sub = subs
            .into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| err_json(StatusCode::NOT_FOUND, "Channel not found"))?;
        let existing = db_guard.get_stored_videos(&id).into_iter().map(|v| v.id).collect::<HashSet<_>>();
        (sub.name, sub.url, existing)
    };

    let result = ytdlp::prime_channel(&id, &channel_name, &channel_url, &existing_ids, |_| {})
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    if !result.videos.is_empty() {
        let db = db.clone();
        let videos = result.videos;
        let stored = tokio::task::spawn_blocking(move || {
            let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
            Ok::<usize, (StatusCode, Json<ErrorResponse>)>(db.store_videos(&videos))
        })
        .await
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
        ?;

        Ok(Json(PrimeResponse {
            added: stored,
            total: result.total,
            skipped: result.skipped,
        }))
    } else {
        Ok(Json(PrimeResponse {
            added: 0,
            total: result.total,
            skipped: result.skipped,
        }))
    }
}

async fn get_settings(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<crate::db::Settings>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        Ok(Json(db.get_settings(user.id)))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Serialize)]
struct HideShortsResponse {
    hide_shorts: bool,
}

async fn toggle_hide_shorts(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<HideShortsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let current = db.get_settings(user.id);
        let new_val = !current.hide_shorts;
        db.update_setting("hideShorts", &serde_json::to_string(&new_val).unwrap(), user.id);
        Ok(Json(HideShortsResponse {
            hide_shorts: new_val,
        }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Serialize)]
struct ResolutionResponse {
    max_resolution: String,
}

async fn toggle_resolution(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<ResolutionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let current = db.get_settings(user.id);
        let new_val = if current.max_resolution == "1080" { "max" } else { "1080" };
        db.update_setting("maxResolution", &serde_json::to_string(new_val).unwrap(), user.id);
        Ok(Json(ResolutionResponse {
            max_resolution: new_val.to_string(),
        }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

#[derive(Serialize)]
struct WatchedIdsResponse {
    watched: Vec<String>,
}

async fn get_watched(
    State(db): State<Db>,
    headers: HeaderMap,
) -> Result<Json<WatchedIdsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = require_user(&db, &headers)?;
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let ids: Vec<String> = db.get_watched_ids(user.id).into_iter().collect();
        Ok(Json(WatchedIdsResponse { watched: ids }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

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

    let old_session: Option<HlsSession> = {
        let mut guard = hls
            .lock()
            .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
        let is_same = guard.as_ref().map(|s| s.video_id == id).unwrap_or(false);
        if is_same { None } else { guard.take() }
    };

    if let Some(mut old) = old_session {
        let _ = old.process.kill().await;
        let _ = tokio::fs::remove_dir_all(&old.dir).await;
    }

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

        let dir = std::path::PathBuf::from(format!("{}/{}", HLS_BASE_DIR, id));
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create HLS dir: {e}")))?;

        let playlist_path = dir.join("playlist.m3u8");
        let segment_pattern = dir.join("seg%04d.ts");

        let mut ffmpeg_args: Vec<String> =
            vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
        ffmpeg_args.extend(["-i".into(), info.video_url]);
        let has_audio_input = info.audio_url.is_some();
        if let Some(audio_url) = info.audio_url {
            ffmpeg_args.extend(["-i".into(), audio_url]);
        }
        if has_audio_input {
            ffmpeg_args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
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
            "-hls_segment_filename".into(),
            segment_pattern.to_str()
                .ok_or_else(|| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Invalid segment path"))?
                .to_string(),
            playlist_path.to_str()
                .ok_or_else(|| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Invalid playlist path"))?
                .to_string(),
        ]);

        let child = tokio::process::Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start ffmpeg: {e}"))
            })?;

        {
            let mut guard = hls
                .lock()
                .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
            *guard = Some(HlsSession { video_id: id.clone(), process: child, dir });
        }
    }

    let first_seg = std::path::PathBuf::from(format!("{}/{}/seg0000.ts", HLS_BASE_DIR, id));
    let playlist_path = std::path::PathBuf::from(format!("{}/{}/playlist.m3u8", HLS_BASE_DIR, id));
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);

    loop {
        if tokio::fs::metadata(&first_seg).await.is_ok() {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            let dead_session = hls.lock().ok().and_then(|mut g| g.take());
            if let Some(mut s) = dead_session {
                let _ = s.process.kill().await;
                let _ = tokio::fs::remove_dir_all(&s.dir).await;
            }
            return Err(err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Timed out waiting for HLS stream to start",
            ));
        }
        let exited = {
            let mut guard = hls
                .lock()
                .map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "HLS lock poisoned"))?;
            if let Some(ref mut session) = *guard {
                if session.video_id == id {
                    session.process.try_wait().ok().flatten().is_some()
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

    let base = std::path::PathBuf::from(format!("{}/{}", HLS_BASE_DIR, id));
    let path = base.join(&segment);
    // Belt-and-suspenders: verify the resolved path stays inside the expected dir
    if !path.starts_with(&base) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid segment path"));
    }

    // Poll up to 5 seconds for the segment to be written by FFmpeg.
    // Attempt File::open directly to avoid TOCTOU.
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    let file = loop {
        match tokio::fs::File::open(&path).await {
            Ok(f) => break f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to open segment: {e}"))),
        }
        if tokio::time::Instant::now() >= deadline {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse { error: "Segment not found".into() }),
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    };
    let stream = ReaderStream::new(file);

    Response::builder()
        .header("Content-Type", "video/mp2t")
        .header("Cache-Control", "no-cache")
        .body(Body::from_stream(stream))
        .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Response error: {e}")))
}
