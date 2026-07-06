# ClipVault — Permission Justifications

Chrome Web Store requires a justification for each permission. Paste these into the "Privacy practices" tab of the developer dashboard. ClipVault deliberately requests a **minimal** permission set — it does **not** use broad host permissions (`<all_urls>`) or a persistent content script.

| Permission | Why ClipVault needs it |
|------------|------------------------|
| `contextMenus` | Adds the right-click "Clip this image / selection / link / page" menu items — the primary way users capture content. |
| `activeTab` | Grants temporary access to the current tab **only at the moment the user invokes ClipVault** (right-click menu or keyboard shortcut). Used to read the selected text / target and show the save bubble. Access ends when the user leaves the page. This replaces the far broader `<all_urls>` host permission. |
| `scripting` | Injects the small content script into the active tab on demand (paired with `activeTab`) to capture the clip and render the save bubble. The script is only injected when the user acts — never persistently on every page. |
| `storage`, `unlimitedStorage` | Stores clips, projects, tags, notes, and image data locally in the browser. `unlimitedStorage` lets the local library grow beyond the default 5 MB quota, since image clips can be large. No data leaves the device. |

## Single purpose (for the store listing)

> ClipVault's single purpose is to let a user collect images and text from web pages into a personal, locally-stored library that they can tag, organize into projects, search, and export.

## Remote code

ClipVault does **not** load or execute any remote code. All scripts are bundled in the extension package.

## Data usage disclosures (dashboard checkboxes)

- Does the extension collect or use **personally identifiable information**? **No.**
- **Health information?** No.
- **Financial / payment information?** No.
- **Authentication information?** No.
- **Personal communications?** No.
- **Location?** No.
- **Web history?** ClipVault stores only the pages/content the user explicitly clips — locally, never transmitted. Disclose as: stored locally, not sold, not transferred, not used for anything beyond the extension's single purpose.
- **User activity / website content?** Only the content the user explicitly clips, stored locally.

Certify all three required statements:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.
