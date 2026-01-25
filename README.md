# ytsub

TUI for browsing YouTube subscriptions via `yt-dlp` + `mpv`.

## Requirements

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [mpv](https://mpv.io/) (or iina/vlc)

## Install

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
ytsub              # launch TUI
ytsub --add <url>  # add channel
ytsub --list       # list subscriptions
```

## Keys

| Key | Action |
|-----|--------|
| `j/k` | navigate |
| `Enter` | play |
| `a` | add channel |
| `d` | delete |
| `v` | all videos |
| `b` | back |
| `q` | quit |

Config: `~/.config/ytsub/`
