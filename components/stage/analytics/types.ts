// ─── shared types & constants ─────────────────────────────────────────────────

export interface CostEntry {
  agentId: string;
  tokens: number;
  estimatedCost: number;
  routerId: string;
  routerLabel: string;
}

export interface DailyEntry {
  agentId: string;
  date: string;
  tokens: number;
  estimatedCost: number;
  routerId: string;
  routerLabel: string;
}

export interface RouterEntry {
  routerId: string;
  routerLabel: string;
  totalTokens: number;
  estimatedCost: number;
}

export interface AnalyticsData {
  costs: CostEntry[];
  daily: DailyEntry[];
  byRouter: RouterEntry[];
}

export type Tab = "overview" | "daily" | "weekly" | "byrouter";

export const ORANGE = "#e85d27";
export const GREEN  = "#22c55e";
export const RED    = "#ef4444";
export const PURPLE = "#8b5cf6";
export const BLUE   = "#38bdf8";

export function fmtCostFull(n: number): string {
  if (n === 0) return "$0.000000";
  return `$${n.toFixed(6)}`;
}

export function dateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}
