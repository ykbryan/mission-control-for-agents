"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import NavRail from "@/components/mission-control/NavRail";
import type { ActivitySession } from "@/app/api/activities/route";
import type { ScheduledJob, JobValidity } from "@/app/api/cron-schedule/route";

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

  function normaliseLogs(data: unknown): LogEntry[] {
    return (Array.isArray(data) ? data : []).map((e: LogEntry) => {
      if (e.type !== "info") return e;
      // User messages (💬) and agent replies (🤖) both belong in the Chats tab
      if (e.message.startsWith("💬") || e.message.startsWith("🤖")) {
        return { ...e, type: "chat" as LogType };
      }
      return e;
    });
  }

  // fetch logs on session change
  useEffect(() => {
    setLoadingLogs(true);
    setLogs([]);
    setFilter("all");

    const params = new URLSearchParams({ agent: session.agentId, routerId: session.routerId });
    params.set("sessionKey", session.key);

    fetch(`/api/agent-session?${params}`)
      .then(r => r.json())
      .then(data => setLogs(normaliseLogs(data)))
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, [session.key, session.agentId, session.routerId]);

  // live polling when session is active
  const isActive = Date.now() - session.updatedAt < ACTIVE_MS;
  useEffect(() => {
    if (!isActive) return;
    const poll = () => {
      const params = new URLSearchParams({ agent: session.agentId, routerId: session.routerId });
      params.set("sessionKey", session.key);
      fetch(`/api/agent-session?${params}`)
        .then(r => r.json())
        .then(data => {
          const next = normaliseLogs(data);
          setLogs(prev => next.length !== prev.length ? next : prev);
        })
        .catch(() => {});
    };
    const iv = setInterval(poll, 3_000);
    return () => clearInterval(iv);
  }, [isActive, session.key, session.agentId, session.routerId]);

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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4ade80", background: "rgba(74,222,128,0.08)", padding: "1px 8px 1px 6px", borderRadius: "3px" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" }} />
                    Live
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

// ── swarm trace view ──────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  type: "info" | "error" | "memory" | "chat";
  message: string;
  fullMessage?: string;
  timestamp: string;
  model?: string;
}

interface SwarmChainStep {
  sessions: ActivitySession[];
  timestamp: number;
  label: string;
}

interface SwarmChain {
  root: ActivitySession;
  steps: SwarmChainStep[];
}

function extractSpawnedAgentIds(events: ActivityEvent[]): string[] {
  const spawned: string[] = [];
  for (const e of events) {
    const msg = e.fullMessage ?? e.message ?? '';
    if (!msg.includes('sessions_spawn')) continue;
    const match = msg.match(/sessions_spawn\((\{[\s\S]*?\})\)/);
    if (match) {
      try {
        const args = JSON.parse(match[1]);
        if (args.agentId) spawned.push(args.agentId);
      } catch { /* ignore parse errors */ }
    }
  }
  return spawned;
}

function extractLastActivity(events: ActivityEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const msg = (e.fullMessage ?? e.message ?? '').trim();
    if (!msg || msg.length < 10) continue;
    // Prefer agent/user chat messages
    if (msg.startsWith('🤖') || msg.startsWith('💬')) {
      return msg.replace(/^[🤖💬]\s*/, '').slice(0, 120);
    }
    // Skip system noise
    if (msg.startsWith('[') || msg.startsWith('{') || msg.includes('tool_use')) continue;
    if (msg.length > 15) return msg.slice(0, 120);
  }
  return undefined;
}

// Find the first user (💬) message — the task that was assigned
function extractTaskMessage(events: ActivityEvent[]): string | undefined {
  for (const e of events) {
    const msg = (e.fullMessage ?? e.message ?? '').trim();
    if (msg.startsWith('💬')) {
      return msg.replace(/^💬\s*/, '').slice(0, 200);
    }
  }
  return undefined;
}

