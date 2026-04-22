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
  return (await response.json()) as SentimentReport;
}

export function indicator(report: SentimentReport, key: string): Indicator {
  return report.indicators?.[key] ?? {};
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
