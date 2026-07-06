# Screenshots to capture (1280×800)

Chrome Web Store shows these front-and-center. Capture on a real, populated library so it looks alive — not empty. Aim for 3–5.

1. **The library, full.** Waterfall grid with a healthy mix of image clips, a couple of text cards, and the sidebar showing several projects + tags. This is the hero shot.

2. **The save bubble in action.** On a real webpage, right-click → clip an image, and capture the neutral save bubble (project dropdown, tags, note, Save/Discard) before saving. Shows the core capture flow.

3. **Search / filter.** Type a query or activate a tag + project filter so the grid narrows — shows organization paying off.

4. **Lightbox.** An image opened in the lightbox with the prev/next arrows and the source link visible.

5. **Edit modal (optional).** The edit panel with the tag chip editor open — shows tagging/organizing.

## Tips
- Use light mode for the store (brighter, reads better as a thumbnail).
- Populate with non-sensitive, visually appealing clips (design references, photos) — avoid personal/private content in public screenshots.
- Keep the browser chrome minimal or crop to the extension UI.
- Export the final images at exactly 1280×800.

# Pre-submission checklist

- [ ] Bump `manifest.json` version from 0.1.0 to a release version (e.g. 1.0.0).
- [ ] `npm run build`, then load `dist/` unpacked and smoke-test every flow (clip image/text/link/page, keyboard shortcut, save/discard, search, delete+undo, delete project+undo, export/import, lightbox arrows).
- [ ] Verify on a fresh page and on a page opened before install (on-demand injection).
- [ ] Confirm restricted pages (chrome://, Web Store) fail silently.
- [ ] Zip the **contents** of `dist/` (manifest at the zip root, not inside a folder).
- [ ] Host `store/PRIVACY.md` at a public URL; paste into dashboard.
- [ ] Fill single purpose + permission justifications from `store/PERMISSIONS.md`.
- [ ] Upload screenshots + icon.
- [ ] Pay the one-time $5 developer registration (if not already done).
- [ ] Submit for review (typically 1–3 days).

# After Chrome: low-cost expansion

- **Edge Add-ons:** same MV3 package, near-zero changes. Reuse the zip.
- **Firefox:** requires manifest tweaks (`background.scripts`, `browser_specific_settings`) — medium effort, do post-1.0.
