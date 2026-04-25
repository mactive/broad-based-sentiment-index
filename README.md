# 美股市场情绪追踪

这是一个基于 `data/*.json` 自动生成页面的 TypeScript 静态网站。后续只要把新的报告 JSON 放进根目录 `data/`，本地构建或 Cloudflare Pages 构建时会自动扫描并生成新的报告列表。

项目现在已经接入 Supabase Browser SDK，并预留了 Google 登录与会员档位展示入口。未配置 Supabase 时，页面仍可匿名访问。

## 本地运行

```bash
npm install
npm run dev
```

## Supabase 配置

1. 复制 `.env.example` 为 `.env.local`。
2. 填写以下环境变量：

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxx
```

注意：

- 前端只使用 `publishable key`。不要把 `service_role` 放进 `VITE_` 环境变量。
- 代码里兼容了旧的 `VITE_SUPABASE_ANON_KEY`，但新项目建议直接使用 `VITE_SUPABASE_PUBLISHABLE_KEY`。

## Google 登录配置

根据 Supabase 官方文档，这个纯前端 Vite 项目可以直接使用 `@supabase/supabase-js` 的 `signInWithOAuth({ provider: 'google' })` 完成浏览器端登录。

需要同时完成以下配置：

1. Supabase Dashboard
   在 `Authentication -> Providers -> Google` 中开启 Google Provider，并填入 Google Client ID / Client Secret。
2. Supabase URL Configuration
   在 `Authentication -> URL Configuration` 中加入：
   - 本地开发地址，例如 `http://localhost:5173`
   - 线上站点地址
   - 如果需要保留具体路径或查询参数，确保对应 URL 在 allow list 中
3. Google Cloud Console
   - `Authorized JavaScript origins` 添加你的站点域名和本地开发域名
   - `Authorized redirect URIs` 添加 Supabase 提供的 callback URL
   - 本地开发时，Supabase 官方文档示例 callback 为 `http://127.0.0.1:54321/auth/v1/callback`

## 会员收费的后续接法

当前页面会优先读取 `app_metadata.plan`、`app_metadata.membership_tier`、`app_metadata.subscription_status` 来显示会员状态，便于后续扩展。

建议后续这样做：

1. 支付完成后由服务端 webhook 更新 Supabase 用户的 `app_metadata`，或写入独立订阅表。
2. 真正的权限控制放在数据库 RLS / 服务端校验，不只依赖前端展示。
3. 前端继续把 `app_metadata` 作为展示层信号，比如“免费版 / Pro 会员 / 试用中”。

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
