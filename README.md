# youtube-cli

A terminal UI for managing YouTube subscriptions and watching videos, built with Rust and [ratatui](https://ratatui.rs/).

- Add and manage channel subscriptions
- Browse videos per channel or across all channels
- Search YouTube globally
- Track watched/unwatched state per video
- New video indicators per channel
- Video duration and view count metadata
- Fast parallel priming with retry logic
- Paginated "all videos" view
- SQLite storage with automatic migration

## Quick Install

```bash
curl -fsSL https://git.bechsor.no/jens/youtube-cli/raw/branch/main/install | bash
```

## Requirements

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [mpv](https://mpv.io/) (or iina/vlc)

![screenshot](src/images/screenshot.png)

## Install

```bash
cargo install --path .
```

Or use the justfile:

```bash
just build       # release binary for current arch
just release-all # cross-compile for all targets
```

## Usage

```bash
youtube-cli              # launch TUI
youtube-cli -c 1         # open channel 1 directly
youtube-cli --add <url>  # add channel from CLI
youtube-cli --prime      # fetch full history for all channels
youtube-cli --prime <n>  # prime channel by index or name
youtube-cli --list       # list subscriptions
```

### Keybindings

#### Channel list

| Key | Action |
|-----|--------|
| `Enter` | Open channel |
| `a` | Add channel |
| `d` | Delete channel |
| `w` | Mark channel as watched |
| `v` | View all videos |
| `g` | Global search |
| `/` | Filter channels |
| `s` | Toggle shorts visibility |
| `r` | Refresh (check for new videos) |
| `p` | Prime all channels |
| `m` | Mark all channels as read |
| `q` | Quit |

#### Video list

| Key | Action |
|-----|--------|
| `Enter` | Play video |
| `i` | Show video info/description |
| `w` | Toggle watched |
| `m` | Mark all as watched |
| `/` | Filter videos |
| `s` | Toggle shorts visibility |
| `n`/`p` | Next/previous page (all-videos view) |
| `r` | Refresh |
| `b` | Back to channels |
| `q` | Quit |

#### Search results

| Key | Action |
|-----|--------|
| `Enter` | Play video |
| `i` | Show video info |
| `a` | Subscribe to channel |
| `g` | New search |
| `b` | Back |
| `q` | Quit |

## Storage

Data stored in `~/.youtube-cli/data.db` (SQLite via rusqlite).

Migrates automatically from the legacy `~/.config/youtube-cli/` JSON format on first run.

## Development

```bash
cargo test        # run tests
cargo run         # run in debug mode
just lint         # format and lint
```
