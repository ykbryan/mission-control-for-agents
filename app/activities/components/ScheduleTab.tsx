"use client";

import { useEffect, useState } from "react";
import type { ScheduledJob, JobValidity } from "@/app/api/cron-schedule/route";
import { timeAgo, fmtTokens } from "@/lib/formatters";
import { fmtTs } from "@/app/activities/components/shared";
import { Empty } from "@/app/activities/components/Empty";

// ── constants & helpers ───────────────────────────────────────────────────────

const AGENT_EMOJI: Record<string, string> = {
  evelyn: "👔", brainy: "🧠", charles: "👔", faith: "🌻", angel: "📈",
  bob: "🧮", gorilla: "🦍", hex: "⛓️", ivy: "📱", kat: "🎯",
  looker: "🔍", mother: "🛡️", norton: "🔒", omega: "🏛️", pat: "🏷️",
  queen: "👑", roy: "💼", jelly: "✍️",
};

function fmtNextRun(ms: number | null, now: number): { label: string; urgency: "overdue" | "soon" | "upcoming" | "unknown" } {
  if (!ms) return { label: "—", urgency: "unknown" };
  const diff = ms - now;
  if (diff < 0) {
    const ago = Math.abs(diff);
    const m = Math.floor(ago / 60_000);
    if (m < 60) return { label: `${m}m ago`, urgency: "overdue" };
    return { label: `${Math.floor(m / 60)}h ago`, urgency: "overdue" };
  }
  const m = Math.floor(diff / 60_000);
  if (m < 5) return { label: `in ${m}m`, urgency: "soon" };
  if (m < 60) return { label: `in ${m}m`, urgency: "upcoming" };
  const h = Math.floor(m / 60);
  if (h < 24) return { label: `in ${h}h ${m % 60}m`, urgency: "upcoming" };
  return { label: `in ${Math.floor(h / 24)}d`, urgency: "upcoming" };
}

const VALIDITY_CFG: Record<JobValidity, { label: string; color: string; bg: string; tip: string }> = {
  active:      { label: "Active",       color: "#22c55e", bg: "rgba(34,197,94,0.08)",    tip: "Running on schedule" },
  overdue:     { label: "Overdue",      color: "#f59e0b", bg: "rgba(245,158,11,0.08)",   tip: "Missed 1–2 expected runs — may be delayed" },
  stale:       { label: "Stale",        color: "#f97316", bg: "rgba(249,115,22,0.08)",   tip: "Missed 3–10 expected runs — likely paused" },
  paused:      { label: "Paused",       color: "#6b7280", bg: "rgba(107,114,128,0.08)",  tip: "Missed >10 expected runs — likely removed from scheduler" },
  unconfirmed: { label: "Unconfirmed",  color: "#6366f1", bg: "rgba(99,102,241,0.08)",   tip: "Fewer than 3 runs — schedule cannot be reliably inferred" },
};

const CATEGORY_CFG = {
  monitoring:    { label: "Active Monitoring",   icon: "⏱️", order: 0, accent: "#3b82f6" },
  orchestration: { label: "Swarm Orchestration", icon: "🔄", order: 1, accent: "#a855f7" },
  memory:        { label: "Memory & System",     icon: "🧠", order: 2, accent: "#22d3ee" },
  general:       { label: "General",             icon: "⚙️", order: 3, accent: "#6b7280" },
} as const;
type Category = keyof typeof CATEGORY_CFG;

function inferCategory(job: ScheduledJob): Category {
  const isPlaceholder = job.description.includes("Prompt not available");
  const t = (job.name + " " + (isPlaceholder ? "" : job.description)).toLowerCase();
  if (/monitor|watchdog|status|scan|patrol|check|heartbeat|alert/.test(t)) return "monitoring";
  if (/pipeline|sequence|swarm|orchestrat|workflow|handoff|stage|deploy|sprint/.test(t)) return "orchestration";
  if (/\bmemory\b|startup|shutdown|session startup|session shutdown|notion|daily log|distill|wake up/.test(t)) return "memory";
  return "general";
}

const KNOWN_AGENTS = ["evelyn","brainy","charles","faith","angel","bob","gorilla","hex","ivy","kat","looker","mother","norton","omega","pat","queen","roy","jelly"];

function extractMentionedAgents(text: string): string[] {
  const lower = text.toLowerCase();
  return KNOWN_AGENTS.filter(a => lower.includes(a));
}

// ── main component ────────────────────────────────────────────────────────────

