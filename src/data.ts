import type { Indicator, ManifestItem, SentimentReport } from "./types";

export async function fetchManifest(): Promise<ManifestItem[]> {
  const response = await fetch("/data/index.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`无法读取 data/index.json (${response.status})`);
  return (await response.json()) as ManifestItem[];
}

export async function fetchReport(file: string): Promise<SentimentReport> {
  const safeFile = file.split("/").pop() ?? "";
  if (!safeFile.endsWith(".json")) throw new Error("报告文件名无效");

  const response = await fetch(`/data/${encodeURIComponent(safeFile)}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`无法读取 ${safeFile} (${response.status})`);
  return normalizeReport((await response.json()) as SentimentReport);
}

export function indicator(report: SentimentReport, key: string): Indicator {
  return report.indicators?.[key] ?? {};
}

export function normalizeReport(report: SentimentReport): SentimentReport {
  if (report.indicators) {
    return {
      ...report,
      generated_at: report.generated_at ?? inferGeneratedAt(report),
      time_slot: report.time_slot ?? inferTimeSlot(report)
    };
  }

  const sentiment = report.sentiment_indicators ?? {};
  const marketSummary = report.market_summary ?? {};
  const fearGreed = sentiment.fear_greed_index ?? {};
  const altindex = sentiment.altindex ?? {};
  const vix = sentiment.vix ?? {};
  const pcr = sentiment.pcr ?? {};
  const aaii = sentiment.aaii ?? {};
  const naaim = sentiment.naaim ?? {};
  const contrarian = sentiment.contrarian_signals ?? {};
  const analysis = report.contrarian_analysis;
  const generatedAt = report.generated_at ?? inferGeneratedAt(report);
  const fearGreedValue = firstNumber(fearGreed.current, fearGreed.current_estimate, altindex.current);
  const aaiiSpread = firstNumber(aaii.spread, aaii.bull_bear_spread, numberValue(aaii.bullish_pct) !== null && numberValue(aaii.bearish_pct) !== null ? numberValue(aaii.bullish_pct)! - numberValue(aaii.bearish_pct)! : null);

  return {
    ...report,
    generated_at: generatedAt,
    time_slot: report.time_slot ?? inferTimeSlot({ ...report, generated_at: generatedAt }),
    strategy: report.strategy ?? "别人恐惧我贪婪，别人贪婪我恐惧",
    data_sources: report.data_sources ?? collectSources(sentiment),
    indicators: {
      cnn_fear_greed: {
        name: "恐惧贪婪指数",
        current: fearGreedValue ?? undefined,
        category: firstString(fearGreed.zone, fearGreed.category, fearGreed.current_estimate, altindex.zone),
        signal: firstString(fearGreed.detail, fearGreed.trend, altindex.detail),
        strength: firstString(fearGreed.status, "中等")
      },
      altindex: {
        name: "AltIndex另类情绪指数",
        current: numberValue(altindex.current) ?? undefined,
        category: firstString(altindex.zone, altindex.category),
        signal: firstString(altindex.detail, altindex.trend),
        strength: "中等"
      },
      vix: {
        name: "VIX波动率指数",
        current: numberValue(vix.current) ?? undefined,
        signal: firstString(vix.status, vix.trend, vix.detail),
        strength: firstString(vix.status)
      },
      pcr: {
        name: "Put/Call Ratio",
        current: numberValue(pcr.current) ?? undefined,
        signal: firstString(pcr.status, pcr.detail, pcr.trend),
        strength: firstString(pcr.status)
      },
      aaii: {
        name: "AAII散户情绪",
        last_update: firstString(aaii.last_update, aaii.date),
        bullish_pct: numberValue(aaii.bullish_pct) ?? undefined,
        neutral_pct: numberValue(aaii.neutral_pct) ?? undefined,
        bearish_pct: numberValue(aaii.bearish_pct) ?? undefined,
        spread: aaiiSpread ?? undefined,
        signal: firstString(aaii.detail, aaii.trend),
        strength: "中等"
      },
      naaim: {
        name: "NAAIM经理仓位",
        last_update: firstString(naaim.last_update, naaim.date),
        avg_exposure: firstNumber(naaim.avg_exposure, naaim.current) ?? undefined,
        signal: firstString(naaim.detail, naaim.trend),
        strength: "中性"
      },
      smart_dumb_money: {
        name: "行为资金情绪",
        dumb: firstString(sentiment.feargreedtracker?.detail, fearGreed.current_estimate, "未提供"),
        smart: firstString(naaim.trend, "未知"),
        signal: firstString(analysis?.summary, fearGreed.detail),
        strength: "中等"
      },
      major_indices: normalizeMarketSummary(marketSummary),
      contrarian_signals: {
        name: "ContrarianSignals聚类分析",
        allocation_pct: numberValue(contrarian.allocation_pct) ?? undefined,
        signal: firstString(contrarian.detail, contrarian.trend),
        strength: "中性"
      },
      nyse_ad: {
        name: "NYSE涨跌线",
        signal: firstString(sentiment.nyse_ad?.detail, sentiment.nyse_ad?.trend),
        strength: firstString(sentiment.nyse_ad?.status)
      },
      margin_debt: {
        name: "融资保证金债务",
        current_billion: numberValue(sentiment.margin_debt?.current_usd_billion) ?? undefined,
        signal: firstString(sentiment.margin_debt?.detail, sentiment.margin_debt?.trend),
        strength: "中性"
      },
      hyg_oas: {
        name: "高收益债利差",
        oas_bps: numberValue(sentiment.hy_spread?.spread_bps_estimate) ?? undefined,
        signal: firstString(sentiment.hy_spread?.detail, sentiment.hy_spread?.trend),
        strength: "警示"
      }
    },
    contradictions: report.contradictions ?? analysis?.key_signals,
    strategy_conclusion: report.strategy_conclusion ?? {
      verdict: inferVerdict(analysis?.strategy_note ?? analysis?.summary ?? ""),
      is_extreme_fear: false,
      is_extreme_greed: false,
      buy_triggers: analysis?.key_signals,
      key_contradiction: [analysis?.summary, analysis?.strategy_note].filter(Boolean).join(" ")
    }
  };
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const range = value.match(/(-?\d+(?:\.\d+)?)\s*[-~]\s*(-?\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function valueAt<T = unknown>(source: unknown, path: string): T | undefined {
  const parts = path.split(".");
  let current = source;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current as T | undefined;
}

export function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = numberValue(value);
    if (num !== null) return num;
  }
  return null;
}

export function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

export function formatNumber(value: unknown, digits = 2, fallback = "-"): string {
  const num = numberValue(value);
  if (num === null) return fallback;
  return Number.isInteger(num) ? String(num) : num.toFixed(digits).replace(/\.?0+$/, "");
}

export function normalizeReportTitle(item: ManifestItem): string {
  const slot = item.timeSlot === "morning" ? "早盘" : item.timeSlot === "evening" ? "晚盘" : "";
  return `${item.reportDate}${slot ? ` ${slot}` : ""}`;
}

function normalizeMarketSummary(summary: Record<string, Indicator>): Indicator {
  const result: Indicator = { name: "主要指数概览" };
  for (const symbol of ["SPY", "QQQ", "DIA", "IWM"]) {
    const value = summary[symbol] ?? summary[symbol.toLowerCase()];
    if (value) result[symbol.toLowerCase()] = value;
  }
  return result;
}

function collectSources(indicators: Record<string, Indicator>): string[] {
  return Array.from(
    new Set(
      Object.values(indicators)
        .map((item) => stringValue(item.source))
        .filter(Boolean)
    )
  );
}

function inferGeneratedAt(report: SentimentReport): string | undefined {
  if (!report.report_date) return report.data_timestamp;
  const time = stringValue(report.report_time);
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) return report.data_timestamp ?? `${report.report_date}T00:00:00+08:00`;
  return `${report.report_date}T${match[1].padStart(2, "0")}:${match[2]}:00+08:00`;
}

function inferTimeSlot(report: SentimentReport): string {
  if (report.time_slot) return report.time_slot;
  if (!report.generated_at) return "";
  const hour = new Date(report.generated_at).getHours();
  if (Number.isNaN(hour)) return "";
  return hour < 12 ? "morning" : "evening";
}

function inferVerdict(text: string): string {
  if (/买入|反弹|恐惧/.test(text)) return "逆向买入观察";
  if (/卖出|过热|极端贪婪/.test(text)) return "控制风险";
  if (/观望|等待/.test(text)) return "等待极端信号";
  return "待判断";
}
