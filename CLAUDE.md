# Deploy Notes

This repo now supports two deployment shapes:

1. Single-server:
- React/Vite frontend built into `dist/`
- Express serves both static app and API

2. EdgeOne frontend + self-hosted API:
- Frontend built by Vite and uploaded to `EdgeOne Pages`
- Express stays on your own server for API, uploads, and data

## Current Production Notes

- Backend server: Tencent Cloud Lighthouse
- App path: `/home/ubuntu/app`
- Data path: `/home/ubuntu/app-data`
- PM2 process: `building-board`
- Public site currently points to the server directly

## Environment Variables

- `BUILDING_CODE`
- `DATA_DIR`
- `API_PUBLIC_BASE_URL`
  - required when frontend and backend are on different origins
  - example: `https://api.loulihuanwu.site`
- `CORS_ALLOWED_ORIGINS`
  - comma-separated allowlist for frontend origins
  - example: `https://loulihuanwu.site,https://www.loulihuanwu.site`

## EdgeOne Split Setup

- Frontend:
  - set `VITE_API_BASE_URL=https://api.your-domain.com`
  - upload `dist/` to `EdgeOne Pages`
- Backend:
  - keep Express on the server
  - set `API_PUBLIC_BASE_URL=https://api.your-domain.com`
  - set `CORS_ALLOWED_ORIGINS` to the frontend domain(s)

## Uploads and Persistence

- Structured data: `$DATA_DIR/app-state.json`
- Uploads: `$DATA_DIR/uploads`
- Temp uploads: `$DATA_DIR/tmp-uploads`

If migrating from the old layout, copy legacy uploads once before deploy:

```bash
mkdir -p /home/ubuntu/app-data/uploads
cp -Rn /home/ubuntu/app/public/uploads/. /home/ubuntu/app-data/uploads/ 2>/dev/null || true
```
