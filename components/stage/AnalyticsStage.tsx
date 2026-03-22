"use client";

import React, { useEffect, useMemo, useState } from "react";
import AnimatedMetricCard from "../analytics/AnimatedMetricCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";

// ─── types ──────────────────────────────────────────────────────────────────

interface CostEntry {
  agentId: string;
  tokens: number;
  estimatedCost: number;
  routerId: string;
  routerLabel: string;
}

interface DailyEntry {
  agentId: string;
  date: string;
  tokens: number;
  estimatedCost: number;
  routerId: string;
  routerLabel: string;
}

interface RouterEntry {
  routerId: string;
  routerLabel: string;
  totalTokens: number;
  estimatedCost: number;
}

interface AnalyticsData {
  costs: CostEntry[];
  daily: DailyEntry[];
  byRouter: RouterEntry[];
}

type View = "agent" | "daily" | "weekly" | "router";

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const COLORS  = [ORANGE, "#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#a855f7", "#14b8a6"];

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
  const weekNum = Math.ceil((d.getTime() - weekStart.getTime()) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function fmtCost(n: number) {
  return n < 0.001 ? `$${(n * 1000).toFixed(3)}m` : `$${n.toFixed(4)}`;
}

function fmtTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
}

// ─── sub-charts ───────────────────────────────────────────────────────────────

