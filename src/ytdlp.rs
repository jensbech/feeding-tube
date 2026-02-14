use std::collections::HashSet;
use std::time::Duration;

use chrono::{DateTime, NaiveDate, Utc};
use regex::Regex;
use tokio::process::Command;
use tokio::time::timeout;

use crate::db::{decode_xml_entities, format_duration, get_relative_date, Video};

#[derive(Debug, Clone)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug)]
pub struct PrimeResult {
    pub added: usize,
    pub total: usize,
    pub skipped: usize,
    pub failed: usize,
    pub videos: Vec<Video>,
}

// ── Validation ─────────────────────────────────────────────

pub fn is_valid_youtube_url(url: &str) -> bool {
    let patterns = [
        r"^https?://(www\.)?(youtube\.com|youtu\.be)/",
        r"^https?://(www\.)?youtube\.com/@[\w.\-]+",
    ];
    patterns
        .iter()
        .any(|p| Regex::new(p).unwrap().is_match(url))
}

pub fn is_valid_video_id(id: &str) -> bool {
    Regex::new(r"^[a-zA-Z0-9_\-]{11}$")
        .unwrap()
        .is_match(id)
}

pub fn sanitize_search_query(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.len() > 500 {
        trimmed[..500].to_string()
    } else {
        trimmed.to_string()
    }
}

fn validate_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

// ── Channel Info ───────────────────────────────────────────

pub async fn get_channel_info(url: &str) -> Result<ChannelInfo, String> {
    let channel_url = url.trim();
    if !validate_url(channel_url) {
        return Err("Invalid URL format".to_string());
    }
    if !is_valid_youtube_url(channel_url) {
        return Err("Not a valid YouTube URL".to_string());
    }

    let is_video_url =
        channel_url.contains("/watch?") || channel_url.contains("youtu.be/");

    let output = Command::new("yt-dlp")
        .args([
            "--dump-json",
            "--playlist-items",
            "1",
            "--no-warnings",
            channel_url,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {e}"))?;

    let id = data["channel_id"]
        .as_str()
        .ok_or("No channel_id found")?
        .to_string();
    let name = data["channel"]
        .as_str()
        .or(data["uploader"].as_str())
        .ok_or("No channel name found")?
        .to_string();
    let url = data["channel_url"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if is_video_url {
                format!("https://www.youtube.com/channel/{}", id)
            } else {
                channel_url.to_string()
            }
        });

    Ok(ChannelInfo { id, name, url })
}

// ── RSS Feed ───────────────────────────────────────────────

fn parse_rss_entry(
    entry: &str,
    channel_id: &str,
    channel_name: &str,
) -> Option<Video> {
    let video_id = extract_xml_tag(entry, "yt:videoId")?;
    let title = extract_xml_tag(entry, "title")?;
    let published = extract_xml_tag(entry, "published");
    let link = extract_xml_attr(entry, "link", "href");

    let published_date = published
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc));

    let url = link.unwrap_or_else(|| {
        format!("https://www.youtube.com/watch?v={}", video_id)
    });

    let is_short = url.contains("/shorts/");
    let relative_date = published_date
        .map(|d| get_relative_date(d))
        .unwrap_or_default();

    Some(Video {
        id: video_id,
        title: decode_xml_entities(&title),
        url,
        is_short,
        channel_name: Some(channel_name.to_string()),
        channel_id: Some(channel_id.to_string()),
        published_date,
        stored_at: None,
        relative_date,
        duration: None,
        duration_string: Some("--:--".to_string()),
        view_count: None,
    })
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].to_string())
}

fn extract_xml_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let pattern = format!("<{}", tag);
    let start = xml.find(&pattern)?;
    let rest = &xml[start..];
    let end = rest.find("/>")?;
    let tag_content = &rest[..end];
    let attr_pattern = format!("{}=\"", attr);
    let attr_start = tag_content.find(&attr_pattern)? + attr_pattern.len();
    let attr_end = tag_content[attr_start..].find('"')? + attr_start;
    Some(tag_content[attr_start..attr_end].to_string())
}

