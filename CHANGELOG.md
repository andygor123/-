# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-03-31

### Added
- Initial Shenzhen-focused WeChat H5 building exchange board with Available, Wanted, and History flows.
- Mobile-first posting, interest, claim, and completion flows for in-building furniture and item exchange.
- `邻居问问` lane with homepage preview, dedicated feed, nested replies, and mobile-first discussion UI.
- Express backend APIs for resident entry, lightweight profiles, posts, interests, claims, uploads, and ask threads.
- Local upload handling with persistent `DATA_DIR` support and deployment notes for preserving uploads.
- Playwright mobile E2E coverage for exchange and `邻居问问` main flows.

### Changed
- Contact action now falls back to copying WeChat ID inside WeChat webview instead of relying on deep-link redirect.
- Claim/detail feedback upgraded with stronger inline status banners and mobile toast feedback.
- Upload storage path now lives under `DATA_DIR/uploads` instead of the app directory.

### Fixed
- Upload endpoint now validates issued upload tokens before accepting files.
- Deployment docs now include the required migration step for old local uploads.
- Archive success feedback remains visible after closing the detail sheet via a global toast.
