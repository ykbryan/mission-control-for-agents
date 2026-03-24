"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── types ────────────────────────────────────────────────────────────────────

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

type View = "agents" | "daily" | "weekly" | "routers";

// ─── helpers ──────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const GREEN  = "#22c55e";
const RED    = "#ef4444";
const COLORS = [ORANGE, "#8b5cf6", "#38bdf8", "#f59e0b", "#ec4899", "#14b8a6", "#a3e635", "#fb923c"];

function fmtCost(n: number): string {
  if (n === 0) return "$0.0000";
  if (n < 0.0001) return `< $0.0001`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(s: string): string {
  const d = new Date(s + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dow  = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (dow - 1) * 86400000);
  const weekNum   = Math.ceil((d.getTime() - weekStart.getTime()) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

function trendBadge(pct: number | null) {
  if (pct === null) return null;
  const up   = pct >= 0;
  const color = up ? RED : GREEN; // spending more = red for founder
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      fontSize: "11px", fontWeight: 600, padding: "2px 7px",
      borderRadius: "20px",
      backgroundColor: up ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
      color,
    }}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}% vs prev period
    </span>
  );
}

// ─── custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f0f12", border: "1px solid #1e1e26",
      borderRadius: "8px", padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      <p style={{ color: "#666", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {typeof label === "string" && label.length === 10 ? fmtDate(label) : label}
      </p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? ORANGE, fontFamily: "ui-monospace,monospace", fontWeight: 700, fontSize: "14px", margin: 0 }}>
          {typeof p.value === "number" ? `$${p.value.toFixed(6)}` : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── kpi card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = ORANGE, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  trend?: number | null;
}) {
  return (
    <div style={{
      background: "#0f0f12", border: "1px solid #1e1e26",
      borderTop: `2px solid ${accent}`,
      borderRadius: "10px", padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: 0 }}>{label}</p>
      <p style={{ fontSize: "28px", fontWeight: 700, fontFamily: "ui-monospace,monospace", color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ fontSize: "11px", color: "#555", margin: 0 }}>{sub}</p>}
      {trend !== undefined && trend !== null && trendBadge(trend)}
    </div>
  );
}

// ─── section header ───────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: "0 0 14px 0" }}>
      {children}
    </p>
  );
}

// ─── agent table ──────────────────────────────────────────────────────────────