fn parse_rss_feed(
    xml: &str,
    channel_id: &str,
    channel_name: &str,
) -> Vec<Video> {
    let mut entries = Vec::new();
    let mut search_start = 0;

    while let Some(entry_start) = xml[search_start..].find("<entry>") {
        let abs_start = search_start + entry_start;
        if let Some(entry_end) = xml[abs_start..].find("</entry>") {
            let entry = &xml[abs_start + 7..abs_start + entry_end];
            if let Some(video) = parse_rss_entry(entry, channel_id, channel_name) {
                entries.push(video);
            }
            search_start = abs_start + entry_end + 8;
        } else {
            break;
        }
    }
    entries
}

async fn fetch_channel_rss(
    channel_id: &str,
    channel_name: &str,
) -> Vec<Video> {
    let rss_url = format!(
        "https://www.youtube.com/feeds/videos.xml?channel_id={}",
        channel_id
    );

    match Command::new("curl")
        .args(["-s", &rss_url])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            parse_rss_feed(&stdout, channel_id, channel_name)
        }
        _ => Vec::new(),
    }
}

pub async fn fetch_all_channels_rss(
    subscriptions: &[(String, String)],
) -> Vec<Video> {
    if subscriptions.is_empty() {
        return Vec::new();
    }

    let mut all_videos = Vec::new();
    let batch_size = 20;

    for chunk in subscriptions.chunks(batch_size) {
        let mut handles = Vec::new();
        for (id, name) in chunk {
            let id = id.clone();
            let name = name.clone();
            handles.push(tokio::spawn(async move {
                fetch_channel_rss(&id, &name).await
            }));
        }

        for handle in handles {
            if let Ok(videos) = handle.await {
                all_videos.extend(videos);
            }
        }
    }

    all_videos
}

// ── Channel Videos ─────────────────────────────────────────

pub async fn get_channel_videos(
    channel_id: &str,
    channel_name: &str,
) -> Vec<Video> {
    fetch_channel_rss(channel_id, channel_name).await
}

pub async fn refresh_all_videos(
    subscriptions: &[(String, String)],
) -> Vec<Video> {
    fetch_all_channels_rss(subscriptions).await
}

// ── Search ─────────────────────────────────────────────────

