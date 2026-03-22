"use client";

import { useEffect, useState, useMemo } from "react";
import NavRail from "@/components/mission-control/NavRail";
import type { ActivitySession } from "@/app/api/activities/route";

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function fmtTs(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const ACTIVE_MS = 10 * 60 * 1000;

// ── type badge ────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  cron:     { bg: "bg-amber-500/10",  text: "text-amber-400",  dot: "bg-amber-500"  },
  subagent: { bg: "bg-sky-500/10",    text: "text-sky-400",    dot: "bg-sky-500"    },
  telegram: { bg: "bg-blue-500/10",   text: "text-blue-400",   dot: "bg-blue-500"   },
  main:     { bg: "bg-zinc-500/10",   text: "text-zinc-400",   dot: "bg-zinc-500"   },
};
function typeStyle(t: string) {
  return TYPE_STYLE[t] ?? { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-500" };
}

// ── row component ─────────────────────────────────────────────────────────────

function SessionRow({ s }: { s: ActivitySession }) {
  const isActive = Date.now() - s.updatedAt < ACTIVE_MS;
  const ts = typeStyle(s.type);
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 border-b transition-colors hover:bg-white/[0.02]"
      style={{ borderColor: "#111" }}
    >
      {/* Active pulse / type dot */}
      <div className="flex-shrink-0 flex items-center justify-center w-8">
        {isActive ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${ts.dot} opacity-40`} />
        )}
      </div>

      {/* Icon + label */}
      <div className="flex-shrink-0 text-base w-6 text-center">{s.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-200">{s.agentId}</span>
          <span className="text-zinc-700 text-xs">·</span>
          <span className="text-xs text-zinc-400 truncate">{s.label}</span>
          {isActive && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] text-zinc-700">{fmtTs(s.updatedAt)}</span>
          {s.routerLabel && (
            <span className="text-[10px] text-zinc-800">{s.routerLabel}</span>
          )}
        </div>
      </div>

      {/* Type badge */}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${ts.bg} ${ts.text} flex-shrink-0`}>
        {s.type}
      </span>

      {/* Tokens */}
      {s.totalTokens > 0 && (
        <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 w-14 text-right">
          {fmtTokens(s.totalTokens)}
        </span>
      )}

      {/* Time ago */}
      <span className="text-[10px] text-zinc-700 flex-shrink-0 w-16 text-right tabular-nums">
        {timeAgo(s.updatedAt)}
      </span>
    </div>
  );
}

// ── cron group card ───────────────────────────────────────────────────────────

interface CronGroup {
  jobName: string;
  agentId: string;
  runs: ActivitySession[];
  lastRun: number;
  totalTokens: number;
  isActive: boolean;
}

