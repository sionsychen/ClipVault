# ClipVault

Low-friction clipping for images and text. Right-click anything worth keeping — an image, a passage, a link, a whole page — and it drops into a private library that lives entirely on your own device. Auto-tag it, sort it into projects, search it back, export it anytime.

No account. No cloud. No tracking. No servers.

## Features

- **Clip anything** — images (thumbnail + full image when reachable), text selections, links, whole pages. Videos and tweets are recognized and handled sensibly.
- **A draft before you commit** — clipping opens a small save bubble to set project, tags, and a note. Nothing is stored until you hit **Save**; close it and the clip is discarded.
- **Organize without effort** — auto-suggested tags, projects, notes, and fast search across titles, text, tags, and notes.
- **Waterfall gallery** — a clean masonry grid so image clips read at a glance; click to open a lightbox and page through with `←` / `→`.
- **Undo everywhere** — deleting clips, projects, or tags is reversible via a toast, not a scary confirm dialog.
- **Your data, your control** — export a full JSON backup or a readable Markdown list; import to restore. A reminder nudges you to back up, and a warning appears as local storage fills.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+C` | Clip the current text selection (falls back to the whole page) |
| `Alt+Shift+L` | Open the ClipVault library |

Right-click also exposes **Clip this image / selection / link / page** context-menu items. Shortcuts can be rebound at `chrome://extensions/shortcuts`.

## Install (unpacked, for development)

```bash
npm install
npm run build      # bundles to dist/
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

The toolbar icon opens the library; right-click any page to start clipping.

## Development

```bash
npm run build       # build to dist/ (esbuild)
npm test            # run the vitest suite
npm run test:watch  # watch mode
```

- `src/background/` — service worker: context menus, keyboard commands, on-demand injection, capture handling
- `src/content/` — content script: builds the clip, renders the save bubble (injected on demand, never persistent)
- `src/core/` — pure logic: clip keys, media-type detection, tag inference, search, thumbnails
- `src/db/` — IndexedDB store
- `src/library/` — the library page (HTML/CSS/JS)
- `store/` — Chrome Web Store submission material (not shipped in the extension)

## Permissions

ClipVault requests a deliberately minimal set. It does **not** use broad `<all_urls>` host access or a persistent content script — it only touches a page at the moment you clip, via the temporary `activeTab` permission.

| Permission | Why |
|------------|-----|
| `contextMenus` | The right-click "Clip this…" menu items |
| `activeTab` | Temporary access to the current tab only when you invoke ClipVault |
| `scripting` | Injects the capture script into the active tab on demand |
| `storage`, `unlimitedStorage` | Stores clips locally; lets the library grow past the default quota |

See [`store/PRIVACY.md`](store/PRIVACY.md) and [`store/PERMISSIONS.md`](store/PERMISSIONS.md) for full detail.

## Privacy

Everything is stored locally in your browser (IndexedDB). Nothing is ever uploaded — ClipVault has no backend. The only network request it makes is to fetch the original bytes of an image you chose to clip, so it can be saved locally. See [`store/PRIVACY.md`](store/PRIVACY.md).

## License

Not yet specified.