function AgentBarChart({ data }: { data: CostEntry[] }) {
  const chartData = [...data]
    .sort((a, b) => b.estimatedCost - a.estimatedCost)
    .slice(0, 20)
    .map((d) => ({ name: d.agentId, cost: d.estimatedCost, tokens: d.tokens }));

  return (
    <div className="w-full h-80 bg-[#111] p-4 rounded-xl border border-[#222]">
      <h3 className="text-[#f0f0f0] mb-3 text-sm font-medium uppercase tracking-widest opacity-60">Cost per Agent (all-time)</h3>
      <ResponsiveContainer width="100%" height="88%">
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis dataKey="name" stroke="#555" tick={{ fontSize: 11 }} />
          <YAxis stroke="#555" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8 }}
            itemStyle={{ color: "#f0f0f0" }}
            formatter={(v: number) => [`$${v.toFixed(6)}`, "Cost"]}
          />
          <Bar dataKey="cost" fill={ORANGE} name="Cost ($)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyChart({ daily, label }: { daily: DailyEntry[]; label: string }) {
  // Aggregate by date (sum all agents)
  const byDate = new Map<string, number>();
  for (const d of daily) {
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.estimatedCost);
  }
  const chartData = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost }));

  // Per-agent breakdown table (top 10)
  const byAgent = new Map<string, number>();
  for (const d of daily) byAgent.set(d.agentId, (byAgent.get(d.agentId) ?? 0) + d.estimatedCost);
  const topAgents = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="w-full h-72 bg-[#111] p-4 rounded-xl border border-[#222]">
        <h3 className="text-[#f0f0f0] mb-3 text-sm font-medium uppercase tracking-widest opacity-60">{label} — Total Cost</h3>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8 }}
              itemStyle={{ color: "#f0f0f0" }}
              formatter={(v: number) => [`$${v.toFixed(6)}`, "Cost"]}
            />
            <Line type="monotone" dataKey="cost" stroke={ORANGE} strokeWidth={2} dot={{ r: 4, fill: ORANGE }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#111] rounded-xl border border-[#222] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="px-4 py-2 text-left text-[#888] font-medium">Agent</th>
              <th className="px-4 py-2 text-right text-[#888] font-medium">Cost</th>
              <th className="px-4 py-2 text-right text-[#888] font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {topAgents.map(([agentId, cost], i) => {
              const tokens = [...daily].filter(d => d.agentId === agentId).reduce((s, d) => s + d.tokens, 0);
              return (
                <tr key={agentId} className="border-b border-[#1a1a1a] hover:bg-[#181818] transition-colors">
                  <td className="px-4 py-2 text-[#f0f0f0] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {agentId}
                  </td>
                  <td className="px-4 py-2 text-right" style={{ color: ORANGE }}>{fmtCost(cost)}</td>
                  <td className="px-4 py-2 text-right text-[#888]">{fmtTokens(tokens)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RouterChart({ byRouter }: { byRouter: RouterEntry[] }) {
  const chartData = byRouter.map((r) => ({ name: r.routerLabel, cost: r.estimatedCost, tokens: r.totalTokens }));
  return (
    <div className="space-y-4">
      <div className="w-full h-72 bg-[#111] p-4 rounded-xl border border-[#222]">
        <h3 className="text-[#f0f0f0] mb-3 text-sm font-medium uppercase tracking-widest opacity-60">Cost per Router</h3>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" stroke="#555" tick={{ fontSize: 12 }} />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8 }}
              itemStyle={{ color: "#f0f0f0" }}
              formatter={(v: number) => [`$${v.toFixed(6)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill={ORANGE} name="Cost ($)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {byRouter.map((r, i) => (
          <div key={r.routerId} className="bg-[#111] rounded-xl border border-[#222] p-4 flex items-center gap-4">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <div className="flex-1 min-w-0">
              <p className="text-[#f0f0f0] font-medium truncate">{r.routerLabel}</p>
              <p className="text-[#888] text-sm">{fmtTokens(r.totalTokens)} tokens</p>
            </div>
            <p className="text-lg font-bold" style={{ color: ORANGE }}>{fmtCost(r.estimatedCost)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const VIEWS: { id: View; label: string }[] = [
  { id: "agent",  label: "By Agent"  },
  { id: "daily",  label: "Daily"     },
  { id: "weekly", label: "Weekly"    },
  { id: "router", label: "By Router" },
];

export default function AnalyticsStage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [view, setView]           = useState<View>("agent");

  useEffect(() => {
    async function fetchCosts() {
      try {
        const res = await fetch("/api/telemetry/agent-costs");
        if (!res.ok) throw new Error("Failed to load telemetry data");
        setAnalytics(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
    const interval = setInterval(fetchCosts, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── derived data ────────────────────────────────────────────────────────────

  const totalCost   = useMemo(() => (analytics?.costs ?? []).reduce((s, c) => s + c.estimatedCost, 0), [analytics]);
  const totalTokens = useMemo(() => (analytics?.costs ?? []).reduce((s, c) => s + c.tokens, 0), [analytics]);
  const topAgent    = useMemo(() => [...(analytics?.costs ?? [])].sort((a, b) => b.estimatedCost - a.estimatedCost)[0], [analytics]);

  // Today's spend
  const today = new Date().toISOString().split("T")[0];
  const todayEntries  = useMemo(() => (analytics?.daily ?? []).filter(d => d.date === today), [analytics, today]);
  const todayCost     = useMemo(() => todayEntries.reduce((s, d) => s + d.estimatedCost, 0), [todayEntries]);

  // Weekly data
  const weeklyDaily = useMemo(() => {
    if (!analytics) return [];
    const cutoff = new Date(Date.now() - 28 * 86400000).toISOString().split("T")[0];
    return analytics.daily.filter(d => d.date >= cutoff);
  }, [analytics]);

  const weeklyGrouped = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const d of weeklyDaily) {
      const w = isoWeek(d.date);
      byWeek.set(w, (byWeek.get(w) ?? 0) + d.estimatedCost);
    }
    return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));
  }, [weeklyDaily]);

  // Last 14 days for daily chart
  const dailyRecent = useMemo(() => {
    if (!analytics) return [];
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
    return analytics.daily.filter(d => d.date >= cutoff);
  }, [analytics]);

  // ── render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="mc-stage flex items-center justify-center" style={{ gridColumn: "span 2", flex: 1, backgroundColor: "var(--mc-bg-stage, #0a0a0a)" }}>
      <p className="text-[#e85d27] animate-pulse">Loading Analytics…</p>
    </div>
  );
  if (error) return (
    <div className="mc-stage flex items-center justify-center" style={{ gridColumn: "span 2", flex: 1, backgroundColor: "var(--mc-bg-stage, #0a0a0a)" }}>
      <p className="text-red-500">{error}</p>
    </div>
  );

  return (
    <div className="mc-stage" style={{ gridColumn: "span 2", flex: 1, backgroundColor: "var(--mc-bg-stage, #0a0a0a)", color: "#f0f0f0" }}>
      <div className="h-full overflow-y-auto custom-scrollbar p-8 w-full space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white tracking-tight">Token &amp; Cost Analytics</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AnimatedMetricCard title="Total Cost"    prefix="$" value={totalCost}   decimals={4} />
          <AnimatedMetricCard title="Total Tokens"  value={totalTokens} />
          <AnimatedMetricCard title="Today's Cost"  prefix="$" value={todayCost}   decimals={4} />
          <AnimatedMetricCard title="Top Spender"   prefix="$" value={topAgent?.estimatedCost ?? 0} decimals={4}
            suffix={topAgent ? ` (${topAgent.agentId})` : ""} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#111] border border-[#222] rounded-lg p-1 w-fit">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
              style={view === id
                ? { backgroundColor: ORANGE, color: "#fff" }
                : { color: "#888" }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chart area */}
        {view === "agent"  && <AgentBarChart data={analytics?.costs ?? []} />}
        {view === "daily"  && <DailyChart daily={dailyRecent}  label="Last 14 Days" />}
        {view === "weekly" && (
          <div className="space-y-4">
            <div className="w-full h-72 bg-[#111] p-4 rounded-xl border border-[#222]">
              <h3 className="text-[#f0f0f0] mb-3 text-sm font-medium uppercase tracking-widest opacity-60">Weekly Cost (last 4 weeks)</h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={weeklyGrouped} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#555" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111", border: `1px solid ${ORANGE}`, borderRadius: 8 }}
                    itemStyle={{ color: "#f0f0f0" }}
                    formatter={(v: number) => [`$${v.toFixed(6)}`, "Cost"]}
                  />
                  <Bar dataKey="cost" fill={ORANGE} name="Cost ($)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DailyChart daily={weeklyDaily} label="Last 28 Days — Agent Breakdown" />
          </div>
        )}
        {view === "router" && <RouterChart byRouter={analytics?.byRouter ?? []} />}

      </div>
    </div>
  );
}
