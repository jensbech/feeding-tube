# FeedingTube

A terminal UI for managing YouTube subscriptions and watching videos, built with Rust and [ratatui](https://ratatui.rs/).

![screenshot](src/images/screenshot.png)

## Requirements

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [mpv](https://mpv.io/) (or iina/vlc)

## Install

```bash
cargo install --path .
```

## Usage

```bash
feeding-tube              # launch TUI
feeding-tube -c 1         # open channel 1 directly
feeding-tube --add <url>  # add channel from CLI
feeding-tube --prime      # fetch full history for all channels
feeding-tube --list       # list subscriptions
```

Press `?` in the TUI for keybindings.

## Storage

Data stored in `~/.feeding-tube/data.db` (SQLite).
