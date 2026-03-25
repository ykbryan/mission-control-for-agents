import type { ActivitySession } from "@/app/api/activities/route";

// Re-export for convenience
export type { ActivitySession };

// ── log types ─────────────────────────────────────────────────────────────────

export type LogType = "info" | "error" | "memory" | "chat";
export type LogFilter = "all" | LogType;

export interface LogEntry {
  type: LogType;
  message: string;
  fullMessage?: string;
  timestamp?: number;
}

// ── activity event (used in swarm trace + schedule tab) ───────────────────────

export interface ActivityEvent {
  id: string;
  type: "info" | "error" | "memory" | "chat";
  message: string;
  fullMessage?: string;
  timestamp: string;
  model?: string;
}

// ── swarm trace types ─────────────────────────────────────────────────────────

export interface SwarmChainStep {
  sessions: ActivitySession[];
  timestamp: number;
  label: string;
}

export interface SwarmChain {
  root: ActivitySession;
  steps: SwarmChainStep[];
}

// ── cron group ────────────────────────────────────────────────────────────────

export interface CronGroup {
  jobName: string;
  agentId: string;
  runs: ActivitySession[];
  lastRun: number;
  totalTokens: number;
  isActive: boolean;
}
