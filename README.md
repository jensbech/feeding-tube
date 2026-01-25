# ytsub

Terminal UI for browsing YouTube subscriptions. Fast pagination, new video indicators, shorts filtering.

## Requirements

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [mpv](https://mpv.io/) (or iina/vlc)
- Node.js 18+

## Setup

```bash
pnpm install
just setup    # or: pnpm build && pnpm link --global
```

## Usage

```bash
ytsub              # launch TUI
ytsub -v           # view all videos
ytsub -c 1         # view channel 1
ytsub --add <url>  # add channel
ytsub --prime      # fetch full history for all channels
ytsub --list       # list subscriptions
```

## Navigation

| Key | Action |
|-----|--------|
| `j/k` or arrows | move |
| `Enter` | play video / browse channel |
| `a` | add subscription |
| `d` | delete subscription |
| `v` | view all videos |
| `n/p` | next/previous page |
| `s` | toggle shorts |
| `/` | filter/search |
| `r` | refresh |
| `b/Esc` | back |
| `q` | quit |

## Features

- **Fast pagination**: ~0.1ms per page (in-memory sorted index cache)
- **Bulk RSS fetch**: 31 channels in ~200ms
- **New video indicators**: Green dot on landing page for channels with unwatched videos (clears when you view that channel)
- **Shorts filtering**: Toggle with `s`
- **Video history**: Track watched videos, persistent history
- **Priming**: Fetch full channel history with `--prime`

## Storage

`~/.config/ytsub/`
- `subscriptions.json` - channels + settings
- `videos.json` - video cache
- `watched.json` - watched video IDs
