export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type AffectedSector =
  | "energy"
  | "defense"
  | "tech"
  | "commodities"
  | "finance"
  | "consumer"
  | "industrials";

export type Region =
  | "Middle East"
  | "East Asia"
  | "Eastern Europe"
  | "South Asia"
  | "Africa"
  | "Americas"
  | "Western Europe"
  | "Southeast Asia"
  | "Oceania"
  | "Global";

export interface StockData {
  sym: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[];
  sector: string;
  currency?: string;
}

export interface GeoEvent {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  region: Region | string;
  lat: number;
  lon: number;
  affected_sectors: AffectedSector[] | string[];
  publishedAt: string;
  source: string;
  url?: string;
}

export interface RiskScore {
  region: Region | string;
  score: number;
  trend: "up" | "down" | "flat";
}

export interface Prediction {
  ticker: string;
  sentiment_score: number;
  direction: "Up" | "Down" | "Sideways";
  confidence: "Low" | "Medium" | "High";
  reasoning: string[];
  key_triggers: string[];
}

export interface ApiError {
  error: string;
  detail?: string;
}
