import type { LogType } from "@/app/activities/types";

// ── helpers ───────────────────────────────────────────────────────────────────

export function fmtTs(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export const ACTIVE_MS = 10 * 60 * 1000;

// ── type badge ────────────────────────────────────────────────────────────────

export const TYPE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  cron:     { bg: "bg-amber-500/10",  text: "text-amber-400",  dot: "bg-amber-500"  },
  subagent: { bg: "bg-sky-500/10",    text: "text-sky-400",    dot: "bg-sky-500"    },
  telegram: { bg: "bg-blue-500/10",   text: "text-blue-400",   dot: "bg-blue-500"   },
  main:     { bg: "bg-zinc-500/10",   text: "text-zinc-400",   dot: "bg-zinc-500"   },
};

export function typeStyle(t: string) {
  return TYPE_STYLE[t] ?? { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-500" };
}

// ── log config ────────────────────────────────────────────────────────────────

export const LOG_CFG: Record<LogType, { dot: string; bar: string; text: string; badge: string; label: string }> = {
  chat:   { dot: "bg-sky-500",     bar: "border-l-sky-500/40",   text: "text-sky-300/90",   badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",   label: "Chats"  },
  info:   { dot: "bg-zinc-500",    bar: "border-l-zinc-500/30",  text: "text-zinc-300/80",  badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", label: "Info"   },
  memory: { dot: "bg-violet-500",  bar: "border-l-violet-500/40",text: "text-violet-300/90",badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",label:"Memory"},
  error:  { dot: "bg-red-500",     bar: "border-l-red-500/40",   text: "text-red-300/90",   badge: "bg-red-500/10 text-red-400 border-red-500/20",   label: "Errors" },
};
