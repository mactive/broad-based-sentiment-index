import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const dataDir = path.resolve(process.cwd(), "data");

type RawReport = {
  report_date?: string;
  time_slot?: string;
  generated_at?: string;
  strategy?: string;
  note?: string;
  indicators?: Record<string, unknown>;
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function inferTimeSlot(report: RawReport): string {
  if (report.time_slot) return report.time_slot;
  if (!report.generated_at) return "";
  const hour = new Date(report.generated_at).getHours();
  if (Number.isNaN(hour)) return "";
  return hour < 12 ? "morning" : "evening";
}

function buildManifestItem(file: string, report: RawReport): ManifestItem {
  const indicators = asRecord(report.indicators);
  const fearGreed = asRecord(indicators.cnn_fear_greed);
  const generatedAt = report.generated_at ?? `${report.report_date ?? ""}T00:00:00+08:00`;

  return {
    file,
    reportDate: report.report_date ?? file.replace(/^market_sentiment_/, "").replace(/\.json$/, ""),
    generatedAt,
    timeSlot: inferTimeSlot(report),
    fearGreed: asNumber(fearGreed.current),
    fearGreedCategory: asString(fearGreed.category),
    verdict: report.strategy_conclusion?.verdict ?? "",
    note: report.note ?? "",
    strategy: report.strategy ?? ""
  };
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
