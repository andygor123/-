# 楼里换物板

一个面向单栋楼住户的简中 H5 MVP，重点服务中国大陆微信内使用场景。

## 开发

```bash
npm install
npm run dev:all
```

## 当前范围

- 楼栋邀请码进入
- 轻量住户资料
- 闲置 / 求物 / 完成记录
- 全局发布入口
- 本地数据模拟

## 部署备注

- 生产环境请设置 `DATA_DIR`，结构化数据和上传图片都会走这个目录。
- 如果前端改由 `EdgeOne Pages` 托管、后端保留在自有 server，请额外设置：
  - `VITE_API_BASE_URL=https://api.your-domain.com`
  - `API_PUBLIC_BASE_URL=https://api.your-domain.com`
  - `CORS_ALLOWED_ORIGINS=https://app.your-domain.com,https://www.your-domain.com`
- 当前推荐：
  - 数据文件：`$DATA_DIR/app-state.json`
  - 上传图片：`$DATA_DIR/uploads`
  - 临时上传：`$DATA_DIR/tmp-uploads`
- 首次从旧版本切到 `DATA_DIR/uploads` 前，先迁移旧图：

```bash
mkdir -p /home/ubuntu/app-data/uploads
cp -Rn /home/ubuntu/app/public/uploads/. /home/ubuntu/app-data/uploads/ 2>/dev/null || true
```

- 之后再 deploy 新版本，避免旧贴文里的 `/uploads/...` 图片 404。

### EdgeOne + 自有 Server

- 前端：
  - `npm run build`
  - 把 `dist/` 上传到 `EdgeOne Pages`
- 后端：
  - 继续跑在自有 server
  - 独立子域名建议用 `api.xxx.com`
- 原因：
  - 前端静态资源交给 EdgeOne
  - API、上传、数据仍然留在你自己的 server
- 注意：
  - 前端不能放任何 secret
  - `/uploads/...` 这类用户图片必须由后端返回绝对 URL
  - CORS 只允许前端域名，不要开 `*`