function SwarmTraceView({
  activeSessions,
  allSessions,
  onOpen,
}: {
  activeSessions: ActivitySession[];
  allSessions: ActivitySession[];
  onOpen: (s: ActivitySession) => void;
}) {
  const [chains, setChains] = useState<SwarmChain[]>([]);
  const [orphans, setOrphans] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionSummaries, setSessionSummaries] = useState<Map<string, string>>(new Map());
  const [taskMessages, setTaskMessages] = useState<Map<string, string>>(new Map());
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Prefer telegram sessions as roots (triggered by external message);
    // fall back to any active main sessions if no telegram roots found
    const telegramRoots = activeSessions.filter(s => s.type === "telegram");
    const roots = telegramRoots.length > 0
      ? telegramRoots
      : activeSessions.filter(s => s.type === "main");

    if (roots.length === 0) {
      setChains([]);
      setOrphans(activeSessions);
      setLoading(false);
      return;
    }

    // Only show spinner on first load; subsequent rebuilds (every 5s poll) are silent.
    if (!hasLoadedRef.current) setLoading(true);

    async function buildChains() {
      const builtChains: SwarmChain[] = [];
      const claimedKeys = new Set<string>();
      const summaries = new Map<string, string>();
      const tasks = new Map<string, string>();

      for (const root of roots) {
        claimedKeys.add(root.key);
        try {
          const params = new URLSearchParams({
            agent: root.agentId,
            routerId: root.routerId,
            sessionKey: root.key,
          });
          const res = await fetch(`/api/agent-session?${params}`);
          const events: ActivityEvent[] = await res.json();

          // Capture task description (first user message) and current activity
          const taskMsg = extractTaskMessage(events);
          if (taskMsg) tasks.set(root.key, taskMsg);
          const rootSummary = extractLastActivity(events);
          if (rootSummary) summaries.set(root.key, rootSummary);

          const spawnedIds = extractSpawnedAgentIds(events);

          // Deduplicate spawned agent IDs (preserve order)
          const seenIds = new Set<string>();
          const uniqueSpawnedIds: string[] = [];
          for (const id of spawnedIds) {
            if (!seenIds.has(id)) {
              seenIds.add(id);
              uniqueSpawnedIds.push(id);
            }
          }

          // Time window: root.updatedAt - 2h to now
          const windowStart = root.updatedAt - 2 * 60 * 60 * 1000;
          const windowEnd = Date.now();

          // Group spawned sessions by agentId in order
          const stepMap = new Map<string, ActivitySession[]>();
          for (const agentId of uniqueSpawnedIds) {
            const matched = allSessions.filter(
              s =>
                s.agentId === agentId &&
                s.updatedAt >= windowStart &&
                s.updatedAt <= windowEnd
            ).sort((a, b) => a.updatedAt - b.updatedAt);
            if (matched.length > 0) {
              stepMap.set(agentId, matched);
              for (const m of matched) claimedKeys.add(m.key);
            }
          }

          // Always add timing-based candidates that weren't detected via sessions_spawn.
          // Any active session started within 5 min of root and not yet claimed counts as a delegate.
          if (roots.length === 1) {
            const rootKeys = new Set(roots.map(r => r.key));
            const candidates = activeSessions.filter(s =>
              !rootKeys.has(s.key) &&
              !stepMap.has(s.agentId) &&
              Math.abs(s.updatedAt - root.updatedAt) < 15 * 60 * 1000
            );
            for (const c of candidates) {
              stepMap.set(c.agentId, [c]);
              claimedKeys.add(c.key);
            }
          }

          const steps: SwarmChainStep[] = uniqueSpawnedIds.length > 0
            ? Array.from(stepMap.entries()).map(([id, sessions]) => ({
                sessions, timestamp: sessions[0].updatedAt, label: id,
              }))
            : Array.from(stepMap.entries()).map(([id, sessions]) => ({
                sessions, timestamp: sessions[0].updatedAt, label: id,
              }));

          builtChains.push({ root, steps });
        } catch {
          builtChains.push({ root, steps: [] });
        }
      }

      // Fetch summaries for all delegate sessions in parallel
      const allDelegateSessions = builtChains.flatMap(c =>
        c.steps.flatMap(s => s.sessions)
      );
      await Promise.all(allDelegateSessions.map(async s => {
        try {
          const p = new URLSearchParams({ agent: s.agentId, routerId: s.routerId, sessionKey: s.key });
          const r = await fetch(`/api/agent-session?${p}`);
          const ev: ActivityEvent[] = await r.json();
          const sum = extractLastActivity(ev);
          if (sum) summaries.set(s.key, sum);
        } catch { /* ignore */ }
      }));

      setSessionSummaries(summaries);

      // Sessions not part of any chain
      const remainingOrphans = activeSessions.filter(s => !claimedKeys.has(s.key));
      hasLoadedRef.current = true;
      setTaskMessages(tasks);
      setChains(builtChains);
      setOrphans(remainingOrphans);
      setLoading(false);
    }

    buildChains();
  }, [activeSessions, allSessions]);

  // Poll summaries every 5s for any active session in the chains
  useEffect(() => {
    const liveKeys = [
      ...chains.filter(c => Date.now() - c.root.updatedAt < ACTIVE_MS).map(c => c.root),
      ...chains.flatMap(c => c.steps.flatMap(s => s.sessions)).filter(s => Date.now() - s.updatedAt < ACTIVE_MS),
    ];
    if (liveKeys.length === 0) return;
    const poll = async () => {
      const updates = new Map<string, string>();
      await Promise.all(liveKeys.map(async s => {
        try {
          const p = new URLSearchParams({ agent: s.agentId, routerId: s.routerId, sessionKey: s.key });
          const r = await fetch(`/api/agent-session?${p}`);
          const ev: ActivityEvent[] = await r.json();
          const sum = extractLastActivity(ev);
          if (sum) updates.set(s.key, sum);
        } catch { /* ignore */ }
      }));
      if (updates.size > 0) setSessionSummaries(prev => new Map([...prev, ...updates]));
    };
    const iv = setInterval(poll, 5_000);
    return () => clearInterval(iv);
  }, [chains]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div
          className="w-4 h-4 rounded-full border-2 animate-spin"
          style={{ borderColor: "#222", borderTopColor: "#e85d27" }}
        />
        <span className="text-xs text-zinc-600">Building swarm traces…</span>
      </div>
    );
  }

  if (chains.length === 0 && orphans.length === 0) {
    return <Empty label="No active sessions to trace" />;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {chains.map(chain => {
        const rootActive = Date.now() - chain.root.updatedAt < ACTIVE_MS;
        const ts = typeStyle(chain.root.type);
        const allDelegates = chain.steps.flatMap(s => s.sessions);
        const taskMsg = taskMessages.get(chain.root.key);
        const activeCount = allDelegates.filter(s => Date.now() - s.updatedAt < ACTIVE_MS).length;
        const doneCount = allDelegates.length - activeCount;
        return (
          <div
            key={chain.root.key}
            className="rounded-lg border overflow-hidden"
            style={{ background: "#0c0c0e", borderColor: "#1e1e28" }}
          >
            {/* Task banner */}
            {taskMsg && (
              <div className="px-4 pt-3 pb-2" style={{ borderBottom: "1px solid #111", background: "#09090d" }}>
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5 flex-shrink-0" style={{ color: "#e85d2760" }}>Task</span>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#c0b0a0" }}>
                    {taskMsg.length > 180 ? taskMsg.slice(0, 180) + "…" : taskMsg}
                  </p>
                </div>
              </div>
            )}

            {/* Root agent row */}
            <button
              onClick={() => onOpen(chain.root)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid #1a1a22" }}
            >
              <span className="text-base flex-shrink-0">{chain.root.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold" style={{ color: "#e85d27" }}>
                    {chain.root.agentId}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-px rounded ${ts.bg} ${ts.text}`}>
                    {chain.root.label}
                  </span>
                  {rootActive ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Done</span>
                  )}
                  <span className="text-[10px] text-zinc-700">{timeAgo(chain.root.updatedAt)}</span>
                </div>
              </div>
              {allDelegates.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-3 text-right">
                  {activeCount > 0 && (
                    <span className="text-[10px] text-emerald-500">{activeCount} working</span>
                  )}
                  {doneCount > 0 && (
                    <span className="text-[10px] text-zinc-600">{doneCount} done</span>
                  )}
                  <span className="text-[10px] text-zinc-700">↗</span>
                </div>
              )}
            </button>

            {/* Team status bar */}
            {allDelegates.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#080810", borderBottom: "1px solid #111" }}>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#e85d2750" }}>Team</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {allDelegates.map(s => {
                    const sActive = Date.now() - s.updatedAt < ACTIVE_MS;
                    return (
                      <span
                        key={s.key}
                        className="flex items-center gap-1 text-[10px] px-1.5 py-px rounded"
                        style={{ background: sActive ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)", color: sActive ? "#4ade8099" : "#444" }}
                      >
                        {s.icon} {s.agentId}
                        {sActive && <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delegate grid */}
            {allDelegates.length > 0 && (
              <div className="p-3 grid grid-cols-2 gap-2">
                {allDelegates.map(s => {
                  const sActive = Date.now() - s.updatedAt < ACTIVE_MS;
                  const summary = sessionSummaries.get(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => onOpen(s)}
                      className="group text-left rounded-md p-3 hover:bg-white/[0.04] transition-colors"
                      style={{ background: "#0f0f14", border: "1px solid #1a1a22" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base flex-shrink-0">{s.icon}</span>
                        <span className="text-xs font-semibold text-zinc-200">{s.agentId}</span>
                        {sActive ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="text-[9px] text-zinc-600">✓ Done</span>
                        )}
                        <span className="ml-auto text-[9px] text-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </div>
                      {summary ? (
                        <div className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "#6a6a8a" }}>
                          {summary}
                        </div>
                      ) : (
                        <div className="text-[10px] text-zinc-800 italic">
                          {sActive ? "Working…" : timeAgo(s.updatedAt)}
                        </div>
                      )}
                      {s.totalTokens > 0 && (
                        <div className="text-[9px] font-mono text-zinc-800 mt-1.5">{fmtTokens(s.totalTokens)} tok</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {allDelegates.length === 0 && (
              <div className="px-4 py-2 text-[10px] text-zinc-800 italic">
                No delegates detected yet
              </div>
            )}
          </div>
        );
      })}

      {/* Orphan sessions not part of any chain */}
      {orphans.length > 0 && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 px-1 mt-2">
            Other active sessions
          </div>
          {orphans.map(s => (
            <SessionRow key={s.key} s={s} onClick={() => onOpen(s)} />
          ))}
        </>
      )}
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

// ── scheduled jobs tab ────────────────────────────────────────────────────────

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

// ── category helpers ───────────────────────────────────────────────────────────

const CATEGORY_CFG = {
  monitoring:    { label: "Active Monitoring",   icon: "⏱️", order: 0, accent: "#3b82f6" },
  orchestration: { label: "Swarm Orchestration", icon: "🔄", order: 1, accent: "#a855f7" },
  memory:        { label: "Memory & System",     icon: "🧠", order: 2, accent: "#22d3ee" },
  general:       { label: "General",             icon: "⚙️", order: 3, accent: "#6b7280" },
} as const;
type Category = keyof typeof CATEGORY_CFG;

function inferCategory(job: ScheduledJob): Category {
  // Only categorize from real content — skip template placeholder text
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

function ScheduleTab({ agentFilter }: { agentFilter: string }) {
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

// ── main page ─────────────────────────────────────────────────────────────────

type Tab = "active" | "cron" | "tasks" | "all" | "scheduled";

export default function ActivitiesPage() {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("scheduled");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [detailSession, setDetailSession] = useState<ActivitySession | null>(null);
  const [swarmTrace, setSwarmTrace] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/activities");
        const data = await res.json();
        const fresh: ActivitySession[] = data.sessions ?? [];
        setSessions(fresh);
        // keep detail panel in sync if open
        setDetailSession(prev => {
          if (!prev) return null;
          const updated = fresh.find(s => s.key === prev.key);
          return updated ?? prev;
        });
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
    const iv = setInterval(load, 5_000);
    return () => clearInterval(iv);
  }, []);

  // Auto-switch to Active Now on first load if there are active sessions
  const hasAutoSwitched = useRef(false);
  useEffect(() => {
    if (loading || hasAutoSwitched.current) return;
    const activeCount = sessions.filter(s => Date.now() - s.updatedAt < ACTIVE_MS).length;
    if (activeCount > 0) { setTab("active"); hasAutoSwitched.current = true; }
  }, [loading, sessions]);

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
    { key: "scheduled", label: "Scheduled Crons", count: -1 },
    { key: "active",    label: "Active Now",      count: active.length },
    { key: "cron",      label: "Cron History",    count: cronGroups.length },
    { key: "tasks",     label: "Delegated Tasks", count: tasks.length },
    { key: "all",       label: "All Activity",    count: sessions.length },
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
          <span style={{ fontSize: "11px", color: "#333", fontFamily: "monospace" }}>↻ 5s</span>
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
                    className={`inline-flex items-center gap-1.5 rounded-md transition-all ${
                      tab === t.key
                        ? "px-3 py-[5px] text-[11px] font-medium bg-[#1a1a1a] text-white border border-[#2e2e2e]"
                        : "px-3 py-[6px] text-[11px] font-medium text-zinc-600 hover:text-zinc-300 hover:bg-[#111]"
                    }`}
                  >
                    {t.label}
                    {t.count >= 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-px rounded ${tab === t.key ? "bg-[#2a2a2a] text-zinc-400" : "text-zinc-700"}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* Swarm Trace toggle (Active Now only) */}
              {tab === "active" && (
                <button
                  onClick={() => setSwarmTrace(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded border transition-all ${
                    swarmTrace
                      ? "bg-orange-500/15 border-orange-500/30 text-orange-400 font-medium"
                      : "bg-[#111] border-[#1e1e1e] text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  🔗 Trace
                </button>
              )}

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
                      {swarmTrace ? (
                        <SwarmTraceView
                          activeSessions={filtered(active)}
                          allSessions={sessions}
                          onOpen={setDetailSession}
                        />
                      ) : (
                        filtered(active).length === 0 ? (
                          <Empty label="No active sessions in the last 10 minutes" />
                        ) : (
                          filtered(active).map(s => <SessionRow key={s.key} s={s} onClick={() => setDetailSession(s)} />)
                        )
                      )}
                    </div>
                  )}

                  {/* Scheduled Crons */}
                  {tab === "scheduled" && (
                    <ScheduleTab agentFilter={agentFilter} />
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
