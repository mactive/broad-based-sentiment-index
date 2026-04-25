import type { User } from "@supabase/supabase-js";
import {
  fetchManifest,
  fetchReport,
  firstNumber,
  firstString,
  formatNumber,
  indicator,
  normalizeReportTitle,
  valueAt
} from "./data";
import { getSupabaseClient, getSupabaseSetup } from "./supabase";
import type { Indicator, ManifestItem, SentimentReport } from "./types";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
const supabase = getSupabaseClient();
const supabaseSetup = getSupabaseSetup();

type AppState = {
  manifest: ManifestItem[];
  selectedFile: string;
  report: SentimentReport | null;
  auth: AuthState;
  authBusy: AuthBusyState;
  authMessage: string | null;
};

type AuthState = {
  enabled: boolean;
  user: User | null;
  statusLabel: string;
  statusTone: "ready" | "pending" | "muted";
  membershipLabel: string;
  membershipHint: string;
  setupHint: string | null;
  error: string | null;
};

type AuthBusyState = "google" | "signout" | null;

const slotLabel: Record<string, string> = {
  morning: "早盘",
  evening: "晚盘"
};

let currentState: AppState | null = null;
let authBusy: AuthBusyState = null;
let authMessage: string | null = null;
let authState = buildAuthState(null, null);
let authListenerBound = false;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function reportTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function classifySentiment(value: number | null): { label: string; tone: string } {
  if (value === null) return { label: "未知", tone: "neutral" };
  if (value <= 24) return { label: "极度恐惧", tone: "fear" };
  if (value <= 44) return { label: "恐惧", tone: "fear" };
  if (value <= 55) return { label: "中性", tone: "neutral" };
  if (value <= 74) return { label: "贪婪", tone: "greed" };
  return { label: "极度贪婪", tone: "danger" };
}

function signalTone(text?: string): string {
  const value = text ?? "";
  if (/(恐惧|买入|低估|回落)/.test(value)) return "buy";
  if (/(贪婪|乐观|警示|追高|极端)/.test(value)) return "warn";
  if (/(卖出|风险|危险|过热)/.test(value)) return "sell";
  return "neutral";
}

function getFearGreed(report: SentimentReport): number | null {
  return firstNumber(indicator(report, "cnn_fear_greed").current, indicator(report, "feargreed_tracker").current_fear_greed);
}

function getAaiiSpread(report: SentimentReport): number | null {
  const aaii = indicator(report, "aaii");
  return firstNumber(aaii.spread, aaii.bull_bear_spread);
}

function getNaaim(report: SentimentReport): number | null {
  return firstNumber(indicator(report, "naaim").avg_exposure);
}

function getDumbMoney(report: SentimentReport): string {
  const data = indicator(report, "smart_dumb_money");
  return firstString(data.dumb, data.dumb_money_confidence);
}

function normalizeConfidence(value: string): string {
  const map: Record<string, string> = {
    extremely_optimistic: "极度乐观",
    optimistic: "乐观",
    neutral: "中性",
    pessimistic: "悲观",
    extremely_pessimistic: "极度悲观"
  };
  return map[value] ?? value;
}

function getMajorIndexRows(report: SentimentReport): string {
  const major = indicator(report, "major_indices");
  const symbols = ["spy", "qqq", "dia", "iwm"];

  return symbols
    .map((symbol) => {
      const raw = major[symbol];
      const price = typeof raw === "object" && raw !== null ? valueAt(raw, "price") : raw;
      const change = typeof raw === "object" && raw !== null ? valueAt(raw, "change_pct") : major[`${symbol}_change`];
      return `
        <tr>
          <td>${symbol.toUpperCase()}</td>
          <td>${formatNumber(price)}</td>
          <td class="${numberValueForClass(change)}">${formatSigned(change)}</td>
        </tr>
      `;
    })
    .join("");
}

function numberValueForClass(value: unknown): string {
  const numeric = firstNumber(value);
  if (numeric === null) return "muted";
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "muted";
}

