# Changelog

All notable changes to this project. Versions follow [SemVer](https://semver.org/).

## [1.0.0] — 2026-09-22

First public release.

### Added
- **Agent** button: copies an instruction an AI agent can follow (`curl` the image, then read it). Settings can make every upload copy it.
- Links expire on the server (`TTL_DAYS`, default 7): checked on every read and cleaned up by an hourly cron. No R2 lifecycle rule needed.
- **Delete** a link instantly, with a two-click confirmation.
- One-click **Deploy to Cloudflare** for the server.
- English and Spanish UI. Keyboard shortcut (<kbd>⌘</kbd><kbd>⇧</kbd><kbd>Y</kbd> / <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Y</kbd>).
- Settings test the connection and the token on save, and explain what failed.
- Server errors come as codes (`unauthorized`, `too_large`…) and are shown translated.
- Test suite: Worker contract, extension logic, translations, and end-to-end tests of the real extension against `wrangler dev`.

### Changed
- No host permissions: the extension works with any server address.
- The server address is cleaned up when pasted from a chat (trailing comma, backticks, `/up`, missing `https://`).
- Brand design with bundled fonts: the extension makes no third-party requests.

### Fixed
- Dragging the floating thumbnail from macOS <kbd>⌘</kbd><kbd>⇧</kbd><kbd>4</kbd> failed with "Failed to fetch": the file was read after macOS had deleted it.
- If the message catalog is not loaded (files updated without reloading an unpacked extension), the UI falls back to English instead of showing raw keys.

## [0.1.0] — 2026-09-22

Private first version: side panel, upload to R2 through a Worker, links that expire.