function AgentTable({ rows, totalCost }: { rows: { agentId: string; tokens: number; cost: number; router: string; lastDate?: string }[]; totalCost: number }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e1e26" }}>
            {["#", "Agent", "Router", "Tokens", "Cost", "Share"].map((h, i) => (
              <th key={h} style={{
                padding: i === 0 ? "9px 10px 9px 20px" : i === 5 ? "9px 20px 9px 10px" : "9px 10px",
                textAlign: i >= 3 ? "right" : "left",
                color: "#444", fontWeight: 600, fontSize: "10px",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row, i) => {
            const share = totalCost > 0 ? (row.cost / totalCost) * 100 : 0;
            return (
              <tr key={row.agentId}
                onMouseEnter={() => setHovered(row.agentId)}
                onMouseLeave={() => setHovered(null)}
                style={{ borderBottom: "1px solid #13131a", backgroundColor: hovered === row.agentId ? "#131318" : "transparent", transition: "background 0.12s" }}
              >
                <td style={{ padding: "9px 10px 9px 20px", color: "#333", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{i + 1}</td>
                <td style={{ padding: "9px 10px", color: "#d0d0d0", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.agentId}</td>
                <td style={{ padding: "9px 10px", color: "#555", fontSize: "11px" }}>{row.router}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: "#666", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{fmtTokens(row.tokens)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace,monospace", fontSize: "12px", fontWeight: 600 }}>{fmtCost(row.cost)}</td>
                <td style={{ padding: "9px 20px 9px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ color: "#555", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{share.toFixed(1)}%</span>
                    <div style={{ width: "52px", height: "3px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", background: ORANGE, borderRadius: "2px" }} />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#333" }}>No data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView]       = useState<View>("agents");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/telemetry/agent-costs");
      if (!res.ok) throw new Error("Failed to load telemetry");
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  // ── derived values ──────────────────────────────────────────────────────────

  const totalCost   = useMemo(() => (data?.costs ?? []).reduce((s, c) => s + c.estimatedCost, 0), [data]);
  const totalTokens = useMemo(() => (data?.costs ?? []).reduce((s, c) => s + c.tokens, 0), [data]);

  // Daily 14-day window
  const daily14 = useMemo(() => {
    const cutoff = daysAgo(14);
    return (data?.daily ?? []).filter(d => d.date >= cutoff);
  }, [data]);

  // Daily area series
  const areaSeries = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of daily14) m.set(d.date, (m.get(d.date) ?? 0) + d.estimatedCost);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cost]) => ({ date, cost }));
  }, [daily14]);

  // Trend: last 7 vs prior 7 days
  const trend7 = useMemo(() => {
    const c7 = daysAgo(7);
    const c14 = daysAgo(14);
    const thisWeek = (data?.daily ?? []).filter(d => d.date >= c7).reduce((s, d) => s + d.estimatedCost, 0);
    const lastWeek = (data?.daily ?? []).filter(d => d.date >= c14 && d.date < c7).reduce((s, d) => s + d.estimatedCost, 0);
    if (lastWeek === 0) return null;
    return ((thisWeek - lastWeek) / lastWeek) * 100;
  }, [data]);

  // Run rate (monthly projection)
  const runRate = useMemo(() => {
    const cutoff = daysAgo(30);
    const recent = (data?.daily ?? []).filter(d => d.date >= cutoff);
    if (!recent.length) return 0;
    const days = new Set(recent.map(d => d.date)).size || 1;
    const sum  = recent.reduce((s, d) => s + d.estimatedCost, 0);
    return (sum / days) * 30;
  }, [data]);

  // Daily burn (avg last 7 days)
  const dailyBurn = useMemo(() => {
    const cutoff = daysAgo(7);
    const recent = (data?.daily ?? []).filter(d => d.date >= cutoff);
    if (!recent.length) return 0;
    const days = new Set(recent.map(d => d.date)).size || 1;
    return recent.reduce((s, d) => s + d.estimatedCost, 0) / days;
  }, [data]);

  // Top 12 agents
  const top12 = useMemo(() =>
    [...(data?.costs ?? [])].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 12),
  [data]);

  // Top 12 for daily tab (last 14 days)
  const top12Daily = useMemo(() => {
    const m = new Map<string, { tokens: number; cost: number; router: string; lastDate: string }>();
    for (const d of daily14) {
      const e = m.get(d.agentId);
      if (e) { e.tokens += d.tokens; e.cost += d.estimatedCost; if (d.date > e.lastDate) e.lastDate = d.date; }
      else m.set(d.agentId, { tokens: d.tokens, cost: d.estimatedCost, router: d.routerLabel, lastDate: d.date });
    }
    return [...m.entries()]
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 12);
  }, [daily14]);

  // Weekly (6 weeks)
  const weekly6 = useMemo(() => {
    const cutoff = daysAgo(42);
    const filtered = (data?.daily ?? []).filter(d => d.date >= cutoff);
    const m = new Map<string, number>();
    for (const d of filtered) {
      const w = isoWeek(d.date);
      m.set(w, (m.get(w) ?? 0) + d.estimatedCost);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, cost]) => ({ week, cost }));
  }, [data]);

  // Top 12 for weekly tab
  const top12Weekly = useMemo(() => {
    const cutoff = daysAgo(42);
    const filtered = (data?.daily ?? []).filter(d => d.date >= cutoff);
    const m = new Map<string, { tokens: number; cost: number; router: string }>();
    for (const d of filtered) {
      const e = m.get(d.agentId);
      if (e) { e.tokens += d.tokens; e.cost += d.estimatedCost; }
      else m.set(d.agentId, { tokens: d.tokens, cost: d.estimatedCost, router: d.routerLabel });
    }
    return [...m.entries()].map(([agentId, v]) => ({ agentId, ...v })).sort((a, b) => b.cost - a.cost).slice(0, 12);
  }, [data]);

  // Router data
  const byRouter = data?.byRouter ?? [];
  const routerTotal = byRouter.reduce((s, r) => s + r.estimatedCost, 0);

  // ── render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: ORANGE, fontFamily: "ui-monospace,monospace", fontSize: "13px", opacity: 0.7 }}>Loading billing data…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: RED, fontFamily: "ui-monospace,monospace", fontSize: "13px" }}>{error}</p>
    </div>
  );

  const VIEWS: { id: View; label: string }[] = [
    { id: "agents",  label: "By Agent"  },
    { id: "daily",   label: "Last 14 Days" },
    { id: "weekly",  label: "Last 6 Weeks" },
    { id: "routers", label: "By Router"  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

      {/* Top nav */}
      <div style={{ borderBottom: "1px solid #1a1a22", background: "#060608", padding: "0 40px", display: "flex", alignItems: "center", height: "52px", gap: "16px" }}>
        <a href="/" style={{ color: "#444", fontSize: "13px", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Mission Control
        </a>
        <span style={{ color: "#222" }}>/</span>
        <span style={{ color: "#888", fontSize: "13px", fontWeight: 500 }}>Billing</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#333", fontSize: "11px", fontFamily: "ui-monospace,monospace" }}>
          Updated {lastRefresh.toLocaleTimeString()}
        </span>
        <button
          onClick={() => fetchData()}
          disabled={refreshing}
          style={{
            background: "transparent", border: "1px solid #1e1e26",
            color: "#555", borderRadius: "6px", padding: "5px 12px",
            fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "36px 40px", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* Page header */}
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f0f0f0", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>Cost Intelligence</h1>
          <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>Real-time spend tracking across your AI agent fleet</p>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="All-Time Spend"    value={fmtCost(totalCost)}      sub={`${fmtTokens(totalTokens)} tokens total`} accent={ORANGE} trend={trend7} />
          <KpiCard label="30-Day Run Rate"   value={fmtCost(runRate)}         sub="projected / month"                        accent={GREEN} />
          <KpiCard label="Daily Burn"        value={fmtCost(dailyBurn)}       sub="avg last 7 days"                          accent="#8b5cf6" />
          <KpiCard label="Active Agents"     value={String((data?.costs ?? []).filter(c => c.estimatedCost > 0).length)} sub="with recorded spend" accent="#38bdf8" />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "4px", background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                padding: "7px 18px", borderRadius: "6px", border: "none", cursor: "pointer",
                fontSize: "12px", fontWeight: 600,
                background: view === v.id ? ORANGE : "transparent",
                color: view === v.id ? "#fff" : "#555",
                transition: "all 0.15s",
              }}
            >{v.label}</button>
          ))}
        </div>

        {/* ── By Agent ── */}
        {view === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
              <SectionHead>Cost trend — last 14 days</SectionHead>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={areaSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={ORANGE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={ORANGE} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                  <XAxis dataKey="date" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} tickFormatter={fmtDate} />
                  <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="cost" stroke={ORANGE} strokeWidth={2} fill="url(#aGrad)" dot={false} activeDot={{ r: 4, fill: ORANGE, stroke: "#0f0f12", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <SectionHead>Top 12 spenders — all time</SectionHead>
            <AgentTable
              rows={top12.map(c => ({ agentId: c.agentId, tokens: c.tokens, cost: c.estimatedCost, router: c.routerLabel }))}
              totalCost={totalCost}
            />
          </div>
        )}

        {/* ── Daily (last 14 days) ── */}
        {view === "daily" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
              <SectionHead>Daily cost — last 14 days</SectionHead>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={areaSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={ORANGE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={ORANGE} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                  <XAxis dataKey="date" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} tickFormatter={fmtDate} />
                  <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="cost" stroke={ORANGE} strokeWidth={2} fill="url(#dGrad)" dot={false} activeDot={{ r: 4, fill: ORANGE, stroke: "#0f0f12", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <SectionHead>Top 12 spenders — last 14 days</SectionHead>
            <AgentTable
              rows={top12Daily.map(c => ({ agentId: c.agentId, tokens: c.tokens, cost: c.cost, router: c.router, lastDate: c.lastDate }))}
              totalCost={top12Daily.reduce((s, c) => s + c.cost, 0)}
            />
          </div>
        )}

        {/* ── Weekly (last 6 weeks) ── */}
        {view === "weekly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
              <SectionHead>Weekly cost — last 6 weeks</SectionHead>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weekly6} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                  <XAxis dataKey="week" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} />
                  <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cost" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <SectionHead>Top 12 spenders — last 6 weeks</SectionHead>
            <AgentTable
              rows={top12Weekly.map(c => ({ agentId: c.agentId, tokens: c.tokens, cost: c.cost, router: c.router }))}
              totalCost={top12Weekly.reduce((s, c) => s + c.cost, 0)}
            />
          </div>
        )}

        {/* ── By Router ── */}
        {view === "routers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {byRouter.length <= 1 ? (
              <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "#333", fontSize: "13px", margin: "0 0 6px 0" }}>Only one router connected</p>
                <p style={{ color: "#222", fontSize: "12px", margin: 0 }}>Add more routers from the Connections Manager to compare gateway spend.</p>
              </div>
            ) : (
              <>
                <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
                  <SectionHead>Cost per router — all time</SectionHead>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byRouter.map(r => ({ name: r.routerLabel, cost: r.estimatedCost }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                      <XAxis dataKey="name" stroke="#333" tick={{ fontSize: 12, fill: "#555" }} tickLine={false} axisLine={{ stroke: "#222" }} />
                      <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="cost" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={80} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
                  {byRouter.map((r, i) => {
                    const share = routerTotal > 0 ? (r.estimatedCost / routerTotal) * 100 : 0;
                    return (
                      <div key={r.routerId} style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderTop: `2px solid ${COLORS[i % COLORS.length]}`, borderRadius: "10px", padding: "20px 22px" }}>
                        <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: "0 0 10px 0" }}>{r.routerLabel}</p>
                        <p style={{ fontSize: "28px", fontWeight: 700, fontFamily: "ui-monospace,monospace", color: "#f0f0f0", margin: "0 0 4px 0" }}>{fmtCost(r.estimatedCost)}</p>
                        <p style={{ fontSize: "11px", color: "#555", margin: "0 0 12px 0" }}>{fmtTokens(r.totalTokens)} tokens</p>
                        <div style={{ width: "100%", height: "3px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: "2px" }} />
                        </div>
                        <p style={{ fontSize: "11px", color: "#444", margin: "6px 0 0 0", fontFamily: "ui-monospace,monospace" }}>{share.toFixed(1)}% of total spend</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
