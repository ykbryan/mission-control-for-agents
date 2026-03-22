"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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

// ── log types ─────────────────────────────────────────────────────────────────

type LogType = "info" | "error" | "memory" | "chat";
type LogFilter = "all" | LogType;

interface LogEntry {
  type: LogType;
  message: string;
  fullMessage?: string;
  timestamp?: number;
}

const LOG_CFG: Record<LogType, { dot: string; bar: string; text: string; badge: string; label: string }> = {
  chat:   { dot: "bg-sky-500",     bar: "border-l-sky-500/40",   text: "text-sky-300/90",   badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",   label: "Chats"  },
  info:   { dot: "bg-zinc-500",    bar: "border-l-zinc-500/30",  text: "text-zinc-300/80",  badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", label: "Info"   },
  memory: { dot: "bg-violet-500",  bar: "border-l-violet-500/40",text: "text-violet-300/90",badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",label:"Memory"},
  error:  { dot: "bg-red-500",     bar: "border-l-red-500/40",   text: "text-red-300/90",   badge: "bg-red-500/10 text-red-400 border-red-500/20",   label: "Errors" },
};

// ── session detail panel ──────────────────────────────────────────────────────

interface DetailPanelProps {
  session: ActivitySession;
  onClose: () => void;
}

function SessionDetailPanel({ session, onClose }: DetailPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expandedLog, setExpandedLog] = useState<LogEntry | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // fetch logs
  useEffect(() => {
    setLoadingLogs(true);
    setLogs([]);
    setFilter("all");

    const params = new URLSearchParams({ agent: session.agentId, routerId: session.routerId });
    // pass sessionKey = full session key
    params.set("sessionKey", session.key);

    fetch(`/api/agent-session?${params}`)
      .then(r => r.json())
      .then((data: LogEntry[]) => {
        const normalised = (Array.isArray(data) ? data : []).map(e =>
          e.type === "info" && e.message.startsWith("💬")
            ? { ...e, type: "chat" as LogType }
            : e
        );
        setLogs(normalised);
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, [session.key, session.agentId, session.routerId]);

  // auto-scroll
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }, []);

  const visible = filter === "all" ? logs : logs.filter(l => l.type === filter);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length };
    for (const l of logs) c[l.type] = (c[l.type] ?? 0) + 1;
    return c;
  }, [logs]);

  const isActive = Date.now() - session.updatedAt < ACTIVE_MS;
  const ts = typeStyle(session.type);

  const panel = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} onClick={onClose} />

      {/* Panel */}
      <div
        style={{
          position: "relative", zIndex: 1, width: "min(680px, 90vw)", height: "100%",
          background: "#0a0a0c", borderLeft: "1px solid #1e1e24",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1a1a1f", padding: "12px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>{session.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f0f0" }}>{session.agentId}</span>
                <span style={{ fontSize: "11px", color: "#444" }}>·</span>
                <span style={{ fontSize: "12px", color: "#888" }}>{session.label}</span>
                {isActive && (
                  <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4ade80", background: "rgba(74,222,128,0.08)", padding: "1px 6px", borderRadius: "3px" }}>
                    Active
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "3px" }}>
                <span style={{ fontSize: "10px", color: "#444", fontFamily: "monospace" }}>{session.key}</span>
              </div>
            </div>
            {/* Meta pills */}
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}>
                {fmtTs(session.updatedAt)}
              </span>
              {session.totalTokens > 0 && (
                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "#111", color: "#555", fontFamily: "monospace" }}>
                  {fmtTokens(session.totalTokens)} tok
                </span>
              )}
              <button
                onClick={onClose}
                style={{ marginLeft: "4px", fontSize: "16px", color: "#444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ borderBottom: "1px solid #111", padding: "8px 12px", display: "flex", gap: "4px", flexShrink: 0, background: "#08080a" }}>
          {(["all", "chat", "info", "memory", "error"] as LogFilter[]).map(f => {
            const active = filter === f;
            const count = counts[f] ?? 0;
            const cfg = f === "all" ? null : LOG_CFG[f as LogType];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: "11px", padding: "3px 10px", borderRadius: "5px", border: "1px solid transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s",
                  background: active ? "#1a1a1a" : "transparent",
                  color: active ? "#e0e0e0" : "#555",
                  borderColor: active ? "#2a2a2a" : "transparent",
                }}
              >
                {cfg && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.dot.replace("bg-", "").includes("-") ? undefined : cfg.dot, flexShrink: 0 }} className={cfg.dot} />}
                {f === "all" ? "All" : cfg?.label}
                <span style={{ fontSize: "10px", fontFamily: "monospace", color: active ? "#666" : "#333" }}>{count}</span>
              </button>
            );
          })}
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              style={{ marginLeft: "auto", fontSize: "10px", padding: "3px 8px", borderRadius: "4px", background: "#1a1a1a", color: "#e85d27", border: "1px solid #2a2a2a", cursor: "pointer" }}
            >
              ↓ Latest
            </button>
          )}
        </div>

        {/* Log list */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
        >
          {loadingLogs ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "48px 0" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid #222", borderTopColor: "#e85d27", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "11px", color: "#444" }}>Loading logs…</span>
            </div>
          ) : visible.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: "8px" }}>
              <span style={{ fontSize: "20px", opacity: 0.1 }}>◌</span>
              <span style={{ fontSize: "11px", color: "#333" }}>No {filter === "all" ? "" : filter + " "}logs</span>
            </div>
          ) : (
            visible.map((log, i) => {
              const cfg = LOG_CFG[log.type] ?? LOG_CFG.info;
              const expandable = !!log.fullMessage;
              return (
                <div
                  key={i}
                  onClick={() => expandable && setExpandedLog(log)}
                  className={`border-l-2 ${cfg.bar}`}
                  style={{
                    padding: "6px 14px 6px 12px", borderBottom: "1px solid #0e0e0e",
                    cursor: expandable ? "pointer" : "default",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.015)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${cfg.dot}`} style={{ minWidth: "6px" }} />
                    <span className={`text-[11px] leading-relaxed break-words flex-1 ${cfg.text}`} style={{ wordBreak: "break-word" }}>
                      {log.message}
                    </span>
                    {expandable && (
                      <span style={{ fontSize: "9px", color: "#444", flexShrink: 0, marginTop: "2px", opacity: 0 }}
                        className="group-hover:opacity-100 transition-opacity"
                      >
                        expand ↗
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer status */}
        <div style={{ borderTop: "1px solid #111", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, background: "#08080a" }}>
          {isActive && (
            <>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: "#22c55e" }}>Live</span>
            </>
          )}
          <span style={{ fontSize: "10px", color: "#333", marginLeft: "auto" }}>{logs.length} events</span>
          <span style={{ fontSize: "10px", color: "#2a2a2a" }}>·</span>
          <span style={{ fontSize: "10px", color: "#333" }}>{session.routerLabel}</span>
        </div>
      </div>

      {/* Expanded log modal */}
      {expandedLog && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExpandedLog(null)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
          <div
            style={{
              position: "relative", zIndex: 1, width: "min(700px, 90vw)", maxHeight: "70vh",
              background: "#0e0e12", border: "1px solid #222", borderRadius: "8px",
              padding: "20px", overflow: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full message</span>
              <button onClick={() => setExpandedLog(null)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
            <p style={{ fontSize: "12px", color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
              {expandedLog.fullMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}

// ── row component ─────────────────────────────────────────────────────────────

function SessionRow({ s, onClick }: { s: ActivitySession; onClick: () => void }) {
  const isActive = Date.now() - s.updatedAt < ACTIVE_MS;
  const ts = typeStyle(s.type);
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 border-b text-left transition-colors hover:bg-white/[0.03]"
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

      {/* Open hint */}
      <span className="text-[10px] text-zinc-800 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
    </button>
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

function CronCard({ g, onOpen }: { g: CronGroup; onOpen: (s: ActivitySession) => void }) {
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
            <button
              key={r.key}
              onClick={() => onOpen(r)}
              className="group w-full flex items-center gap-3 px-4 py-2 border-b text-left text-[11px] hover:bg-white/[0.03] transition-colors"
              style={{ borderColor: "#111" }}
            >
              <span className="text-zinc-700 font-mono w-5">#{i + 1}</span>
              <span className="text-zinc-500 flex-1">{fmtTs(r.updatedAt)}</span>
              {r.totalTokens > 0 && <span className="text-zinc-600 font-mono">{fmtTokens(r.totalTokens)} tok</span>}
              <span className="text-zinc-700">{timeAgo(r.updatedAt)}</span>
              {Date.now() - r.updatedAt < ACTIVE_MS && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              <span className="text-[10px] text-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">View logs ↗</span>
            </button>
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
  const [detailSession, setDetailSession] = useState<ActivitySession | null>(null);

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
    { key: "active", label: "Active Now",      count: active.length },
    { key: "cron",   label: "Cron Jobs",        count: cronGroups.length },
    { key: "tasks",  label: "Delegated Tasks",  count: tasks.length },
    { key: "all",    label: "All Activity",     count: sessions.length },
  ];

  return (
    <>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        {/* Top nav */}
        <div style={{ borderBottom: "1px solid #1a1a22", padding: "0 24px", display: "flex", alignItems: "center", height: "52px", gap: "16px", flexShrink: 0 }}>
          <span style={{ color: "#888", fontSize: "13px" }}>Mission Control</span>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ color: "#f0f0f0", fontSize: "13px", fontWeight: 500 }}>Agent Activities</span>
          <div style={{ flex: 1 }} />
          {loading && <span style={{ fontSize: "11px", color: "#444", fontFamily: "monospace" }}>Refreshing…</span>}
          <span style={{ fontSize: "11px", color: "#333", fontFamily: "monospace" }}>↻ 15s</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <NavRail activeView="activities" onViewChange={(v) => {
            if (v === "mission") window.location.href = "/";
            if (v === "swarms") window.location.href = "/teams";
            if (v === "spending") window.location.href = "/spending";
          }} />

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Stats bar */}
            <div className="flex items-stretch gap-px border-b flex-shrink-0" style={{ borderColor: "#111", background: "#090909" }}>
              {[
                { label: "Active Now",     value: active.length,        color: "#22c55e", pulse: active.length > 0 },
                { label: "Cron Jobs",      value: cronGroups.length,    color: "#f59e0b", pulse: false },
                { label: "Delegated",      value: tasks.length,         color: "#38bdf8", pulse: false },
                { label: "Total Sessions", value: sessions.length,      color: "#6366f1", pulse: false },
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
                        filtered(active).map(s => <SessionRow key={s.key} s={s} onClick={() => setDetailSession(s)} />)
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
                          .map(g => <CronCard key={`${g.agentId}::${g.jobName}`} g={g} onOpen={setDetailSession} />)
                      )}
                    </div>
                  )}

                  {/* Delegated Tasks */}
                  {tab === "tasks" && (
                    <div>
                      {filtered(tasks).length === 0 ? (
                        <Empty label="No delegated task sessions found" />
                      ) : (
                        filtered(tasks).map(s => <SessionRow key={s.key} s={s} onClick={() => setDetailSession(s)} />)
                      )}
                    </div>
                  )}

                  {/* All */}
                  {tab === "all" && (
                    <div>
                      {filtered(sessions).length === 0 ? (
                        <Empty label="No sessions found" />
                      ) : (
                        filtered(sessions).map(s => <SessionRow key={s.key} s={s} onClick={() => setDetailSession(s)} />)
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail slide-in panel */}
      {detailSession && (
        <SessionDetailPanel
          session={detailSession}
          onClose={() => setDetailSession(null)}
        />
      )}
    </>
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
