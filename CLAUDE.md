# Deploy Notes

This repo is a single-service web app:
- React/Vite frontend built into `dist/`
- Express server serving API + static app
- File-backed data store persisted via `DATA_DIR`

## Deploy Configuration (configured by /setup-deploy)
- Platform: Fly.io
- Production URL: https://andygor123-las-vegas.fly.dev
- Deploy workflow: manual `fly deploy --remote-only`
- Deploy status command: `fly status --app andygor123-las-vegas`
- Merge method: squash
- Project type: web app
- Post-deploy health check: https://andygor123-las-vegas.fly.dev/health

### Custom deploy hooks
- Pre-merge: `npm test && npm run build && npm run test:e2e`
- Deploy trigger: `fly deploy --remote-only`
- Deploy status: `fly status --app andygor123-las-vegas`
- Health check: `curl -fsS https://andygor123-las-vegas.fly.dev/health`

## Infra Notes

- The app uses a file-backed store. In production it must write to a persistent volume.
- `fly.toml` mounts a Fly volume at `/data`.
- Before first deploy, create the volume:

```bash
fly volumes create app_data --app andygor123-las-vegas --region hkg --size 1
```

- Before first deploy, set the building code secret:

```bash
fly secrets set BUILDING_CODE=SZHOME --app andygor123-las-vegas
```

- If the final Fly app name changes, update `fly.toml` and this deploy section together.