function CronCard({ g }: { g: CronGroup }) {
  const [open, setOpen] = useState(false);
  const avgTokens = g.runs.length ? Math.round(g.totalTokens / g.runs.length) : 0;
  return (
    <div className="border overflow-hidden" style={{ background: "#0d0d0d", borderColor: "#1a1a1a", borderRadius: "8px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-base flex-shrink-0">⏰</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-200">{g.jobName}</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-xs text-zinc-500">{g.agentId}</span>
            {g.isActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
                Running
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-700">Last: {timeAgo(g.lastRun)}</span>
            <span className="text-[10px] text-zinc-700">{g.runs.length} run{g.runs.length !== 1 ? "s" : ""}</span>
            <span className="text-[10px] text-zinc-700">avg {fmtTokens(avgTokens)} tok</span>
          </div>
        </div>
        <span className="text-zinc-700 text-xs ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: "#151515" }}>
          {g.runs.map((r, i) => (
            <div key={r.key} className="flex items-center gap-3 px-4 py-2 border-b text-[11px] hover:bg-white/[0.02]" style={{ borderColor: "#111" }}>
              <span className="text-zinc-700 font-mono w-5">#{i + 1}</span>
              <span className="text-zinc-500 flex-1">{fmtTs(r.updatedAt)}</span>
              {r.totalTokens > 0 && <span className="text-zinc-600 font-mono">{fmtTokens(r.totalTokens)} tok</span>}
              <span className="text-zinc-700">{timeAgo(r.updatedAt)}</span>
              {Date.now() - r.updatedAt < ACTIVE_MS && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type Tab = "active" | "cron" | "tasks" | "all";

export default function ActivitiesPage() {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/activities");
        const data = await res.json();
        setSessions(data.sessions ?? []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  const now = Date.now();
  const active    = sessions.filter(s => now - s.updatedAt < ACTIVE_MS);
  const cron      = sessions.filter(s => s.type === "cron");
  const tasks     = sessions.filter(s => s.type === "subagent");

  // group cron by job name per agent
  const cronGroups = useMemo(() => {
    const map = new Map<string, CronGroup>();
    for (const s of cron) {
      const key = `${s.agentId}::${s.label}`;
      const g = map.get(key) ?? { jobName: s.label, agentId: s.agentId, runs: [], lastRun: 0, totalTokens: 0, isActive: false };
      g.runs.push(s);
      g.lastRun = Math.max(g.lastRun, s.updatedAt);
      g.totalTokens += s.totalTokens;
      g.isActive = g.isActive || (now - s.updatedAt < ACTIVE_MS);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.lastRun - a.lastRun);
  }, [cron, now]);

  // unique agents for filter
  const agents = useMemo(() => {
    const ids = new Set(sessions.map(s => s.agentId));
    return Array.from(ids).sort();
  }, [sessions]);

  function filtered(list: ActivitySession[]) {
    return agentFilter === "all" ? list : list.filter(s => s.agentId === agentFilter);
  }

  const tabList: { key: Tab; label: string; count: number }[] = [
    { key: "active", label: "Active Now",   count: active.length },
    { key: "cron",   label: "Cron Jobs",    count: cronGroups.length },
    { key: "tasks",  label: "Delegated Tasks", count: tasks.length },
    { key: "all",    label: "All Activity", count: sessions.length },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Top nav */}
      <div style={{ borderBottom: "1px solid #1a1a22", padding: "0 24px", display: "flex", alignItems: "center", height: "52px", gap: "16px", flexShrink: 0 }}>
        <span style={{ color: "#888", fontSize: "13px" }}>Mission Control</span>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#f0f0f0", fontSize: "13px", fontWeight: 500 }}>Activities</span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: "11px", color: "#444", fontFamily: "monospace" }}>Refreshing…</span>}
        <span style={{ fontSize: "11px", color: "#333", fontFamily: "monospace" }}>↻ 15s</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <NavRail activeView="activities" onViewChange={(v) => {
          if (v === "mission") window.location.href = "/";
          if (v === "swarms") window.location.href = "/teams";
          if (v === "analytics") window.location.href = "/";
        }} />

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* Stats bar */}
          <div className="flex items-stretch gap-px border-b flex-shrink-0" style={{ borderColor: "#111", background: "#090909" }}>
            {[
              { label: "Active Now",   value: active.length,        color: "#22c55e", pulse: active.length > 0 },
              { label: "Cron Jobs",    value: cronGroups.length,    color: "#f59e0b", pulse: false },
              { label: "Delegated",    value: tasks.length,         color: "#38bdf8", pulse: false },
              { label: "Total Sessions", value: sessions.length,   color: "#6366f1", pulse: false },
            ].map(stat => (
              <div key={stat.label} className="flex-1 flex flex-col items-center justify-center py-4 gap-1" style={{ borderRight: "1px solid #111" }}>
                <div className="flex items-center gap-1.5">
                  {stat.pulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                  <span className="text-2xl font-bold tabular-nums" style={{ color: stat.color }}>{loading ? "—" : stat.value}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "#444" }}>{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Tabs + agent filter */}
          <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0 gap-4 flex-wrap" style={{ borderColor: "#111", background: "#08080a" }}>
            <div className="flex gap-1">
              {tabList.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    tab === t.key
                      ? "bg-[#1a1a1a] text-white border border-[#2e2e2e]"
                      : "text-zinc-600 hover:text-zinc-300 hover:bg-[#111]"
                  }`}
                >
                  {t.label}
                  <span className={`text-[10px] font-mono px-1.5 py-px rounded ${tab === t.key ? "bg-[#2a2a2a] text-zinc-400" : "text-zinc-700"}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            {/* Agent filter */}
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="text-xs bg-[#111] border border-[#1e1e1e] text-zinc-400 rounded px-2 py-1 outline-none"
            >
              <option value="all">All agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Content */}
          <div className="flex-1" style={{ minHeight: 0 }}>
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-24">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#222", borderTopColor: "#e85d27" }} />
                <span className="text-xs text-zinc-600">Loading activities…</span>
              </div>
            ) : (
              <>
                {/* Active Now */}
                {tab === "active" && (
                  <div>
                    {filtered(active).length === 0 ? (
                      <Empty label="No active sessions in the last 10 minutes" />
                    ) : (
                      filtered(active).map(s => <SessionRow key={s.key} s={s} />)
                    )}
                  </div>
                )}

                {/* Cron Jobs */}
                {tab === "cron" && (
                  <div className="p-4 flex flex-col gap-3">
                    {cronGroups.filter(g => agentFilter === "all" || g.agentId === agentFilter).length === 0 ? (
                      <Empty label="No cron jobs found" />
                    ) : (
                      cronGroups
                        .filter(g => agentFilter === "all" || g.agentId === agentFilter)
                        .map(g => <CronCard key={`${g.agentId}::${g.jobName}`} g={g} />)
                    )}
                  </div>
                )}

                {/* Delegated Tasks */}
                {tab === "tasks" && (
                  <div>
                    {filtered(tasks).length === 0 ? (
                      <Empty label="No delegated task sessions found" />
                    ) : (
                      filtered(tasks).map(s => <SessionRow key={s.key} s={s} />)
                    )}
                  </div>
                )}

                {/* All */}
                {tab === "all" && (
                  <div>
                    {filtered(sessions).length === 0 ? (
                      <Empty label="No sessions found" />
                    ) : (
                      filtered(sessions).map(s => <SessionRow key={s.key} s={s} />)
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2">
      <div className="text-2xl opacity-10 select-none">◌</div>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