export function ScheduleTab({ agentFilter }: { agentFilter: string }) {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table" | "calendar">("cards");
  const [calOffset, setCalOffset] = useState(0); // in days (multiples of 3)
  const [selectedCalJob, setSelectedCalJob] = useState<ScheduledJob | null>(null);
  const [now, setNow] = useState(Date.now());
  // jobId → fetched real prompt (for time-bucket clusters)
  const [fetchedPrompts, setFetchedPrompts] = useState<Record<string, string>>({});
  const [promptLoading, setPromptLoading] = useState<Record<string, boolean>>({});

  interface DeliveryInfo {
    content: string;    // last non-NO_REPLY 🤖 message
    timestamp: string | null;
    destination: string | null;  // e.g. "Telegram -1003873884862 · topic 32"
  }
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryInfo>>({});
  const [deliveryLoading, setDeliveryLoading] = useState<Record<string, boolean>>({});

  async function fetchSessionDetail(job: ScheduledJob) {
    if (deliveries[job.id] || deliveryLoading[job.id]) return;
    if (!job.sessionKeys.length) return;
    setDeliveryLoading(prev => ({ ...prev, [job.id]: true }));
    try {
      const key = job.sessionKeys[0];
      const res = await fetch(
        `/api/agent-session?agent=${encodeURIComponent(job.agentId)}&routerId=${encodeURIComponent(job.routerId)}&sessionKey=${encodeURIComponent(key)}`
      );
      const events: Array<{ type: string; message?: string; timestamp?: string }> = await res.json();
      if (!Array.isArray(events)) return;

      // Real prompt (first chat event)
      const firstChat = events.find(e => e.type === "chat" || e.message?.startsWith("💬"));
      if (firstChat?.message && job.description.includes("Prompt not available")) {
        const txt = firstChat.message.replace(/^💬\s*/, "").trim();
        setFetchedPrompts(prev => ({ ...prev, [job.id]: txt }));
      }

      // Last delivery: last 🤖 message that isn't NO_REPLY / <final> wrappers
      const outputs = events.filter(e =>
        e.message?.startsWith("🤖") &&
        !e.message.includes("NO_REPLY") &&
        !e.message.match(/^🤖\s*<final>\s*<\/final>/)
      );
      const lastOutput = outputs[outputs.length - 1];

      // Extract Telegram destination from tool calls
      const telegramSend = events.find(e =>
        e.message?.includes("telegram") && e.message?.includes("send")
      );
      let destination: string | null = null;
      if (telegramSend?.message) {
        const chatMatch = telegramSend.message.match(/"chat(?:Id)?"\s*:\s*"?(-?\d+)"?/);
        const topicMatch = telegramSend.message.match(/"(?:topic|thread|message_thread_id)(?:Id)?"\s*:\s*"?(\d+)"?/);
        if (chatMatch) {
          destination = `Telegram ${chatMatch[1]}${topicMatch ? ` · topic ${topicMatch[1]}` : ""}`;
        }
      }
      // Also check message content for [[reply_to_current]] or topic references
      if (!destination && lastOutput?.message) {
        const topicInMsg = lastOutput.message.match(/topic\s+(\d+)/i);
        if (topicInMsg) destination = `Telegram · topic ${topicInMsg[1]}`;
      }

      if (lastOutput) {
        const cleaned = lastOutput.message!
          .replace(/^🤖\s*/, "")
          .replace(/^<final>\s*/i, "")
          .replace(/<\/final>$/i, "")
          .replace(/^<think>[\s\S]*?<\/think>\s*/i, "")
          .trim();
        setDeliveries(prev => ({
          ...prev,
          [job.id]: { content: cleaned, timestamp: lastOutput.timestamp ?? null, destination }
        }));
      }
    } catch { /* ignore */ } finally {
      setDeliveryLoading(prev => ({ ...prev, [job.id]: false }));
    }
  }

  // Keep old name for backward compat with time-bucket expand trigger
  async function fetchRealPrompt(job: ScheduledJob) {
    return fetchSessionDetail(job);
  }

  // tick every minute for countdown refresh
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/cron-schedule")
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agentFilter === "all" ? jobs : jobs.filter(j => j.agentId === agentFilter);

  // Split into upcoming (have nextRunAt) and no-schedule
  const upcoming = filtered.filter(j => j.nextRunAt !== null).sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0));
  const noSchedule = filtered.filter(j => j.nextRunAt === null);

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-24">
      <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#222", borderTopColor: "#e85d27" }} />
      <span className="text-xs text-zinc-600">Analysing schedules…</span>
    </div>
  );

  if (filtered.length === 0) return <Empty label="No scheduled jobs found" />;

  // ── card view helpers ──────────────────────────────────────────────────────
  const grouped = new Map<Category, ScheduledJob[]>();
  for (const job of filtered) {
    const cat = inferCategory(job);
    const arr = grouped.get(cat) ?? [];
    arr.push(job);
    grouped.set(cat, arr);
  }
  const orderedCats = (Array.from(grouped.keys()) as Category[])
    .sort((a, b) => CATEGORY_CFG[a].order - CATEGORY_CFG[b].order);

  // ── shared expanded panel ──────────────────────────────────────────────────
  function ExpandedPanel({ job, vcfg }: { job: ScheduledJob; vcfg: typeof VALIDITY_CFG[JobValidity] }) {
    const delivery = deliveries[job.id];
    const isLoadingDetail = deliveryLoading[job.id];
    return (
      <div className="px-4 pb-4 pt-3 border-t" style={{ borderColor: "#1a1a1a", background: "#06060a" }}>

        {/* Status / validity pill */}
        <div className="flex items-start gap-2 mb-4 p-2 rounded" style={{ background: vcfg.bg, border: `1px solid ${vcfg.color}20` }}>
          <span className="text-[10px] font-semibold" style={{ color: vcfg.color }}>{vcfg.label}:</span>
          <span className="text-[10px]" style={{ color: vcfg.color + "cc" }}>{vcfg.tip}</span>
        </div>

        {/* Prompt (real, fetched for time-bucket clusters) */}
        {fetchedPrompts[job.id] && (
          <div className="mb-4">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-800 mb-1">Prompt</div>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-mono bg-white/[0.02] rounded p-2 border border-white/5">{fetchedPrompts[job.id]}</p>
          </div>
        )}

        {/* Last delivery */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-800">Last Delivery</div>
            {delivery?.destination && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: "#22d3ee", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
                📨 {delivery.destination}
              </span>
            )}
            {delivery?.timestamp && (
              <span className="text-[9px] text-zinc-800 font-mono">{fmtTs(new Date(delivery.timestamp).getTime())}</span>
            )}
          </div>
          {isLoadingDetail ? (
            <div className="flex items-center gap-2 py-3">
              <div className="w-3 h-3 rounded-full border border-zinc-700 border-t-zinc-500 animate-spin" />
              <span className="text-[10px] text-zinc-800 italic">Fetching last delivery…</span>
            </div>
          ) : delivery ? (
            <div className="rounded border overflow-hidden" style={{ borderColor: "#1a1a1a", background: "#080810" }}>
              <p className="text-[11px] text-zinc-400 leading-relaxed p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{delivery.content.slice(0, 600)}{delivery.content.length > 600 ? "…" : ""}</p>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-800 italic">No delivery recorded</p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 flex-wrap mb-3">
          <span className="text-[10px] text-zinc-700">Agent: <span className="text-zinc-400 font-mono">{job.agentId}</span></span>
          <span className="text-[10px] text-zinc-700">Router: <span className="text-zinc-500">{job.routerLabel}</span></span>
          <span className="text-[10px] text-zinc-700">Tokens: <span className="text-zinc-500 font-mono">{fmtTokens(job.totalTokens)}</span></span>
          <span className="text-[10px] text-zinc-700">Runs: <span className="text-zinc-500">{job.runCount}</span></span>
          {job.lastRunAt > 0 && <span className="text-[10px] text-zinc-700">Last run: <span className="text-zinc-500">{fmtTs(job.lastRunAt)}</span></span>}
          {job.nextRunAt && (
            <span className="text-[10px] text-zinc-700">Next: <span className="font-mono" style={{ color: vcfg.color }}>{new Date(job.nextRunAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span>
          )}
        </div>

        {/* Session keys */}
        {job.sessionKeys.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-800 mb-1">Sessions ({job.sessionKeys.length})</div>
            <div className="flex flex-col gap-1">
              {job.sessionKeys.map(sk => (
                <span key={sk} className="text-[10px] font-mono text-zinc-700 bg-white/[0.02] border border-white/5 rounded px-2 py-0.5 truncate">{sk}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SGT helpers ────────────────────────────────────────────────────────────
  const SGT_MS = 8 * 60 * 60 * 1000;
  function toSGT(ts: number): Date { return new Date(ts + SGT_MS); }
  function sgtHHMM(ts: number): string {
    const d = toSGT(ts);
    return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }
  // Convert "HH:MM UTC" inside a scheduleStr to SGT
  function sgtScheduleStr(s: string): string {
    return s.replace(/(\d{1,2}):(\d{2})\s*UTC/gi, (_, h, m) => {
      const sgtH = (parseInt(h) + 8) % 24;
      const nextDay = parseInt(h) + 8 >= 24 ? " +1d" : "";
      return `${String(sgtH).padStart(2,"0")}:${m} SGT${nextDay}`;
    });
  }
  // Estimate all fire timestamps for a job within [windowStart, windowEnd)
  function estimateFireTimes(job: ScheduledJob, windowStart: number, windowEnd: number): number[] {
    if (!job.nextRunAt) return [];
    const iv = job.intervalMs;
    if (!iv || iv > 7 * 24 * 3600_000) {
      return job.nextRunAt >= windowStart && job.nextRunAt < windowEnd ? [job.nextRunAt] : [];
    }
    let t = job.nextRunAt;
    while (t - iv >= windowStart) t -= iv;
    const times: number[] = [];
    while (t < windowEnd) {
      if (t >= windowStart) times.push(t);
      t += iv;
      if (times.length > 400) break;
    }
    return times;
  }

  // ── CALENDAR VIEW ───────────────────────────────────────────────────────────
  function CalendarView() {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const VCOL: Record<string, string> = {
      active:"#22c55e", overdue:"#f59e0b", stale:"#f97316", paused:"#6b7280", unconfirmed:"#6366f1",
    };
    // Jobs firing more often than every 4h = "recurring pattern" — collapse to summary card
    const RECUR_THRESHOLD_MS = 4 * 60 * 60 * 1000;
    const recurringIds = new Set(filtered.filter(j => j.intervalMs && j.intervalMs < RECUR_THRESHOLD_MS).map(j => j.id));

    function fmtIv(ms: number): string {
      if (ms < 60_000)       return `${Math.round(ms/1000)}s`;
      if (ms < 3_600_000)    return `${Math.round(ms/60_000)}m`;
      return `${Math.round(ms/3_600_000)}h`;
    }
    function fmtT(ts: number): string {
      const d = toSGT(ts);
      return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
    }

    // Today's midnight in SGT (UTC ms), shifted by calOffset days
    const nowSGTDate = toSGT(now);
    const todayMidnightUTC = Date.UTC(nowSGTDate.getUTCFullYear(), nowSGTDate.getUTCMonth(), nowSGTDate.getUTCDate()) - SGT_MS;
    const windowStartUTC = todayMidnightUTC + calOffset * DAY_MS;

    // 3 days starting from windowStartUTC
    const days = Array.from({ length: 3 }, (_, i) => {
      const startMs = windowStartUTC + i * DAY_MS;
      const d = toSGT(startMs + SGT_MS);
      return { i, startMs, endMs: startMs + DAY_MS, dayName: DAY_NAMES[d.getUTCDay()], dayNum: d.getUTCDate(), monthName: MONTH_NAMES[d.getUTCMonth()], isToday: startMs === todayMidnightUTC };
    });

    type CalEvent = { job: ScheduledJob; ts: number; h: number; m: number };
    type RecurGroup = { job: ScheduledJob; count: number; first: number; last: number };

    const dayData = days.map(day => {
      const allEvts: CalEvent[] = [];
      for (const job of filtered) {
        for (const ts of estimateFireTimes(job, day.startMs, day.endMs)) {
          const d = toSGT(ts);
          allEvts.push({ job, ts, h: d.getUTCHours(), m: d.getUTCMinutes() });
        }
      }
      allEvts.sort((a, b) => a.ts - b.ts);

      // Separate recurring vs one-off
      const recurMap = new Map<string, RecurGroup>();
      const singles: CalEvent[] = [];
      for (const ev of allEvts) {
        if (recurringIds.has(ev.job.id)) {
          const g = recurMap.get(ev.job.id);
          if (!g) recurMap.set(ev.job.id, { job: ev.job, count: 1, first: ev.ts, last: ev.ts });
          else { g.count++; if (ev.ts < g.first) g.first = ev.ts; if (ev.ts > g.last) g.last = ev.ts; }
        } else {
          singles.push(ev);
        }
      }
      // Group singles by hour
      const byHour = new Map<number, CalEvent[]>();
      for (const ev of singles) {
        const arr = byHour.get(ev.h) ?? []; arr.push(ev); byHour.set(ev.h, arr);
      }
      return { allEvts, recurMap, singles, byHour, hours: Array.from(byHour.keys()).sort((a,b) => a-b) };
    });

    const nowSGT = toSGT(now);
    const nowH = nowSGT.getUTCHours();
    const nowM = nowSGT.getUTCMinutes();

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #111", background: "#07070a" }}>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#3a3a52" }}>🇸🇬 SGT · UTC+8</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[11px] font-mono" style={{ color: "#e85d2780" }}>{String(nowH).padStart(2,"0")}:{String(nowM).padStart(2,"0")} now</span>
          </div>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: "#252535" }}>
            {dayData.reduce((s,d) => s + d.allEvts.length, 0)} runs
          </span>
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCalOffset(o => o - 3)}
              disabled={calOffset <= 0}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{
                background: calOffset <= 0 ? "transparent" : "rgba(255,255,255,0.04)",
                color: calOffset <= 0 ? "#252535" : "#6b6b82",
                cursor: calOffset <= 0 ? "default" : "pointer",
                border: "1px solid " + (calOffset <= 0 ? "transparent" : "#1e1e2e"),
              }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[10px] font-mono px-1" style={{ color: calOffset === 0 ? "#e85d2780" : "#3a3a52" }}>
              {calOffset === 0 ? "today" : calOffset > 0 ? `+${calOffset}d` : `${calOffset}d`}
            </span>
            <button
              onClick={() => setCalOffset(o => o + 3)}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", color: "#6b6b82", border: "1px solid #1e1e2e", cursor: "pointer" }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {calOffset !== 0 && (
              <button
                onClick={() => setCalOffset(0)}
                className="text-[9px] px-2 py-0.5 rounded transition-colors ml-1"
                style={{ background: "rgba(232,93,39,0.1)", color: "#e85d27", border: "1px solid rgba(232,93,39,0.2)" }}
              >
                today
              </button>
            )}
          </div>
        </div>

        {/* 3-day grid */}
        <div className="flex flex-1 overflow-hidden">
          {days.map((day, di) => {
            const { recurMap, byHour, hours, allEvts } = dayData[di];
            const recurGroups = Array.from(recurMap.values());

            return (
              <div key={day.i} className="flex flex-col flex-1 overflow-hidden"
                style={{ borderRight: "1px solid #111", background: day.isToday ? "rgba(232,93,39,0.018)" : "transparent" }}>

                {/* Day header */}
                <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #111", background: day.isToday ? "rgba(232,93,39,0.055)" : "#09090d" }}>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest mb-0.5"
                        style={{ color: day.isToday ? "#e85d27" : "#2a2a3e" }}>{day.dayName}</p>
                      <p className="text-3xl font-black leading-none"
                        style={{ color: day.isToday ? "#f0f0f8" : "#1e1e2e" }}>
                        {day.dayNum}
                        <span className="text-sm font-semibold ml-1.5" style={{ color: day.isToday ? "#5a3010" : "#1a1a26" }}>{day.monthName}</span>
                      </p>
                    </div>
                    {allEvts.length > 0 && (
                      <div className="text-right pb-0.5">
                        <p className="text-2xl font-black leading-none" style={{ color: day.isToday ? "#e85d27" : "#1e1e2e" }}>{allEvts.length}</p>
                        <p className="text-[10px]" style={{ color: day.isToday ? "#5a3010" : "#141420" }}>runs</p>
                      </div>
                    )}
                  </div>
                  {day.isToday && (
                    <div className="flex items-center gap-1 mt-2 pt-1.5" style={{ borderTop: "1px solid rgba(232,93,39,0.1)" }}>
                      <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse shrink-0" />
                      <span className="text-[10px] font-mono" style={{ color: "#e85d2770" }}>
                        {String(nowH).padStart(2,"0")}:{String(nowM).padStart(2,"0")} SGT
                      </span>
                    </div>
                  )}
                </div>

                {/* Scrollable events */}
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#1a1a2e transparent" }}>

                  {/* ── Recurring pattern summaries (pinned at top) ── */}
                  {recurGroups.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest px-0.5" style={{ color: "#1e1e2e" }}>Recurring</p>
                      {recurGroups.map(g => {
                        const vc = VCOL[g.job.validity ?? "unconfirmed"];
                        const allPast = g.last < now;
                        const iv = fmtIv(g.job.intervalMs!);
                        return (
                          <div key={g.job.id} className="rounded-xl p-3"
                            onClick={() => { setSelectedCalJob(g.job); fetchSessionDetail(g.job); }}
                            style={{ background: allPast ? "rgba(255,255,255,0.012)" : vc + "0d", border: `1px solid ${allPast ? "#18182a" : vc + "28"}`, opacity: allPast ? 0.5 : 1, cursor: "pointer" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = `1px solid ${vc}55`; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = `1px solid ${allPast ? "#18182a" : vc + "28"}`; }}
                          >
                            {/* Top row: interval badge + count */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-black font-mono px-2 py-0.5 rounded-full"
                                  style={{ background: vc + "1a", color: vc }}>
                                  every {iv}
                                </span>
                                <span className="text-base leading-none">{AGENT_EMOJI[g.job.agentId] ?? "🤖"}</span>
                              </div>
                              <span className="text-[13px] font-black font-mono" style={{ color: allPast ? "#2e2e42" : vc }}>{g.count}×</span>
                            </div>
                            {/* Job name */}
                            <p className="text-sm font-semibold leading-tight mb-2"
                              style={{ color: allPast ? "#252535" : "#9090b8" }}>
                              {g.job.name.length > 50 ? g.job.name.slice(0,48)+"…" : g.job.name}
                            </p>
                            {/* Time range */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono" style={{ color: allPast ? "#1e1e2e" : vc + "cc" }}>{fmtT(g.first)}</span>
                              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${vc}50, ${vc}10)` }} />
                              <span className="text-[10px] font-mono" style={{ color: allPast ? "#1e1e2e" : vc + "60" }}>{fmtT(g.last)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Divider */}
                  {recurGroups.length > 0 && hours.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px" style={{ background: "#111118" }} />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#1a1a26" }}>scheduled</span>
                      <div className="flex-1 h-px" style={{ background: "#111118" }} />
                    </div>
                  )}

                  {/* ── One-off / hourly jobs ── */}
                  {hours.map(hour => (
                    <div key={hour}>
                      <div className="flex items-center gap-1 mb-1.5">
                        <span className="text-[11px] font-mono font-bold shrink-0"
                          style={{ color: day.isToday && hour === nowH ? "#e85d27" : "#222232" }}>
                          {String(hour).padStart(2,"0")}:xx
                        </span>
                        <div className="flex-1 h-px" style={{ background: day.isToday && hour === nowH ? "#e85d2730" : "#111118" }} />
                      </div>
                      <div className="flex flex-col gap-1">
                        {byHour.get(hour)!.map((ev, ei) => {
                          const vc = VCOL[ev.job.validity ?? "unconfirmed"];
                          const isPast = ev.ts < now;
                          return (
                            <div key={`${ev.job.id}-${ev.ts}-${ei}`} className="rounded-lg px-2.5 py-2"
                              onClick={() => { setSelectedCalJob(ev.job); fetchSessionDetail(ev.job); }}
                              style={{ background: isPast ? "rgba(255,255,255,0.012)" : vc + "0f", border: `1px solid ${isPast ? "#1a1a26" : vc + "2a"}`, opacity: isPast ? 0.45 : 1, cursor: "pointer" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = `1px solid ${vc}55`; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = `1px solid ${isPast ? "#1a1a26" : vc + "2a"}`; }}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[11px] font-mono font-bold" style={{ color: isPast ? "#2e2e42" : vc }}>
                                  {String(ev.h).padStart(2,"0")}:{String(ev.m).padStart(2,"0")}
                                </span>
                                <span className="text-base leading-none">{AGENT_EMOJI[ev.job.agentId] ?? "🤖"}</span>
                              </div>
                              <p className="text-sm font-medium leading-tight" style={{ color: isPast ? "#252535" : "#8080a0" }}>
                                {ev.job.name.length > 44 ? ev.job.name.slice(0,42)+"…" : ev.job.name}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {recurGroups.length === 0 && hours.length === 0 && (
                    <div className="flex items-center justify-center py-16">
                      <span className="text-[11px]" style={{ color: "#141420" }}>no runs scheduled</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">

      {/* View mode toggle bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0" style={{ borderColor: "#111", background: "#07070a" }}>
        <span className="text-[10px] text-zinc-700">{filtered.length} routine{filtered.length !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-0.5 p-0.5 rounded" style={{ background: "#111" }}>
          {([
            { key: "cards",    label: "🗂 Cards" },
            { key: "table",    label: "⊞ Table" },
            { key: "calendar", label: "📅 Calendar" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className="text-[10px] px-2.5 py-1 rounded transition-colors"
              style={viewMode === key
                ? { background: "#1e1e1e", color: "#e4e4e7" }
                : { color: "#52525b" }
              }
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── CARDS VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "cards" && (
        <div className="px-4 py-5 space-y-8">
          {orderedCats.map(cat => {
            const catJobs = grouped.get(cat)!;
            const cfg = CATEGORY_CFG[cat];
            return (
              <div key={cat}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base leading-none">{cfg.icon}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: cfg.accent }}>{cfg.label}</span>
                  <div className="flex-1 h-px" style={{ background: `${cfg.accent}18` }} />
                  <span className="text-[10px] text-zinc-800">{catJobs.length}</span>
                </div>

                {/* Cards grid */}
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
                  {catJobs.map(job => {
                    const vcfg = VALIDITY_CFG[job.validity ?? "unconfirmed"];
                    const isOpen = expandedJob === job.id;
                    const { label: nextLabel, urgency } = fmtNextRun(job.nextRunAt, now);
                    const dimmed = job.validity === "paused" || job.validity === "stale";
                    const involvedAgents = extractMentionedAgents(job.description + " " + job.name);
                    const displayDesc = fetchedPrompts[job.id] ?? job.description;

                    return (
                      <div
                        key={job.id}
                        className="rounded-xl border overflow-hidden transition-all"
                        style={{
                          borderColor: isOpen ? cfg.accent + "40" : "#1a1a1a",
                          background: "#0a0a0f",
                          opacity: dimmed ? 0.55 : 1,
                        }}
                      >
                        {/* Card click area */}
                        <button
                          className="w-full text-left"
                          onClick={() => {
                            const next = isOpen ? null : job.id;
                            setExpandedJob(next);
                            if (next) fetchSessionDetail(job);
                          }}
                        >
                          {/* Top accent bar */}
                          <div className="h-0.5 w-full" style={{ background: isOpen ? cfg.accent : "transparent" }} />

                          {/* Header */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base leading-none flex-shrink-0">{AGENT_EMOJI[job.agentId] ?? "🤖"}</span>
                                <span className="text-[13px] font-medium text-zinc-100 leading-snug">{job.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                                {job.isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">{sgtScheduleStr(job.scheduleStr)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 ml-7">
                              <span className="text-[10px] text-zinc-600">{job.agentId}</span>
                              <span className="text-zinc-800">·</span>
                              <span className="text-[10px] text-zinc-700">{job.routerLabel}</span>
                              {job.source === "heartbeat" && (
                                <span className="text-[8px] text-amber-600/60 bg-amber-500/5 border border-amber-500/10 px-1.5 py-px rounded">HEARTBEAT</span>
                              )}
                            </div>
                          </div>

                          {/* Description */}
                          <div className="px-4 pb-3 ml-7">
                            <p className="text-[11px] leading-relaxed" style={{ color: displayDesc.includes("Prompt not available") ? "#3f3f46" : "#71717a" }}>
                              {displayDesc.replace(/^💬\s*/, "")}
                            </p>
                          </div>

                          {/* Footer: agents + status + timing */}
                          <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-t" style={{ borderColor: "#111" }}>
                            {/* Involved agents */}
                            <div className="flex items-center gap-1 flex-wrap min-w-0">
                              {involvedAgents.length > 0 ? (
                                <>
                                  {involvedAgents.slice(0, 5).map(a => (
                                    <span key={a} className="text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0"
                                      style={{ color: "#71717a", borderColor: "#1f1f1f", background: "#0f0f14" }}>
                                      {AGENT_EMOJI[a] ?? ""} {a}
                                    </span>
                                  ))}
                                  {involvedAgents.length > 5 && (
                                    <span className="text-[9px] text-zinc-800">+{involvedAgents.length - 5}</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[9px] text-zinc-800">no agents mentioned</span>
                              )}
                            </div>

                            {/* Right: status + timing */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                                style={{ color: vcfg.color, background: vcfg.bg }}>{vcfg.label}</span>
                              {job.nextRunAt ? (
                                <span className="text-[10px] font-mono flex-shrink-0"
                                  style={{ color: urgency === "soon" ? "#e85d27" : urgency === "overdue" ? vcfg.color : "#52525b" }}>
                                  {nextLabel}
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-800">{job.runCount > 0 ? `${job.runCount} runs` : "never run"}</span>
                              )}
                              <span className="text-zinc-800 text-xs">{isOpen ? "▲" : "▼"}</span>
                            </div>
                          </div>
                        </button>

                        {/* Expanded panel */}
                        {isOpen && <ExpandedPanel job={job} vcfg={vcfg} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TABLE VIEW ─────────────────────────────────────────────────────── */}
      {/* ── CALENDAR VIEW ─────────────────────────────────────────────────── */}
      {viewMode === "calendar" && <CalendarView />}

      {/* ── CALENDAR JOB DETAIL OVERLAY ────────────────────────────────────── */}
      {selectedCalJob && (() => {
        const job = selectedCalJob;
        const vcfg = VALIDITY_CFG[job.validity ?? "unconfirmed"];
        const involvedAgents = extractMentionedAgents(job.description + " " + job.name);
        const iv = job.intervalMs
          ? job.intervalMs < 60_000 ? `every ${Math.round(job.intervalMs/1000)}s`
          : job.intervalMs < 3_600_000 ? `every ${Math.round(job.intervalMs/60_000)}m`
          : `every ${Math.round(job.intervalMs/3_600_000)}h`
          : job.scheduleStr;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex" }}>
            {/* Backdrop */}
            <div onClick={() => setSelectedCalJob(null)}
              style={{ flex: 1, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
            {/* Panel */}
            <div style={{
              width: "min(500px,100vw)", height: "100%", display: "flex", flexDirection: "column",
              background: "#08080f", borderLeft: "1px solid #1a1a2e",
              boxShadow: "-24px 0 80px rgba(0,0,0,0.7)",
              animation: "slideInRight 0.2s cubic-bezier(0.16,1,0.3,1)",
            }}>
              {/* Panel header */}
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #14141e", flexShrink: 0, background: "#0a0a14" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "22px" }}>{AGENT_EMOJI[job.agentId] ?? "🤖"}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#3a3a52" }}>{job.agentId}</span>
                      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: "99px", background: vcfg.bg, color: vcfg.color, border: `1px solid ${vcfg.color}30` }}>{vcfg.label}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#d4d4e8", lineHeight: 1.3 }}>{job.name}</p>
                  </div>
                  <button onClick={() => setSelectedCalJob(null)}
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "6px 10px", color: "#3a3a52", cursor: "pointer", fontSize: "12px", flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px", scrollbarWidth: "thin", scrollbarColor: "#1a1a2e transparent" }}>

                {/* Schedule strip */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, fontFamily: "monospace", padding: "4px 10px", borderRadius: "99px", background: vcfg.color + "15", color: vcfg.color, border: `1px solid ${vcfg.color}30` }}>{iv}</span>
                  <span style={{ fontSize: "11px", color: "#3a3a52" }}>·</span>
                  <span style={{ fontSize: "11px", color: "#4a4a62" }}>{job.runCount} runs</span>
                  {job.lastRunAt > 0 && <>
                    <span style={{ fontSize: "11px", color: "#3a3a52" }}>·</span>
                    <span style={{ fontSize: "11px", color: "#4a4a62" }}>last {timeAgo(job.lastRunAt)}</span>
                  </>}
                  {job.nextRunAt && <>
                    <span style={{ fontSize: "11px", color: "#3a3a52" }}>·</span>
                    <span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 700, color: vcfg.color }}>
                      next {sgtHHMM(job.nextRunAt)} SGT
                    </span>
                  </>}
                </div>

                {/* Description */}
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#252535" }}>Task Description</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "#8080a0", lineHeight: 1.6, background: "rgba(255,255,255,0.02)", border: "1px solid #14141e", borderRadius: "10px", padding: "12px 14px" }}>
                    {job.description || "No description available."}
                  </p>
                </div>

                {/* Involved agents */}
                {involvedAgents.length > 0 && (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#252535" }}>Agents Involved</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {involvedAgents.map(a => (
                        <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", color: "#7070a0" }}>
                          <span>{AGENT_EMOJI[a] ?? "🤖"}</span>
                          <span style={{ fontWeight: 600 }}>{a}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Router */}
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  {[
                    { label: "Router", value: job.routerLabel },
                    { label: "Tokens", value: fmtTokens(job.totalTokens) },
                    { label: "Avg Tokens", value: fmtTokens(job.avgTokens) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e1e2e" }}>{label}</p>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#4a4a62", fontFamily: "monospace" }}>{value || "—"}</p>
                    </div>
                  ))}
                </div>

                {/* Last delivery */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#252535" }}>Last Delivery</p>
                    {deliveries[job.id]?.destination && (
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", fontFamily: "monospace", color: "#22d3ee", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
                        📨 {deliveries[job.id].destination}
                      </span>
                    )}
                  </div>
                  {deliveryLoading[job.id] ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", color: "#3a3a52", fontSize: "12px" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #1a1a2e", borderTopColor: "#e85d27", animation: "spin 0.8s linear infinite" }} />
                      Fetching last delivery…
                    </div>
                  ) : deliveries[job.id] ? (
                    <div style={{ background: "#0c0c16", border: "1px solid #14141e", borderRadius: "10px", padding: "12px 14px" }}>
                      <p style={{ margin: 0, fontSize: "12px", color: "#7070a0", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>
                        {deliveries[job.id].content.slice(0, 800)}{deliveries[job.id].content.length > 800 ? "…" : ""}
                      </p>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "12px", color: "#252535", fontStyle: "italic" }}>No delivery recorded</p>
                  )}
                </div>

                {/* Session keys */}
                {job.sessionKeys.length > 0 && (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#252535" }}>Sessions ({job.sessionKeys.length})</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {job.sessionKeys.map(sk => (
                        <span key={sk} style={{ fontSize: "10px", fontFamily: "monospace", color: "#2e2e42", background: "rgba(255,255,255,0.02)", border: "1px solid #14141e", borderRadius: "6px", padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <style>{`@keyframes slideInRight{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        );
      })()}

      {viewMode === "table" && (
        <div className="flex flex-col">
          {/* Table header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b text-[10px] font-semibold uppercase tracking-wider text-zinc-700 flex-shrink-0" style={{ borderColor: "#111", background: "#07070a" }}>
            <div className="w-6" />
            <div className="flex-1">Job / Agent</div>
            <div className="w-24 text-right">Schedule</div>
            <div className="w-28 text-right">Last Run</div>
            <div className="w-28 text-right">Next Run</div>
            <div className="w-20 text-right">Avg Tokens</div>
            <div className="w-14 text-right">Runs</div>
            <div className="w-24 text-right">Status</div>
            <div className="w-4" />
          </div>

          {/* Upcoming jobs */}
          {upcoming.map(job => {
            const { label: nextLabel } = fmtNextRun(job.nextRunAt, now);
            const vcfg = VALIDITY_CFG[job.validity ?? "unconfirmed"];
            const isOpen = expandedJob === job.id;
            const dimmed = job.validity === "paused" || job.validity === "stale";
            return (
              <div key={job.id} className="border-b" style={{ borderColor: "#0e0e0e", opacity: dimmed ? 0.55 : 1 }}>
                <button
                  onClick={() => {
                    const next = isOpen ? null : job.id;
                    setExpandedJob(next);
                    if (next) fetchSessionDetail(job);
                  }}
                  className="group w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-6 flex-shrink-0 flex justify-center">
                    {job.isActive
                      ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      : <span className="w-2 h-2 rounded-full" style={{ background: vcfg.color, opacity: 0.5 }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{AGENT_EMOJI[job.agentId] ?? "🤖"}</span>
                      <span className="text-xs font-medium text-zinc-200 truncate">{job.name}</span>
                      {job.isActive && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded flex-shrink-0">Running</span>}
                      {job.source === "heartbeat" && <span className="text-[9px] text-amber-600/70 bg-amber-500/5 border border-amber-500/10 px-1.5 py-px rounded flex-shrink-0">HEARTBEAT</span>}
                    </div>
                    <div className="text-[10px] text-zinc-700 mt-0.5">{job.agentId} · {job.routerLabel}</div>
                  </div>
                  <div className="w-24 text-right flex-shrink-0"><span className="text-[11px] text-zinc-400 font-mono">{sgtScheduleStr(job.scheduleStr)}</span></div>
                  <div className="w-28 text-right flex-shrink-0"><span className="text-[11px] text-zinc-600">{job.lastRunAt ? timeAgo(job.lastRunAt) : "never"}</span></div>
                  <div className="w-28 text-right flex-shrink-0"><span className="text-[11px] font-mono" style={{ color: vcfg.color }}>{nextLabel}</span></div>
                  <div className="w-20 text-right flex-shrink-0"><span className="text-[11px] text-zinc-700 font-mono">{job.avgTokens > 0 ? fmtTokens(job.avgTokens) : "—"}</span></div>
                  <div className="w-14 text-right flex-shrink-0"><span className="text-[11px] text-zinc-600">{job.runCount}</span></div>
                  <div className="w-24 text-right flex-shrink-0">
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: vcfg.color, background: vcfg.bg }}>{vcfg.label}</span>
                  </div>
                  <div className="w-4 text-right flex-shrink-0 text-zinc-700 text-xs">{isOpen ? "▲" : "▼"}</div>
                </button>
                {isOpen && <ExpandedPanel job={job} vcfg={vcfg} />}
              </div>
            );
          })}

          {/* No-schedule section */}
          {noSchedule.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-800 border-b" style={{ borderColor: "#0e0e0e", background: "#06060a" }}>
                Ad-hoc / No inferred schedule
              </div>
              {noSchedule.map(job => {
                const isOpen = expandedJob === job.id;
                const vcfg = VALIDITY_CFG[job.validity ?? "unconfirmed"];
                return (
                  <div key={job.id} className="border-b" style={{ borderColor: "#0e0e0e" }}>
                    <button
                      onClick={() => setExpandedJob(isOpen ? null : job.id)}
                      className="group w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors opacity-60"
                    >
                      <div className="w-6 flex-shrink-0 flex justify-center"><span className="w-2 h-2 rounded-full bg-zinc-800" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{AGENT_EMOJI[job.agentId] ?? "🤖"}</span>
                          <span className="text-xs font-medium text-zinc-400 truncate">{job.name}</span>
                        </div>
                        <div className="text-[10px] text-zinc-800 mt-0.5">{job.agentId}</div>
                      </div>
                      <div className="w-24 text-right"><span className="text-[11px] text-zinc-700">{sgtScheduleStr(job.scheduleStr)}</span></div>
                      <div className="w-28 text-right"><span className="text-[11px] text-zinc-700">{job.lastRunAt ? timeAgo(job.lastRunAt) : "never"}</span></div>
                      <div className="w-28 text-right"><span className="text-[11px] text-zinc-800">—</span></div>
                      <div className="w-20 text-right"><span className="text-[11px] text-zinc-700 font-mono">{job.avgTokens > 0 ? fmtTokens(job.avgTokens) : "—"}</span></div>
                      <div className="w-14 text-right"><span className="text-[11px] text-zinc-700">{job.runCount}</span></div>
                      <div className="w-5 text-right text-zinc-800 text-xs">{isOpen ? "▲" : "▼"}</div>
                    </button>
                    {isOpen && <ExpandedPanel job={job} vcfg={vcfg} />}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
