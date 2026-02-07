# A terminal UI for watching YouTube

- Add and manage subscriptions
- Search and watch any video
- Fast parallel priming with retry logic
- SQLite storage for performance

## Requirements

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [mpv](https://mpv.io/) (or iina/vlc)
- Node.js 18+

![screenshot](src/images/screenshot.png)

## Setup

```bash
pnpm install
just setup    # or: pnpm build && pnpm link --global
```

## Usage

```bash
youtube-cli              # launch TUI
youtube-cli -v           # view all videos
youtube-cli -c 1         # view channel 1
youtube-cli --add <url>  # add channel
youtube-cli --prime      # fetch full history for all channels
youtube-cli --list       # list subscriptions
```

## Storage

Data stored in `~/.config/youtube-cli/youtube-cli.db` (SQLite via sql.js)

## Development

```bash
pnpm test     # run tests
pnpm build    # build dist/cli.js
```
