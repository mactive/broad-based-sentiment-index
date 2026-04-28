# FlyPath 美股市场情绪追踪

FlyPath 是一个面向中文用户的美股情绪观察产品，用更直观的方式，把分散的市场情绪指标整理成一份可读、可追踪、可复盘的日度参考。

线上地址：<https://broad-sentiment-index.mactive.workers.dev/>

## 产品定位

很多情绪指标本身并不难找，难的是：

- 信息分散，缺少统一视角
- 指标更新频率不同，阅读成本高
- 很难快速判断当前更接近“恐惧”还是“过热”
- 缺少连续时间线，不方便做前后对比

FlyPath 想解决的就是这个问题。它把多类情绪信号聚合到一个页面里，帮助用户更快形成对市场风险偏好和逆向机会的整体判断。

## 适合谁

- 关注美股市场节奏的中文投资者
- 希望跟踪恐惧贪婪变化的交易者
- 需要做情绪复盘和策略观察的研究型用户
- 未来可能订阅会员版、获取更多增值内容的用户

## 当前能力

- 汇总每日市场情绪报告
- 展示 Fear & Greed 及相关衍生指标
- 用时间线查看历史报告变化
- 提炼策略结论、关注点和触发条件
- 支持 Google 登录，为后续会员体系做准备

## 后续方向

- 会员订阅与付费权益
- 更细的用户分层和内容权限
- 更强的策略解释与信号对比
- 更完整的历史回测与趋势分析

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。项目会自动扫描 `data/*.json`，并生成前端可直接消费的报告目录。

## Supabase 登录配置

项目已接入 Supabase Browser SDK，用于 Google 登录和后续会员体系扩展。

环境变量示例见 `.env.example`：

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxx
```

注意：

- 前端只使用 `publishable key`
- 不要把 `service_role` 放进前端环境变量
- Google 登录需要同时在 Supabase 和 Google Cloud Console 完成配置

## 数据更新方式

后续只要把新的报告 JSON 放进根目录 `data/`，重新构建后页面就会自动更新报告列表和详情内容。
