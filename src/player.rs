use std::process::Stdio;
use tokio::process::Command;

const SUPPORTED_PLAYERS: &[&str] = &["mpv", "iina", "vlc"];

fn player_args(player: &str) -> &[&str] {
    match player {
        "mpv" => &["--force-window=immediate", "--keep-open=no"],
        "iina" => &["--no-stdin"],
        "vlc" => &["--no-video-title-show"],
        _ => &[],
    }
}

fn extract_video_id(url: &str) -> Option<String> {
    let patterns = [
        regex::Regex::new(r"(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_\-]{11})").unwrap(),
        regex::Regex::new(r"youtube\.com/embed/([a-zA-Z0-9_\-]{11})").unwrap(),
    ];
    for pattern in &patterns {
        if let Some(caps) = pattern.captures(url) {
            return Some(caps[1].to_string());
        }
    }
    None
}

pub async fn check_player(player: &str) -> bool {
    Command::new("which")
        .arg(player)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

pub async fn get_available_players() -> Vec<String> {
    let mut available = Vec::new();
    for &player in SUPPORTED_PLAYERS {
        if check_player(player).await {
            available.push(player.to_string());
        }
    }
    available
}

pub async fn auto_detect_player() -> Option<String> {
    for &player in SUPPORTED_PLAYERS {
        if check_player(player).await {
            return Some(player.to_string());
        }
    }
    None
}

pub struct PlayResult {
    pub success: bool,
    pub player: String,
    pub error: Option<String>,
}

pub async fn play_video(
    video_url: &str,
    video_id: Option<&str>,
    configured_player: &str,
    max_resolution: &str,
) -> (PlayResult, Option<String>) {
    let id = video_id
        .map(|s| s.to_string())
        .or_else(|| extract_video_id(video_url));

    let mut player = configured_player.to_string();

    if !check_player(&player).await {
        if let Some(detected) = auto_detect_player().await {
            player = detected;
        } else {
            return (
                PlayResult {
                    success: false,
                    player: String::new(),
                    error: Some(
                        "No video player found. Please install mpv, iina, or vlc.".to_string(),
                    ),
                },
                id,
            );
        }
    }

    let args = player_args(&player);
    let mut cmd_args: Vec<&str> = args.to_vec();

    let format_arg: String;
    if max_resolution == "1080" {
        match player.as_str() {
            "mpv" => {
                format_arg = "--ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string();
                cmd_args.push(&format_arg);
            }
            "iina" => {
                format_arg = "--mpv-ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string();
                cmd_args.push(&format_arg);
            }
            _ => {}
        }
    }

    cmd_args.push(video_url);

    let result = std::process::Command::new(&player)
        .args(&cmd_args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    match result {
        Ok(_child) => (
            PlayResult {
                success: true,
                player: player.clone(),
                error: None,
            },
            id,
        ),
        Err(e) => {
            // Fallback to `open` command (macOS)
            let open_result = std::process::Command::new("open")
                .arg(video_url)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();

            match open_result {
                Ok(_) => (
                    PlayResult {
                        success: true,
                        player: "browser".to_string(),
                        error: None,
                    },
                    id,
                ),
                Err(_) => (
                    PlayResult {
                        success: false,
                        player: String::new(),
                        error: Some(e.to_string()),
                    },
                    id,
                ),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── player_args tests ────────────────────────────────────

    #[test]
    fn test_player_args_mpv() {
        let args = player_args("mpv");
        assert!(args.contains(&"--force-window=immediate"));
        assert!(args.contains(&"--keep-open=no"));
    }

    #[test]
    fn test_player_args_iina() {
        let args = player_args("iina");
        assert!(args.contains(&"--no-stdin"));
    }

    #[test]
    fn test_player_args_vlc() {
        let args = player_args("vlc");
        assert!(args.contains(&"--no-video-title-show"));
    }

    #[test]
    fn test_player_args_unknown() {
        let args = player_args("unknown_player");
        assert!(args.is_empty());
    }

    // ── extract_video_id tests ───────────────────────────────

    #[test]
    fn test_extract_video_id_watch_url() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_video_id_short_url() {
        assert_eq!(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_video_id_embed_url() {
        assert_eq!(
            extract_video_id("https://youtube.com/embed/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_video_id_with_params() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_video_id_invalid() {
        assert_eq!(extract_video_id("https://example.com"), None);
        assert_eq!(extract_video_id("not a url"), None);
        assert_eq!(extract_video_id(""), None);
    }

    // ── SUPPORTED_PLAYERS ────────────────────────────────────

    #[test]
    fn test_supported_players_list() {
        assert!(SUPPORTED_PLAYERS.contains(&"mpv"));
        assert!(SUPPORTED_PLAYERS.contains(&"iina"));
        assert!(SUPPORTED_PLAYERS.contains(&"vlc"));
    }

    // ── Resolution format arg tests ─────────────────────────

    fn build_cmd_args(player: &str, max_resolution: &str) -> Vec<String> {
        let args = player_args(player);
        let mut cmd_args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

        if max_resolution == "1080" {
            match player {
                "mpv" => {
                    cmd_args.push("--ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string());
                }
                "iina" => {
                    cmd_args.push("--mpv-ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string());
                }
                _ => {}
            }
        }
        cmd_args
    }

    #[test]
    fn test_resolution_1080_mpv() {
        let args = build_cmd_args("mpv", "1080");
        assert!(args.iter().any(|a| a.starts_with("--ytdl-format=")));
    }

    #[test]
    fn test_resolution_max_mpv() {
        let args = build_cmd_args("mpv", "max");
        assert!(!args.iter().any(|a| a.starts_with("--ytdl-format=")));
    }

    #[test]
    fn test_resolution_1080_iina() {
        let args = build_cmd_args("iina", "1080");
        assert!(args.iter().any(|a| a.starts_with("--mpv-ytdl-format=")));
    }

    #[test]
    fn test_resolution_max_iina() {
        let args = build_cmd_args("iina", "max");
        assert!(!args.iter().any(|a| a.starts_with("--mpv-ytdl-format=")));
    }

    #[test]
    fn test_resolution_1080_vlc_no_format_arg() {
        let args = build_cmd_args("vlc", "1080");
        assert!(!args.iter().any(|a| a.contains("ytdl-format")));
    }
}