pub async fn search_youtube(
    query: &str,
    limit: usize,
) -> Result<Vec<Video>, String> {
    let sanitized = sanitize_search_query(query);
    if sanitized.is_empty() {
        return Err("Search query cannot be empty".to_string());
    }
    let safe_limit = limit.clamp(1, 50);

    let search_arg = format!("ytsearch{}:{}", safe_limit, sanitized);

    let result = timeout(
        Duration::from_secs(30),
        Command::new("yt-dlp")
            .args([
                &search_arg,
                "--flat-playlist",
                "--dump-json",
                "--no-warnings",
            ])
            .output(),
    )
    .await
    .map_err(|_| "Search timed out".to_string())?
    .map_err(|e| format!("Search failed: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Search failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&result.stdout);
    let mut videos = Vec::new();

    for line in stdout.lines().filter(|l| !l.is_empty()) {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(line) {
            let published_date = data["release_timestamp"]
                .as_i64()
                .or(data["timestamp"].as_i64())
                .and_then(|ts| DateTime::from_timestamp(ts, 0));

            let duration = data["duration"].as_i64();
            let duration_string = data["duration_string"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format_duration(duration));

            let relative_date = published_date
                .map(|d| get_relative_date(d))
                .unwrap_or_default();

            videos.push(Video {
                id: data["id"].as_str().unwrap_or("").to_string(),
                title: data["title"].as_str().unwrap_or("").to_string(),
                url: data["webpage_url"]
                    .as_str()
                    .or(data["url"].as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        format!(
                            "https://www.youtube.com/watch?v={}",
                            data["id"].as_str().unwrap_or("")
                        )
                    }),
                channel_name: Some(
                    data["channel"]
                        .as_str()
                        .or(data["uploader"].as_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                ),
                channel_id: data["channel_id"].as_str().map(|s| s.to_string()),
                is_short: false,
                published_date,
                stored_at: None,
                relative_date,
                duration,
                duration_string: Some(duration_string),
                view_count: data["view_count"].as_u64(),
            });
        }
    }

    Ok(videos)
}

// ── Video Description ──────────────────────────────────────

pub struct VideoDescription {
    pub title: String,
    pub description: String,
    pub channel_name: String,
}

pub async fn get_video_description(
    video_id: &str,
) -> Result<VideoDescription, String> {
    if !is_valid_video_id(video_id) {
        return Err("Invalid video ID format".to_string());
    }

    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let result = timeout(
        Duration::from_secs(15),
        Command::new("yt-dlp")
            .args([
                "--dump-json",
                "--no-warnings",
                "--extractor-args",
                "youtube:skip=dash,hls",
                &url,
            ])
            .output(),
    )
    .await
    .map_err(|_| "Request timed out".to_string())?
    .map_err(|e| format!("Failed to get description: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&result.stdout);
    let data: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Parse error: {e}"))?;

    Ok(VideoDescription {
        title: data["title"].as_str().unwrap_or("").to_string(),
        description: data["description"]
            .as_str()
            .unwrap_or("No description available.")
            .to_string(),
        channel_name: data["channel"]
            .as_str()
            .or(data["uploader"].as_str())
            .unwrap_or("Unknown")
            .to_string(),
    })
}

// ── Stream URL ─────────────────────────────────────────────

pub async fn get_stream_url(video_url: &str) -> Result<Vec<String>, String> {
    let output = Command::new("yt-dlp")
        .args([
            "-f",
            "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "-g",
            "--no-warnings",
            video_url,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to get stream URL: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .lines()
        .map(|l| l.to_string())
        .collect())
}

// ── Priming ────────────────────────────────────────────────

async fn fetch_with_retry(
    args: &[&str],
    max_retries: usize,
    base_delay_ms: u64,
) -> Result<String, String> {
    let mut last_error = String::new();

    for attempt in 0..max_retries {
        match timeout(
            Duration::from_secs(60),
            Command::new("yt-dlp").args(args).output(),
        )
        .await
        {
            Ok(Ok(output)) if output.status.success() => {
                return Ok(String::from_utf8_lossy(&output.stdout).to_string());
            }
            Ok(Ok(output)) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let is_throttled = stderr.contains("429")
                    || stderr.contains("Too Many Requests")
                    || stderr.contains("rate limit");

                if attempt < max_retries - 1 && is_throttled {
                    let delay = base_delay_ms * 2u64.pow(attempt as u32);
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                    last_error = stderr;
                    continue;
                }
                return Err(stderr);
            }
            Ok(Err(e)) => return Err(format!("Process error: {e}")),
            Err(_) => {
                if attempt < max_retries - 1 {
                    let delay = base_delay_ms * 2u64.pow(attempt as u32);
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                    last_error = "Timeout".to_string();
                    continue;
                }
                return Err("Timed out".to_string());
            }
        }
    }

    Err(last_error)
}

async fn fetch_video_batch(
    video_ids: &[String],
    channel_id: &str,
    channel_name: &str,
) -> Vec<Video> {
    let urls: Vec<String> = video_ids
        .iter()
        .map(|id| format!("https://www.youtube.com/watch?v={}", id))
        .collect();

    let mut args: Vec<&str> = vec![
        "--dump-json",
        "--no-warnings",
        "--extractor-args",
        "youtube:skip=dash,hls",
        "--socket-timeout",
        "30",
    ];
    for url in &urls {
        args.push(url);
    }

    let stdout = match fetch_with_retry(&args, 2, 1000).await {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut videos = Vec::new();
    for line in stdout.lines().filter(|l| !l.is_empty()) {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(line) {
            let upload_date = data["upload_date"]
                .as_str()
                .and_then(|s| parse_date_yyyymmdd(s));
            let duration = data["duration"].as_i64();
            let is_short = duration.map(|d| d <= 60).unwrap_or(false)
                || data["webpage_url"]
                    .as_str()
                    .map(|u| u.contains("/shorts/"))
                    .unwrap_or(false);
            let relative_date = upload_date
                .map(|d| get_relative_date(d))
                .unwrap_or_default();

            let duration_string = data["duration_string"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format_duration(duration));
            let view_count = data["view_count"].as_u64();

            videos.push(Video {
                id: data["id"].as_str().unwrap_or("").to_string(),
                title: data["title"].as_str().unwrap_or("").to_string(),
                url: data["webpage_url"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        format!(
                            "https://www.youtube.com/watch?v={}",
                            data["id"].as_str().unwrap_or("")
                        )
                    }),
                is_short,
                channel_name: Some(channel_name.to_string()),
                channel_id: Some(channel_id.to_string()),
                published_date: upload_date,
                stored_at: None,
                relative_date,
                duration,
                duration_string: Some(duration_string),
                view_count,
            });
        }
    }
    videos
}

pub async fn prime_channel<F>(
    channel_id: &str,
    channel_name: &str,
    channel_url: &str,
    existing_ids: &HashSet<String>,
    on_progress: F,
) -> Result<PrimeResult, String>
where
    F: Fn(usize, usize) + Send + Sync + 'static,
{
    let mut url = channel_url.to_string();
    if !url.contains("/videos") {
        url = url.trim_end_matches('/').to_string() + "/videos";
    }

    let list_out = fetch_with_retry(
        &[
            "--flat-playlist",
            "--print",
            "%(id)s",
            "--no-warnings",
            "--extractor-args",
            "youtube:skip=dash,hls",
            "--playlist-end",
            "5000",
            &url,
        ],
        3,
        2000,
    )
    .await
    .map_err(|e| format!("Failed to list videos: {e}"))?;

    let video_ids: Vec<String> = list_out
        .trim()
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    let total = video_ids.len();
    let new_video_ids: Vec<String> = video_ids
        .into_iter()
        .filter(|id| !existing_ids.contains(id))
        .collect();

    on_progress(0, new_video_ids.len());

    if new_video_ids.is_empty() {
        return Ok(PrimeResult {
            added: 0,
            total,
            skipped: existing_ids.len(),
            failed: 0,
            videos: Vec::new(),
        });
    }

    let batch_size = 5;
    let concurrency = 50;
    let batches: Vec<Vec<String>> = new_video_ids
        .chunks(batch_size)
        .map(|c| c.to_vec())
        .collect();

    let mut added = 0usize;
    let mut failed = 0usize;
    let mut all_videos: Vec<Video> = Vec::new();

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency));
    let progress_counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let new_total = new_video_ids.len();
    let ch_id = channel_id.to_string();
    let ch_name = channel_name.to_string();

    let on_progress = std::sync::Arc::new(on_progress);

    let mut handles = Vec::new();
    for batch in batches {
        let sem = semaphore.clone();
        let counter = progress_counter.clone();
        let cid = ch_id.clone();
        let cname = ch_name.clone();
        let prog = on_progress.clone();
        let batch_len = batch.len();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            let videos = fetch_video_batch(&batch, &cid, &cname).await;
            let processed = counter.fetch_add(batch_len, std::sync::atomic::Ordering::Relaxed)
                + batch_len;
            prog(processed.min(new_total), new_total);
            videos
        }));
    }

    for handle in handles {
        match handle.await {
            Ok(videos) => {
                if videos.is_empty() {
                    failed += batch_size;
                } else {
                    added += videos.len();
                    all_videos.extend(videos);
                }
            }
            Err(_) => {
                failed += batch_size;
            }
        }
    }

    on_progress(new_total, new_total);

    Ok(PrimeResult {
        added,
        total,
        skipped: existing_ids.len(),
        failed,
        videos: all_videos,
    })
}

