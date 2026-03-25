// ─── shared types & constants ─────────────────────────────────────────────────

export interface SessionDetail {
  loading: boolean;
  prompt?: string;
  lastDelivery?: string;
  deliveryTime?: string;
  destination?: string;
  eventCount?: number;
}

export const SESSION_TYPE_COLORS: Record<string, string> = {
  cron:       "#f59e0b",
  "tg-topic": "#3b82f6",
  "tg-direct":"#8b5cf6",
  "tg-group": "#6366f1",
  main:       "#6b7280",
  subagent:   "#10b981",
};

export const VALIDITY_COLOR: Record<string, string> = {
  active:"#22c55e", overdue:"#f59e0b", stale:"#f97316", paused:"#6b7280", unconfirmed:"#6366f1",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

export function parseHeartbeatLines(content: string): Array<{ name: string; schedule: string; desc: string }> {
  const results: Array<{ name: string; schedule: string; desc: string }> = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\s*(?:\((.+?)\))?\*\*:?\s*(.*)/);
    if (m) results.push({ name: m[1].trim(), schedule: m[2]?.trim() ?? "", desc: m[3]?.trim() ?? "" });
  }
  return results.slice(0, 8);
}

// Deterministic color from a string
const PALETTE = ["#e85d27","#3b82f6","#8b5cf6","#10b981","#f59e0b","#ec4899","#06b6d4","#84cc16"];
export function accentColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Emoji icon for common skills
const SKILL_ICONS: Record<string, string> = {
  calendar:"📅", notion:"📝", jira:"🎯", slack:"💬", telegram:"✈️",
  github:"🔧", email:"📧", search:"🔍", gog:"🎮", sheets:"📊",
  docs:"📄", drive:"☁️", browser:"🌐", api:"🔌", database:"🗄️",
  code:"💻", git:"🔀", figma:"🎨", linear:"📐", trello:"📋",
  twitter:"🐦", discord:"🎮", openai:"🤖", claude:"🧠", news:"📰",
  finance:"💹", stocks:"📈", crypto:"🪙", weather:"⛅", maps:"🗺️",
};
export function skillEmoji(s: string): string {
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(SKILL_ICONS)) {
    if (lower.includes(k)) return v;
  }
  return "⚡";
}

export function cleanMsg(msg: string): string {
  return msg
    .replace(/^[🤖💬🛠️🧠❌]\s*/, "")
    .replace(/<final>[\s\S]*?<\/final>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^NO_REPLY\s*/i, "")
    .trim();
}
