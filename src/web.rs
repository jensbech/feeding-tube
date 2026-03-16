use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio_util::io::ReaderStream;
use tower_http::cors::CorsLayer;

use crate::db::{Database, Subscription, Video};
use crate::ytdlp;

type Db = Arc<Mutex<Database>>;

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

static INDEX_HTML: &str = include_str!("../static/index.html");

pub async fn start(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open().map_err(|e| format!("Failed to open database: {e}"))?;
    let db: Db = Arc::new(Mutex::new(db));

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/api/channels", get(list_channels))
        .route("/api/channels", post(add_channel))
        .route("/api/channels/{id}", delete(remove_channel))
        .route("/api/channels/{id}/videos", get(get_channel_videos))
        .route("/api/channels/{id}/mark-watched", post(mark_channel_watched))
        .route("/api/channels/{id}/prime", post(prime_channel))
        .route("/api/videos", get(get_all_videos))
        .route("/api/videos/{id}/watched", post(toggle_watched))
        .route("/api/stream/{id}", get(stream_video))
        .route("/api/videos/{id}/direct-url", get(direct_url))
        .route("/api/videos/{id}/description", get(get_video_description))
        .route("/api/search", get(search))
        .route("/api/refresh", post(refresh))
        .route("/api/settings", get(get_settings))
        .route("/api/settings/hide-shorts", post(toggle_hide_shorts))
        .route("/api/settings/resolution", post(toggle_resolution))
        .route("/api/watched", get(get_watched))
        .layer(CorsLayer::permissive())
        .with_state(db);

    let addr = format!("0.0.0.0:{port}");
    println!("Feeding Tube web UI: http://localhost:{port}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn serve_index() -> Html<&'static str> {
    Html(INDEX_HTML)
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
) -> Result<Json<ChannelListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let settings = db.get_settings();
        let subs = db.get_subscriptions();
        let new_counts = db.get_new_video_counts(settings.hide_shorts);
        let stats = db.get_channel_stats(settings.hide_shorts);
        let fully_watched = db.get_fully_watched_channels(settings.hide_shorts);

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
    Json(body): Json<AddChannelRequest>,
) -> Result<(StatusCode, Json<AddChannelResponse>), (StatusCode, Json<ErrorResponse>)> {
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
            .add_subscription(&sub)
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
        .get_subscriptions()
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
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        db.remove_subscription(&id)
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
    Path(id): Path<String>,
    Query(params): Query<PaginationQuery>,
) -> Result<Json<PaginatedVideosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let page = params.page.unwrap_or(0);
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let hide_shorts = db.get_settings().hide_shorts;
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
    Query(params): Query<PaginationQuery>,
) -> Result<Json<PaginatedVideosResponse>, (StatusCode, Json<ErrorResponse>)> {
    let page = params.page.unwrap_or(0);
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let hide_shorts = db.get_settings().hide_shorts;
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
    Path(id): Path<String>,
) -> Result<Json<WatchedResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let watched = db.toggle_watched(&id);
        Ok(Json(WatchedResponse { watched }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}

async fn stream_video(
    State(db): State<Db>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    if !ytdlp::is_valid_video_id(&id) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid video ID"));
    }
    let max_resolution = {
        let db_guard = lock_db(&db)?;
        db_guard.get_settings().max_resolution
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
    Path(id): Path<String>,
) -> Result<Json<DirectUrlResponse>, (StatusCode, Json<ErrorResponse>)> {
    if !ytdlp::is_valid_video_id(&id) {
        return Err(err_json(StatusCode::BAD_REQUEST, "Invalid video ID"));
    }
    let max_resolution = {
        let db_guard = lock_db(&db)?;
        db_guard.get_settings().max_resolution
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
    Path(id): Path<String>,
) -> Result<Json<MarkWatchedResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db_guard = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let videos = db_guard.get_stored_videos(&id);
        let video_ids: Vec<String> = videos.iter().map(|v| v.id.clone()).collect();
        let marked = db_guard.mark_channel_all_watched(&video_ids);
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
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<Video>>, (StatusCode, Json<ErrorResponse>)> {
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
    Path(id): Path<String>,
) -> Result<Json<DescriptionResponse>, (StatusCode, Json<ErrorResponse>)> {
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
) -> Result<Json<RefreshResponse>, (StatusCode, Json<ErrorResponse>)> {
    let subs = {
        let db_guard = lock_db(&db)?;
        db_guard
            .get_subscriptions()
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
    Path(id): Path<String>,
) -> Result<Json<PrimeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let (channel_name, channel_url, existing_ids) = {
        let db_guard = lock_db(&db)?;
        let subs = db_guard.get_subscriptions();
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
) -> Result<Json<crate::db::Settings>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        Ok(Json(db.get_settings()))
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
) -> Result<Json<HideShortsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let current = db.get_settings();
        let new_val = !current.hide_shorts;
        db.update_setting("hideShorts", &serde_json::to_string(&new_val).unwrap());
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
) -> Result<Json<ResolutionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let current = db.get_settings();
        let new_val = if current.max_resolution == "1080" { "max" } else { "1080" };
        db.update_setting("maxResolution", &serde_json::to_string(new_val).unwrap());
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
) -> Result<Json<WatchedIdsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let db = db.lock().map_err(|_| err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))?;
        let ids: Vec<String> = db.get_watched_ids().into_iter().collect();
        Ok(Json(WatchedIdsResponse { watched: ids }))
    })
    .await
    .map_err(|e| err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("Task failed: {e}")))?
}
