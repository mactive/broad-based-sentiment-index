export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ManifestItem = {
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

export type Indicator = Record<string, unknown> & {
  name?: string;
  signal?: string;
  strength?: string;
  current?: number;
  category?: string;
  last_update?: string;
};

export type StrategyConclusion = {
  verdict?: string;
  is_extreme_fear?: boolean;
  is_extreme_greed?: boolean;
  buy_triggers?: string[];
  sell_triggers?: string[];
  key_contradiction?: string;
  professional_system_cross_check?: Record<string, string>;
};

export type SentimentReport = {
  report_date?: string;
  time_slot?: string;
  strategy?: string;
  generated_at?: string;
  data_sources?: string[];
  note?: string;
  indicators?: Record<string, Indicator>;
  contradictions?: string[];
  strategy_conclusion?: StrategyConclusion;
};
