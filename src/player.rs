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
