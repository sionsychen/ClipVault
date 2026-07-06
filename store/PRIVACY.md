# ClipVault Privacy Policy

_Last updated: 2026-07-06_

ClipVault is a browser extension for collecting images and text into a personal, local library.

## What data ClipVault stores

When you clip an image, text selection, link, or page, ClipVault stores the following **on your own device only**:

- The clipped content (image thumbnail and, when possible, the full image; selected text; link/page URL).
- Page metadata: the source page title and URL.
- Labels you add: project name, tags, and notes.
- A timestamp of when the clip was created.

All of this is saved in your browser's local storage (IndexedDB) via the `storage` and `unlimitedStorage` permissions.

## What ClipVault does NOT do

- **No servers.** ClipVault has no backend. Your clips never leave your device unless you explicitly export them.
- **No tracking or analytics.** ClipVault does not collect usage data, telemetry, or any identifiers.
- **No accounts.** There is no sign-in and no cloud sync.
- **No selling or sharing.** Because nothing is transmitted, no data is ever sold or shared with third parties.
- **No ads.**

## Network access

ClipVault only makes network requests to fetch the original bytes of an image you chose to clip (so the full-resolution image can be stored locally). It does not send your data anywhere.

## Permissions

See `PERMISSIONS.md` for a plain-language explanation of each permission ClipVault requests and why.

## Your data, your control

- **Export:** Use "Export" (JSON) or "Markdown" in the library to save a copy anywhere you like.
- **Import:** Restore from a JSON backup at any time.
- **Delete:** Delete individual clips, whole projects, or tags from the library. Uninstalling the extension removes all locally stored clips.

## Contact

For questions about this policy or the extension, open an issue on the project's repository.
