/**
 * Shared formatting utilities.
 * Import from here rather than defining locally in page / component files.
 */

/** Formats a timestamp (ms since epoch) as a relative time string: "just now", "5m ago", "2h ago", "3d ago" */
export function timeAgo(ts: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)     return "just now";
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Formats a cost in dollars with 4 decimal places */
export function fmtCost(n: number): string {
  if (n === 0)    return "$0.0000";
  if (n < 0.0001) return "< $0.0001";
  return `$${n.toFixed(4)}`;
}

/** Formats a token count with K / M suffix */
export function fmtTokens(n: number): string {
  if (!n)             return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Formats an uptime in seconds as a human-readable duration */
export function uptimeFmt(s: number): string {
  if (s < 60)    return `${Math.round(s)}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** Extracts the short model name from a "provider/model-name" path */
export function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}

/** Formats a YYYY-MM-DD date string as "Jan 5" */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Formats a Unix timestamp (ms, or seconds if < 1e12) as "Jan 5" */
export function fmtDateTs(ts: number | undefined): string {
  if (!ts) return "Never";
  const ms = ts > 0 && ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Returns the ISO week string for a YYYY-MM-DD date (e.g. "2024-W03") */
export function isoWeek(dateStr: string): string {
  const d      = new Date(dateStr + "T12:00:00Z");
  const jan4   = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dow    = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (dow - 1) * 86400000);
  const weekNum   = Math.ceil((d.getTime() - weekStart.getTime()) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
