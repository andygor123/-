# TODOS

## P1

### Deployment
- [ ] Add domain and HTTPS for the Tencent Cloud UAT server.
- [ ] Update the deployment flow to migrate old uploads into `DATA_DIR/uploads` before first deploy of the new storage path.

### Product
- [ ] Deploy the latest `邻居问问` implementation to UAT after push.
- [ ] Dogfood `邻居问问` on real mobile devices inside WeChat and collect feedback on nested replies.

## P2

### Reliability
- [ ] Add image size limits and clearer upload failure messaging for low-bandwidth mobile usage.
- [ ] Add backup automation for `app-data` and local uploads on the UAT server.

### UX
- [ ] Polish `邻居问问` thread detail further if real users find 3-level replies too dense on phone.

## Completed

### Exchange Board
- [x] Build Shenzhen-focused WeChat H5 exchange board with Available, Wanted, and History.
- [x] Add mobile-first detail interactions for interest, claim, and archive flows.
- [x] Add WeChat-friendly contact fallback by copying WeChat ID inside webview.

### 邻居问问
- [x] Add homepage preview, dedicated feed, thread detail, nested replies, and mobile polish.
- [x] Add backend APIs and E2E coverage for the main `邻居问问` flow.

### Infra
- [x] Deploy UAT to Tencent Cloud with Nginx and PM2.
- [x] Move upload storage path under `DATA_DIR/uploads` in code.