function formatSigned(value: unknown): string {
  const numeric = firstNumber(value);
  if (numeric === null) return "-";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatNumber(numeric)}%`;
}

function metricCard(label: string, value: string, sub: string, tone = "neutral"): string {
  return `
    <article class="metric-card metric-${tone}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-sub">${escapeHtml(sub)}</div>
    </article>
  `;
}

function buildAuthState(user: User | null, error: string | null): AuthState {
  if (!supabase) {
    return {
      enabled: false,
      user: null,
      statusLabel: "未配置",
      statusTone: "muted",
      membershipLabel: "基础版",
      membershipHint: "先完成 Supabase 配置，再接会员档位与付费权益。",
      setupHint: supabaseSetup.missingEnv.length
        ? `缺少环境变量: ${supabaseSetup.missingEnv.join(", ")}`
        : "Supabase 尚未配置。",
      error
    };
  }

  const membership = resolveMembership(user);

  return {
    enabled: true,
    user,
    statusLabel: user ? "已登录" : "未登录",
    statusTone: user ? "ready" : "pending",
    membershipLabel: membership.label,
    membershipHint: membership.hint,
    setupHint: null,
    error
  };
}

function resolveMembership(user: User | null): { label: string; hint: string } {
  if (!user) {
    return {
      label: "游客",
      hint: "登录后可用 app_metadata.plan / subscription_status 承接会员能力。"
    };
  }

  const plan = firstString(user.app_metadata?.plan, user.app_metadata?.membership_tier, user.app_metadata?.subscription_tier);
  const status = firstString(user.app_metadata?.subscription_status, user.app_metadata?.billing_status);

  if (!plan) {
    return {
      label: "免费版",
      hint: "后续可把付费状态写入 app_metadata，再由前端展示与路由守卫消费。"
    };
  }

  return {
    label: normalizePlanLabel(plan),
    hint: status ? `订阅状态: ${normalizeStatusLabel(status)}` : "会员档位来自 Supabase app_metadata。"
  };
}

function normalizePlanLabel(value: string): string {
  const map: Record<string, string> = {
    free: "免费版",
    pro: "Pro 会员",
    plus: "Plus 会员",
    premium: "Premium 会员",
    vip: "VIP 会员",
    enterprise: "企业版"
  };

  return map[value.toLowerCase()] ?? value;
}

function normalizeStatusLabel(value: string): string {
  const map: Record<string, string> = {
    active: "有效",
    trialing: "试用中",
    past_due: "待续费",
    canceled: "已取消",
    unpaid: "未支付",
    incomplete: "未完成"
  };

  return map[value.toLowerCase()] ?? value;
}

function formatUserName(user: User | null): string {
  if (!user) return "游客";
  return firstString(user.user_metadata?.full_name, user.user_metadata?.name, user.email?.split("@")[0], "Google 用户");
}

function formatUserEmail(user: User | null): string {
  return firstString(user?.email, "尚未读取邮箱");
}

function userInitial(user: User | null): string {
  const value = formatUserName(user).trim();
  return value.slice(0, 1).toUpperCase() || "G";
}

function renderAuthPanel(auth: AuthState, busy: AuthBusyState, message: string | null): string {
  const actionBusy = busy === "google" ? "正在跳转..." : "Google 登录";
  const signOutBusy = busy === "signout" ? "退出中..." : "退出登录";

  if (!auth.enabled) {
    return `
      <section class="auth-card">
        <div class="auth-head">
          <div>
            <p class="eyebrow">Access</p>
            <h3>登录与会员</h3>
          </div>
          <span class="status-chip status-muted">${escapeHtml(auth.statusLabel)}</span>
        </div>
        <p class="auth-copy">页面可以继续匿名访问，但 Google 登录和会员状态还未启用。</p>
        <div class="membership-strip">
          <strong>${escapeHtml(auth.membershipLabel)}</strong>
          <span>${escapeHtml(auth.membershipHint)}</span>
        </div>
        <div class="auth-config">
          <strong>需要配置</strong>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          <small>${escapeHtml(auth.setupHint || "请补齐 Supabase 环境变量。")}</small>
        </div>
      </section>
    `;
  }

  return `
    <section class="auth-card">
      <div class="auth-head">
        <div>
          <p class="eyebrow">Access</p>
          <h3>登录与会员</h3>
        </div>
        <span class="status-chip status-${auth.statusTone}">${escapeHtml(auth.statusLabel)}</span>
      </div>
      <p class="auth-copy">Google 登录已接好，可继续把订阅与会员权益挂到 Supabase Auth 与数据库策略上。</p>

      ${
        auth.user
          ? `
            <div class="auth-identity">
              <div class="auth-avatar">${escapeHtml(userInitial(auth.user))}</div>
              <div class="auth-meta">
                <strong>${escapeHtml(formatUserName(auth.user))}</strong>
                <span>${escapeHtml(formatUserEmail(auth.user))}</span>
              </div>
            </div>
          `
          : `
            <div class="auth-identity auth-guest">
              <div class="auth-avatar">G</div>
              <div class="auth-meta">
                <strong>Google 账号登录</strong>
                <span>登录后可识别用户身份，并为付费会员体系做准备。</span>
              </div>
            </div>
          `
      }

      <div class="membership-strip">
        <strong>${escapeHtml(auth.membershipLabel)}</strong>
        <span>${escapeHtml(auth.membershipHint)}</span>
      </div>

      <div class="auth-actions">
        ${
          auth.user
            ? `<button class="auth-button auth-button-secondary" type="button" data-auth-action="signout"${busy ? " disabled" : ""}>${escapeHtml(signOutBusy)}</button>`
            : `<button class="auth-button" type="button" data-auth-action="google"${busy ? " disabled" : ""}>${escapeHtml(actionBusy)}</button>`
        }
      </div>

      ${auth.error ? `<p class="auth-note auth-note-error">${escapeHtml(auth.error)}</p>` : ""}
      ${message ? `<p class="auth-note">${escapeHtml(message)}</p>` : ""}
    </section>
  `;
}

function indicatorRows(report: SentimentReport): string {
  const rows: Array<[string, string, string, string]> = [
    ["AAII Spread", formatNumber(getAaiiSpread(report)), firstString(indicator(report, "aaii").signal), firstString(indicator(report, "aaii").strength)],
    ["NAAIM", formatNumber(getNaaim(report)), firstString(indicator(report, "naaim").signal), firstString(indicator(report, "naaim").strength)],
    ["Dumb Money", normalizeConfidence(getDumbMoney(report)), firstString(indicator(report, "smart_dumb_money").signal), firstString(indicator(report, "smart_dumb_money").strength)],
    ["CNN F&G", formatNumber(getFearGreed(report), 0), firstString(indicator(report, "cnn_fear_greed").signal), firstString(indicator(report, "cnn_fear_greed").strength)],
    ["VIX", formatNumber(indicator(report, "vix").current), firstString(indicator(report, "vix").signal), firstString(indicator(report, "vix").strength)],
    ["PCR", formatNumber(indicator(report, "pcr").current), firstString(indicator(report, "pcr").signal), firstString(indicator(report, "pcr").strength)],
    ["AltIndex", formatNumber(indicator(report, "altindex").current, 0), firstString(indicator(report, "altindex").signal), firstString(indicator(report, "altindex").strength)],
    ["ContrarianSignals", `${formatNumber(firstNumber(indicator(report, "contrarian_signals").allocation_pct, indicator(report, "contrarian_signals").recommended_allocation_pct))}%`, firstString(indicator(report, "contrarian_signals").signal), firstString(indicator(report, "contrarian_signals").strength)]
  ];

  return rows
    .filter((row) => row.some((cell, index) => index === 0 || (cell && cell !== "-" && cell !== "-%")))
    .map(([name, value, signal, strength]) => {
      const tone = signalTone(signal);
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(value || "-")}</td>
          <td class="sig-${tone}">${escapeHtml(signal || "-")}</td>
          <td>${escapeHtml(strength || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTimeline(manifest: ManifestItem[], selectedFile: string): string {
  return manifest
    .map((item, index) => {
      const fg = item.fearGreed;
      const classified = classifySentiment(fg);
      const marker = fg === null ? 50 : Math.max(0, Math.min(100, fg));
      const selected = item.file === selectedFile ? "is-selected" : "";
      return `
        <button class="report-item ${selected}" data-report="${escapeHtml(item.file)}" type="button">
          <span class="report-date">
            <strong>${escapeHtml(item.reportDate.slice(5) || item.reportDate)}</strong>
            <small>${escapeHtml(reportTime(item.generatedAt))} ${escapeHtml(slotLabel[item.timeSlot] ?? item.timeSlot)}${index === 0 ? " · 最新" : ""}</small>
          </span>
          <span class="mini-gauge" aria-hidden="true">
            <i style="left:${marker}%"></i>
          </span>
          <span class="report-tags">
            <span class="tag tag-${classified.tone}">${escapeHtml(item.fearGreedCategory || classified.label)}</span>
            <span class="tag tag-neutral">${escapeHtml(item.verdict || "待判断")}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderSparkline(manifest: ManifestItem[]): string {
  const values = manifest
    .slice()
    .reverse()
    .map((item) => item.fearGreed)
    .filter((value): value is number => typeof value === "number");

  if (values.length < 2) return `<div class="empty-chart">至少需要两份报告显示趋势</div>`;

  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(100, value));
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg class="trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Fear and Greed 趋势">
      <line x1="0" y1="25" x2="100" y2="25"></line>
      <line x1="0" y1="50" x2="100" y2="50"></line>
      <line x1="0" y1="75" x2="100" y2="75"></line>
      <polyline points="${points}"></polyline>
    </svg>
  `;
}

function renderReport(report: SentimentReport, manifestItem: ManifestItem | undefined, manifest: ManifestItem[]): string {
  const fearGreed = getFearGreed(report);
  const classified = classifySentiment(fearGreed);
  const fgMarker = fearGreed === null ? 50 : Math.max(0, Math.min(100, fearGreed));
  const alt = indicator(report, "altindex");
  const vix = indicator(report, "vix");
  const contrarian = indicator(report, "contrarian_signals");
  const conclusion = report.strategy_conclusion ?? {};
  const contradictions = report.contradictions ?? (conclusion.key_contradiction ? [conclusion.key_contradiction] : []);
  const title = manifestItem ? normalizeReportTitle(manifestItem) : report.report_date ?? "报告";

  return `
    <main class="detail">
      <header class="detail-head">
        <div>
          <p class="eyebrow">${escapeHtml(title)} · 北京时间 ${escapeHtml(formatDateTime(report.generated_at))}</p>
          <h1>美股市场情绪追踪</h1>
          <p class="strategy">策略: ${escapeHtml(report.strategy || manifestItem?.strategy || "别人恐惧我贪婪，别人贪婪我恐惧")}</p>
        </div>
        <div class="verdict-pill">${escapeHtml(conclusion.verdict || manifestItem?.verdict || "待判断")}</div>
      </header>

      ${report.note ? `<div class="note">${escapeHtml(report.note)}</div>` : ""}

      <section class="gauge-section">
        <div class="section-kicker">CNN 恐惧贪婪指数</div>
        <div class="gauge-bar">
          <span class="zone zone-fear">恐惧</span>
          <span class="zone zone-neutral">中性</span>
          <span class="zone zone-greed">贪婪</span>
          <i style="left:${fgMarker}%"></i>
        </div>
        <div class="gauge-value">
          <strong>${escapeHtml(formatNumber(fearGreed, 0))}</strong>
          <span>${escapeHtml(indicator(report, "cnn_fear_greed").category ?? classified.label)} · ${escapeHtml(firstString(indicator(report, "cnn_fear_greed").signal, classified.label))}</span>
        </div>
      </section>

      <section class="metrics-grid">
        ${metricCard("AltIndex", formatNumber(alt.current, 0), `${firstString(alt.category, "-")} · ${firstString(alt.signal, "另类数据")}`, "greed")}
        ${metricCard("VIX", formatNumber(vix.current), firstString(vix.signal, "波动率"), "neutral")}
        ${metricCard("ContrarianSignals", `${formatNumber(firstNumber(contrarian.allocation_pct, contrarian.recommended_allocation_pct))}%`, firstString(contrarian.signal, "配置建议"), "buy")}
      </section>

      <section class="triad">
        <div class="section-kicker">逆向信号三角</div>
        <div class="triad-grid">
          ${metricCard("AAII 散户情绪", `${formatNumber(getAaiiSpread(report))}%`, `${firstString(indicator(report, "aaii").signal, "调查情绪")} · ${firstString(indicator(report, "aaii").last_update, "待更新")}`, "buy")}
          ${metricCard("NAAIM 经理仓位", formatNumber(getNaaim(report)), `${firstString(indicator(report, "naaim").signal, "基金经理仓位")} · ${firstString(indicator(report, "naaim").last_update, "待更新")}`, "warn")}
          ${metricCard("Dumb Money", normalizeConfidence(getDumbMoney(report)), `Smart Money: ${normalizeConfidence(firstString(indicator(report, "smart_dumb_money").smart, indicator(report, "smart_dumb_money").smart_money_confidence, "未知"))}`, "sell")}
        </div>
      </section>

      <section class="matrix-section">
        <div class="section-kicker">核心指标矩阵</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>指标</th><th>数值</th><th>信号</th><th>强度</th></tr>
            </thead>
            <tbody>${indicatorRows(report)}</tbody>
          </table>
        </div>
      </section>

      <section class="split-section">
        <div>
          <div class="section-kicker">主要指数</div>
          <div class="table-wrap compact">
            <table>
              <thead><tr><th>标的</th><th>价格</th><th>涨跌</th></tr></thead>
              <tbody>${getMajorIndexRows(report)}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="section-kicker">F&G 趋势</div>
          ${renderSparkline(manifest)}
        </div>
      </section>

      <section class="analysis-band">
        <div>
          <div class="section-kicker">今日关注点</div>
          <ul class="analysis-list">
            ${contradictions.length ? contradictions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : `<li>本报告未提供矛盾项，关注核心指标是否进入极端区间。</li>`}
          </ul>
        </div>
        <div>
          <div class="section-kicker">策略结论</div>
          <p class="verdict-text">${escapeHtml(conclusion.verdict || "待判断")}</p>
          <p class="conclusion-text">${escapeHtml(conclusion.key_contradiction || firstString(indicator(report, "cnn_fear_greed").signal, "等待下一份数据确认。"))}</p>
          ${renderTriggers("买入触发", conclusion.buy_triggers)}
          ${renderTriggers("卖出触发", conclusion.sell_triggers)}
        </div>
      </section>

      <footer class="detail-footer">
        <span>数据来源: ${escapeHtml((report.data_sources ?? []).join(", ") || "未列出")}</span>
        <button class="share-button" type="button" data-share>复制链接</button>
      </footer>
    </main>
  `;
}

function renderTriggers(label: string, triggers?: string[]): string {
  if (!triggers?.length) return "";
  return `
    <div class="trigger-group">
      <strong>${escapeHtml(label)}</strong>
      <span>${triggers.map(escapeHtml).join(" | ")}</span>
    </div>
  `;
}

function renderApp(state: AppState): void {
  if (!app) return;
  currentState = state;
  const latest = state.manifest[0];
  const current = state.manifest.find((item) => item.file === state.selectedFile) ?? latest;
  const fg = current?.fearGreed ?? null;
  const classified = classifySentiment(fg);

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-block">
          <p class="eyebrow">Market Sentiment</p>
          <h2>美股市场情绪追踪</h2>
          <p>${escapeHtml(current?.strategy || "别人恐惧我贪婪，别人贪婪我恐惧")}</p>
        </div>

        ${renderAuthPanel(state.auth, state.authBusy, state.authMessage)}

        <div class="stats-grid">
          <div><strong>${state.manifest.length}</strong><span>历史报告</span></div>
          <div><strong>${escapeHtml(formatNumber(fg, 0))}</strong><span>最新 F&G</span></div>
          <div><strong class="tone-${classified.tone}">${escapeHtml(current?.verdict || "待判断")}</strong><span>当前策略</span></div>
        </div>

        <div class="history-head">
          <span>历史报告</span>
          <small>data/*.json</small>
        </div>
        <div class="timeline">${renderTimeline(state.manifest, state.selectedFile)}</div>
      </aside>

      ${state.report ? renderReport(state.report, current, state.manifest) : renderLoading()}
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-report]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = button.dataset.report;
      if (file) void selectReport(file, state.manifest);
    });
  });

  app.querySelector<HTMLButtonElement>("[data-share]")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(window.location.href);
    const button = app.querySelector<HTMLButtonElement>("[data-share]");
    if (button) {
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = "复制链接";
      }, 1200);
    }
  });

  app.querySelector<HTMLButtonElement>("[data-auth-action='google']")?.addEventListener("click", () => {
    void handleGoogleSignIn();
  });

  app.querySelector<HTMLButtonElement>("[data-auth-action='signout']")?.addEventListener("click", () => {
    void handleSignOut();
  });
}

function renderLoading(): string {
  return `
    <main class="detail">
      <div class="loading">正在读取报告...</div>
    </main>
  `;
}

function renderError(message: string): void {
  if (!app) return;
  app.innerHTML = `
    <div class="error-state">
      <h1>数据读取失败</h1>
      <p>${escapeHtml(message)}</p>
      <p>请确认根目录 data/ 中存在 JSON 文件，并重新运行构建。</p>
    </div>
  `;
}

async function selectReport(file: string, manifest: ManifestItem[], pushHistory = true): Promise<void> {
  if (pushHistory) {
    const params = new URLSearchParams(window.location.search);
    params.set("report", file);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  const shellState: AppState = { manifest, selectedFile: file, report: null, auth: authState, authBusy, authMessage };
  renderApp(shellState);
  const report = await fetchReport(file);
  renderApp({ ...shellState, report });
}

function rerenderAuthState(error: string | null = null): void {
  authState = buildAuthState(authState.user, error);
  if (!currentState) return;
  renderApp({ ...currentState, auth: authState, authBusy, authMessage });
}

async function loadAuthState(): Promise<void> {
  if (!supabase) {
    authState = buildAuthState(null, null);
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  authState = buildAuthState(data.session?.user ?? null, error?.message ?? null);
}

function bindAuthListener(): void {
  if (!supabase || authListenerBound) return;

  supabase.auth.onAuthStateChange((event, session) => {
    authBusy = null;
    authState = buildAuthState(session?.user ?? null, null);

    if (event === "SIGNED_IN") authMessage = "Google 账号已连接。";
    if (event === "SIGNED_OUT") authMessage = "已退出登录。";

    if (currentState) {
      renderApp({ ...currentState, auth: authState, authBusy, authMessage });
    }
  });

  authListenerBound = true;
}

async function handleGoogleSignIn(): Promise<void> {
  if (!supabase) return;
  authBusy = "google";
  authMessage = "正在跳转到 Google 登录...";
  rerenderAuthState();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: supabaseSetup.redirectTo
    }
  });

  if (error) {
    authBusy = null;
    authMessage = null;
    rerenderAuthState(error.message);
  }
}

async function handleSignOut(): Promise<void> {
  if (!supabase) return;
  authBusy = "signout";
  authMessage = null;
  rerenderAuthState();

  const { error } = await supabase.auth.signOut();
  if (error) {
    authBusy = null;
    rerenderAuthState(error.message);
  }
}

async function boot(): Promise<void> {
  await loadAuthState();
  bindAuthListener();

  const manifest = await fetchManifest();
  if (!manifest.length) {
    renderError("没有找到任何报告 JSON。");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("report");
  const selectedFile = manifest.some((item) => item.file === requested) ? requested! : manifest[0].file;
  await selectReport(selectedFile, manifest, false);
}

window.addEventListener("popstate", () => {
  if (!currentState) {
    void boot();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("report");
  const selectedFile = currentState.manifest.some((item) => item.file === requested) ? requested! : currentState.manifest[0].file;
  void selectReport(selectedFile, currentState.manifest, false);
});

void boot().catch((error: unknown) => {
  renderError(error instanceof Error ? error.message : String(error));
});
