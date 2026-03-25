"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import NavRail from "@/components/mission-control/NavRail";
import type { ActivitySession } from "@/app/api/activities/route";
import type { CronGroup } from "@/app/activities/types";
import { ACTIVE_MS } from "@/app/activities/components/shared";
import { Empty } from "@/app/activities/components/Empty";
import { SessionRow } from "@/app/activities/components/SessionRow";
import { SessionDetailPanel } from "@/app/activities/components/SessionDetailPanel";
import { SwarmTraceView } from "@/app/activities/components/SwarmTraceTab";
import { CronCard } from "@/app/activities/components/CronHistoryTab";
import { ScheduleTab } from "@/app/activities/components/ScheduleTab";

// ── page-level types ──────────────────────────────────────────────────────────

type Tab = "active" | "cron" | "tasks" | "all" | "scheduled";

// ── page ──────────────────────────────────────────────────────────────────────

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
