import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const dataDir = path.resolve(process.cwd(), "data");

type RawReport = {
  report_date?: string;
  report_time?: string;
  time_slot?: string;
  generated_at?: string;
  data_timestamp?: string;
  strategy?: string;
  note?: string;
  indicators?: Record<string, unknown>;
  sentiment_indicators?: Record<string, unknown>;
  contrarian_analysis?: {
    summary?: string;
    key_signals?: string[];
    strategy_note?: string;
  };
  strategy_conclusion?: {
    verdict?: string;
    is_extreme_fear?: boolean;
    is_extreme_greed?: boolean;
  };
};

type ManifestItem = {
  file: string;
  reportDate: string;
  generatedAt: string;
  timeSlot: string;
  fearGreed: number | null;
  fearGreedCategory: string;
  verdict: string;
  note: string;
  strategy: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const range = value.match(/(-?\d+(?:\.\d+)?)\s*[-~]\s*(-?\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function inferTimeSlot(report: RawReport): string {
  if (report.time_slot) return report.time_slot;
  const generatedAt = inferGeneratedAt(report);
  if (!generatedAt) return "";
  const hour = new Date(generatedAt).getHours();
  if (Number.isNaN(hour)) return "";
  return hour < 12 ? "morning" : "evening";
}

function buildManifestItem(file: string, report: RawReport): ManifestItem {
  const indicators = asRecord(report.indicators);
  const sentiment = asRecord(report.sentiment_indicators);
  const fearGreed = asRecord(indicators.cnn_fear_greed);
  const altindex = asRecord(indicators.altindex);
  const newFearGreed = asRecord(sentiment.fear_greed_index);
  const newAltindex = asRecord(sentiment.altindex);
  const generatedAt = inferGeneratedAt(report) ?? `${report.report_date ?? ""}T00:00:00+08:00`;
  const analysis = report.contrarian_analysis;

  return {
    file,
    reportDate: report.report_date ?? file.replace(/^market_sentiment_/, "").replace(/\.json$/, ""),
    generatedAt,
    timeSlot: inferTimeSlot(report),
    fearGreed: firstNumber(fearGreed.current, newFearGreed.current, newFearGreed.current_estimate, altindex.current, newAltindex.current),
    fearGreedCategory: asString(fearGreed.category, asString(newFearGreed.category, asString(newFearGreed.current_estimate, asString(newAltindex.zone)))),
    verdict: report.strategy_conclusion?.verdict ?? inferVerdict(analysis?.strategy_note ?? analysis?.summary ?? ""),
    note: report.note ?? "",
    strategy: report.strategy ?? "别人恐惧我贪婪，别人贪婪我恐惧"
  };
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = asNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function inferGeneratedAt(report: RawReport): string | undefined {
  if (report.generated_at) return report.generated_at;
  if (!report.report_date) return report.data_timestamp;
  const match = report.report_time?.match(/(\d{1,2}):(\d{2})/);
  if (!match) return report.data_timestamp ?? `${report.report_date}T00:00:00+08:00`;
  return `${report.report_date}T${match[1].padStart(2, "0")}:${match[2]}:00+08:00`;
}

function inferVerdict(text: string): string {
  if (/买入|反弹|恐惧/.test(text)) return "逆向买入观察";
  if (/卖出|过热|极端贪婪/.test(text)) return "控制风险";
  if (/观望|等待/.test(text)) return "等待极端信号";
  return "";
}

async function scanManifest(): Promise<ManifestItem[]> {
  if (!existsSync(dataDir)) return [];

  const entries = await readdir(dataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);

  const items = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(dataDir, file), "utf8");
      return buildManifestItem(file, JSON.parse(raw) as RawReport);
    })
  );

  return items.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

function sendJson(res: ServerResponse, value: unknown): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value, null, 2));
}

function sentimentDataPlugin(): Plugin {
  return {
    name: "sentiment-data",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, "http://localhost") : null;
        if (!url?.pathname.startsWith("/data/")) {
          next();
          return;
        }

        if (url.pathname === "/data/index.json") {
          try {
            sendJson(res, await scanManifest());
          } catch (error) {
            next(error);
          }
          return;
        }

        const file = path.basename(decodeURIComponent(url.pathname));
        if (!file.endsWith(".json")) {
          next();
          return;
        }

        const fullPath = path.join(dataDir, file);
        if (!fullPath.startsWith(dataDir) || !existsSync(fullPath)) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        createReadStream(fullPath).pipe(res);
      });
    },
    async generateBundle() {
      const manifest = await scanManifest();
      this.emitFile({
        type: "asset",
        fileName: "data/index.json",
        source: JSON.stringify(manifest, null, 2)
      });

      await Promise.all(
        manifest.map(async (item) => {
          const source = await readFile(path.join(dataDir, item.file));
          this.emitFile({
            type: "asset",
            fileName: `data/${item.file}`,
            source
          });
        })
      );
    }
  };
}

export default defineConfig({
  plugins: [sentimentDataPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
