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
