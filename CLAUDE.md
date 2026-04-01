# Deploy Notes

This repo now supports two deployment shapes:

1. Single-server:
- React/Vite frontend built into `dist/`
- Express serves both static app and API

2. EdgeOne frontend + self-hosted API:
- Frontend built by Vite and uploaded to `EdgeOne Pages`
- Express stays on your own server for API, uploads, and data

## Current Production Notes

- Production server: Tencent Cloud Hong Kong server
- Server IP: `43.129.208.41`
- App path: `/root/app`
- Data path: `/root/app-data`
- PM2 process: `building-board`
- Reverse proxy: `openresty`
- Public site:
  - `https://loulihuanwu.site`
  - `https://www.loulihuanwu.site`

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

## Deploy Configuration

- Platform: `custom/manual`
- Production URL: `https://loulihuanwu.site`
- Health check URL: `https://loulihuanwu.site/health`
- Production host: `root@43.129.208.41`
- App path: `/root/app`
- Data path: `/root/app-data`
- Process manager: `pm2`
- Process name: `building-board`
- Reverse proxy: `openresty`

### Pre-deploy checks

Run locally before deploying:

```bash
npm test
npm run build
```

### Manual deploy flow

From the repo root:

```bash
tar --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.context' -czf /tmp/las-vegas-deploy.tgz .
scp /tmp/las-vegas-deploy.tgz root@43.129.208.41:/root/
ssh root@43.129.208.41 'rm -rf /root/app && mkdir -p /root/app && tar -xzf /root/las-vegas-deploy.tgz -C /root/app && cd /root/app && npm install && npm run build && pm2 restart building-board && pm2 save'
```

### Post-deploy verification

Check:

```bash
curl -sf https://loulihuanwu.site/health
```

Notes:

- Right after `pm2 restart building-board`, there can be a brief `502` while the app process comes back up.
- Wait a few seconds, then re-run the health check.