fn parse_date_yyyymmdd(s: &str) -> Option<DateTime<Utc>> {
    if s.len() != 8 {
        return None;
    }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[4..6].parse().ok()?;
    let day: u32 = s[6..8].parse().ok()?;
    NaiveDate::from_ymd_opt(year, month, day)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|dt| dt.and_utc())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_valid_youtube_url tests ───────────────────────────

    #[test]
    fn test_valid_youtube_channel_url() {
        assert!(is_valid_youtube_url("https://www.youtube.com/@channel"));
        assert!(is_valid_youtube_url("https://youtube.com/@channel"));
        assert!(is_valid_youtube_url("http://www.youtube.com/@channel"));
    }

    #[test]
    fn test_valid_youtube_video_url() {
        assert!(is_valid_youtube_url(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        ));
        assert!(is_valid_youtube_url("https://youtu.be/dQw4w9WgXcQ"));
    }

    #[test]
    fn test_valid_youtube_channel_path() {
        assert!(is_valid_youtube_url(
            "https://www.youtube.com/channel/UC1234"
        ));
    }

    #[test]
    fn test_invalid_youtube_url() {
        assert!(!is_valid_youtube_url("https://example.com"));
        assert!(!is_valid_youtube_url("not-a-url"));
        assert!(!is_valid_youtube_url(""));
        assert!(!is_valid_youtube_url("ftp://youtube.com/@channel"));
    }

    // ── is_valid_video_id tests ──────────────────────────────

    #[test]
    fn test_valid_video_id() {
        assert!(is_valid_video_id("dQw4w9WgXcQ"));
        assert!(is_valid_video_id("abcdefghijk"));
        assert!(is_valid_video_id("_-_________"));
    }

    #[test]
    fn test_invalid_video_id() {
        assert!(!is_valid_video_id(""));
        assert!(!is_valid_video_id("short"));
        assert!(!is_valid_video_id("way_too_long_id_here"));
        assert!(!is_valid_video_id("has spaces!"));
    }

    // ── sanitize_search_query tests ──────────────────────────

    #[test]
    fn test_sanitize_search_query_normal() {
        assert_eq!(sanitize_search_query("hello world"), "hello world");
    }

    #[test]
    fn test_sanitize_search_query_trims() {
        assert_eq!(sanitize_search_query("  hello  "), "hello");
    }

    #[test]
    fn test_sanitize_search_query_truncates() {
        let long = "a".repeat(600);
        let result = sanitize_search_query(&long);
        assert_eq!(result.len(), 500);
    }

    #[test]
    fn test_sanitize_search_query_empty() {
        assert_eq!(sanitize_search_query(""), "");
    }

    // ── extract_xml_tag tests ────────────────────────────────

    #[test]
    fn test_extract_xml_tag() {
        let xml = "<entry><title>Hello World</title></entry>";
        assert_eq!(extract_xml_tag(xml, "title"), Some("Hello World".to_string()));
    }

    #[test]
    fn test_extract_xml_tag_missing() {
        let xml = "<entry><title>Hello</title></entry>";
        assert_eq!(extract_xml_tag(xml, "missing"), None);
    }

    #[test]
    fn test_extract_xml_attr() {
        let xml = r#"<link rel="alternate" href="https://example.com"/>"#;
        assert_eq!(
            extract_xml_attr(xml, "link", "href"),
            Some("https://example.com".to_string())
        );
    }

    #[test]
    fn test_extract_xml_attr_missing() {
        let xml = r#"<link rel="alternate"/>"#;
        assert_eq!(extract_xml_attr(xml, "link", "href"), None);
    }

    // ── parse_rss_entry tests ────────────────────────────────

    #[test]
    fn test_parse_rss_entry_valid() {
        let entry = r#"
            <yt:videoId>dQw4w9WgXcQ</yt:videoId>
            <title>Test Video</title>
            <published>2024-01-15T10:30:00+00:00</published>
            <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
        "#;
        let video = parse_rss_entry(entry, "ch1", "TestChannel");
        assert!(video.is_some());
        let v = video.unwrap();
        assert_eq!(v.id, "dQw4w9WgXcQ");
        assert_eq!(v.title, "Test Video");
        assert_eq!(v.channel_id, Some("ch1".to_string()));
        assert_eq!(v.channel_name, Some("TestChannel".to_string()));
        assert!(v.published_date.is_some());
    }

    #[test]
    fn test_parse_rss_entry_missing_id() {
        let entry = "<title>Test Video</title>";
        let video = parse_rss_entry(entry, "ch1", "TestChannel");
        assert!(video.is_none());
    }

    #[test]
    fn test_parse_rss_entry_missing_title() {
        let entry = "<yt:videoId>abc12345678</yt:videoId>";
        let video = parse_rss_entry(entry, "ch1", "TestChannel");
        assert!(video.is_none());
    }

    #[test]
    fn test_parse_rss_entry_entities_in_title() {
        let entry = r#"
            <yt:videoId>dQw4w9WgXcQ</yt:videoId>
            <title>Tom &amp; Jerry</title>
        "#;
        let video = parse_rss_entry(entry, "ch1", "TestChannel").unwrap();
        assert_eq!(video.title, "Tom & Jerry");
    }

    // ── parse_rss_feed tests ─────────────────────────────────

    #[test]
    fn test_parse_rss_feed_multiple_entries() {
        let xml = r#"
            <feed>
                <entry>
                    <yt:videoId>id1id1id1id</yt:videoId>
                    <title>Video 1</title>
                </entry>
                <entry>
                    <yt:videoId>id2id2id2id</yt:videoId>
                    <title>Video 2</title>
                </entry>
            </feed>
        "#;
        let videos = parse_rss_feed(xml, "ch1", "TestChannel");
        assert_eq!(videos.len(), 2);
        assert_eq!(videos[0].id, "id1id1id1id");
        assert_eq!(videos[1].id, "id2id2id2id");
    }

    #[test]
    fn test_parse_rss_feed_empty() {
        let xml = "<feed></feed>";
        let videos = parse_rss_feed(xml, "ch1", "TestChannel");
        assert!(videos.is_empty());
    }

    #[test]
    fn test_parse_rss_feed_invalid_entry() {
        let xml = r#"
            <feed>
                <entry>
                    <title>No ID</title>
                </entry>
                <entry>
                    <yt:videoId>validId12345</yt:videoId>
                    <title>Has ID</title>
                </entry>
            </feed>
        "#;
        let videos = parse_rss_feed(xml, "ch1", "TestChannel");
        assert_eq!(videos.len(), 1);
        assert_eq!(videos[0].title, "Has ID");
    }

    // ── parse_date_yyyymmdd tests ────────────────────────────

    #[test]
    fn test_parse_date_valid() {
        let date = parse_date_yyyymmdd("20240115");
        assert!(date.is_some());
        let d = date.unwrap();
        assert_eq!(d.format("%Y-%m-%d").to_string(), "2024-01-15");
    }

    #[test]
    fn test_parse_date_invalid_length() {
        assert!(parse_date_yyyymmdd("2024").is_none());
        assert!(parse_date_yyyymmdd("").is_none());
        assert!(parse_date_yyyymmdd("202401151").is_none());
    }

    #[test]
    fn test_parse_date_invalid_date() {
        assert!(parse_date_yyyymmdd("20241301").is_none()); // month 13
        assert!(parse_date_yyyymmdd("20240132").is_none()); // day 32
    }

    #[test]
    fn test_parse_date_not_numbers() {
        assert!(parse_date_yyyymmdd("abcdefgh").is_none());
    }
}
