# UI Redesign — Design Spec
Date: 2026-03-27

## Goal
Redesign FeedingTube's web UI to feel modern and minimal while keeping the dark theme, sidebar+header layout, and all existing functionality intact. Add a thumbnail toggle to display small inline YouTube thumbnails in the video list.

## Scope
Single file: `static/index.html` (CSS + HTML structure adjustments, no backend changes).

---

## Color System

Rename existing variables (find-replace all usages across the file):
- `--light-gray` → `--text` (value: `#dddde8`)
- `--gray` → `--muted` (value: `#6b6b80`)

Update values of existing variables:

| Variable | Old value | New value |
|----------|-----------|-----------|
| `--bg` | `#12121c` | `#0c0c14` |
| `--card` | `#1e1e28` | `#13131d` |
| `--highlight` | `#373750` | `#22223a` |
| `--accent` | `#b4b4ff` | `#9d9dff` |

Add new variable:
- `--border: #1c1c2e` — used for all dividers/separators (border-bottom on rows, sidebar border, header border). Existing `var(--highlight)` usages that serve as dividers/borders get migrated to `var(--border)`; usages that serve as hover/active fill backgrounds stay as `var(--highlight)`. The hardcoded `rgba(55, 55, 80, 0.4)` on the video table row `border-bottom` (line 327) is replaced with `1px solid var(--border)`.

Also update `<meta name="theme-color" content="#12121c">` → `content="#0c0c14"`.

All other colors (cyan, yellow, green, red) unchanged.

---

## Sidebar

- Remove `border-right: 1px solid var(--highlight)`. Background contrast (`--card` vs `--bg`) provides visual separation.
- Channel item vertical padding: `8px 12px` → `10px 14px`
- Active channel state: `background: var(--highlight); border-left: 3px solid var(--accent); padding-left: 9px` → `background: rgba(34, 34, 58, 0.5); border-left: 2px solid var(--accent); padding-left: 10px`
- Channel badge: `font-size: 11px`, padding `1px 6px` → `font-size: 10px`, padding `1px 5px`
- Sidebar footer: `font-size: 11px`, single muted line
- Sidebar header title: `font-size: 15px`, `font-weight: 600`

---

## Header

- Background: `var(--card)` → `var(--bg)` (header blends into page)
- `border-bottom`: keep but use `var(--border)` color
- `.btn-icon`: already has `background: none`. Add explicit `color: var(--muted)` to default state.
- `.btn-icon:hover`: set `background: none; color: var(--text)` (override existing hover background)
- `.btn-icon.active` (shorts/resolution/thumbnails on-state): `color: var(--accent); background: none`
- Search input border: `var(--highlight)` → `var(--border)`

---

## Video List

- Hide table `<thead>` on desktop too: add `thead { display: none; }` globally (not just mobile)
- Desktop cell padding: `8px 10px` → `7px 10px`
- Title font-weight: `400` → `500`
- Date / duration / views column text: `color: var(--muted); font-size: 12px`
- Watched rows: opacity `0.4` → `0.3`
- Row hover: `background: var(--highlight)` (current actual value in code is `background: var(--card)` — set it to `background: var(--highlight)` which is now `#22223a`, a visible but subtle highlight)
- Row `border-bottom`: replace hardcoded `rgba(55, 55, 80, 0.4)` with `1px solid var(--border)`

---

## Thumbnails Feature

**Toggle button:** Add to header action row between resolution and refresh buttons. Icon: `🖼` (or a simple grid symbol `⊞`). Uses same `.btn-icon` class. When thumbnails on: add class `active` (accent color). Label: `<span class="btn-label">Thumbs</span>`.

**State:** `localStorage` key `ft_show_thumbnails`. Read on app init; when toggled, update localStorage, update button active class, and re-call `renderContent()` to rebuild the table.

**Thumbnail column:** When `ft_show_thumbnails` is true, `renderContent()` inserts a `<td class="col-thumb">` as the first data column (before the watch button):

```html
<td class="col-thumb">
  <img src="https://i.ytimg.com/vi/VIDEO_ID/mqdefault.jpg"
       class="video-thumb" loading="lazy" alt="">
</td>
```

**CSS:**
```css
.video-thumb {
  width: 80px;
  height: 45px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
  background: var(--highlight);
}
.col-thumb { width: 92px; padding: 4px 6px 4px 0; vertical-align: middle; }
```

**Shorts thumbnails:** YouTube's `mqdefault.jpg` for Shorts returns a 9:16 crop. With `object-fit: cover` this shows only the center strip, which is acceptable. No special handling needed.

**Mobile:** `.col-thumb { display: none; }` at `max-width: 480px`.

---

## Modals

- `border-radius`: `8px` → `12px`
- `.modal-overlay`: add `backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px)` (degrades gracefully on unsupported browsers)

---

## Non-Goals
- No layout structure changes (sidebar + header stays)
- No font family changes
- No JS logic changes beyond thumbnail toggle state management
- No backend / API changes
- No refactoring of component architecture

---

## Verification
1. Desktop: header background matches page background, sidebar has no visible border, rows are compact with subtle borders
2. iPhone PWA: safe-area header fix intact, no top clipping
3. Thumbnail toggle on: small images appear in video rows, lazy loaded, hidden on narrow mobile
4. Thumbnail toggle off: images disappear, layout reverts cleanly
5. All existing functionality (swipe, keyboard nav, modals, auth, refresh) works unchanged
6. `--text` and `--muted` renames covered everywhere (no remaining `--light-gray` or `--gray` references)
