# 美股市场情绪追踪

这是一个基于 `data/*.json` 自动生成页面的 TypeScript 静态网站。后续只要把新的报告 JSON 放进根目录 `data/`，本地构建或 Cloudflare Pages 构建时会自动扫描并生成新的报告列表。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物会输出到 `dist/`。Vite 插件会把根目录 `data/*.json` 复制到 `dist/data/`，并生成 `dist/data/index.json` 作为前端报告目录。

## Cloudflare Pages

推荐使用 Cloudflare Pages 连接 GitHub 仓库：

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 留空或仓库根目录

之后每天只需要提交新的 `data/*.json` 到 GitHub，Cloudflare Pages 会重新构建并发布最新报告。
