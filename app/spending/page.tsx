"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import NavRail from "@/components/mission-control/NavRail";
import { fmtCost, fmtTokens, fmtDate, isoWeek } from "@/lib/formatters";

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

interface ModelEntry {
  model: string;
  totalTokens: number;
  estimatedCost: number;
}

interface AnalyticsData {
  costs: CostEntry[];
  daily: DailyEntry[];
  byRouter: RouterEntry[];
  byModel: ModelEntry[];
}

type View = "agents" | "routers" | "models" | "providers";

type Period = "1d" | "7d" | "14d" | "6w" | "all";

const PERIODS: { id: Period; label: string; days: number | null }[] = [
  { id: "1d",  label: "1D",  days: 1  },
  { id: "7d",  label: "7D",  days: 7  },
  { id: "14d", label: "14D", days: 14 },
  { id: "6w",  label: "6W",  days: 42 },
  { id: "all", label: "All", days: null },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const GREEN  = "#22c55e";
const RED    = "#ef4444";
const COLORS = [ORANGE, "#8b5cf6", "#38bdf8", "#f59e0b", "#ec4899", "#14b8a6", "#a3e635", "#fb923c"];

// Derive provider from model name
function modelToProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude"))  return "Anthropic";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4")) return "OpenAI";
  if (m.includes("gemini"))  return "Google";
  if (m.includes("mistral") || m.includes("mixtral")) return "Mistral";
  if (m.includes("llama") || m.includes("meta"))      return "Meta";
  if (m.includes("deepseek")) return "DeepSeek";
  if (m.includes("grok"))    return "xAI";
  return "Other";
}

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: "#e85d27",
  OpenAI:    "#10b981",
  Google:    "#38bdf8",
  Mistral:   "#8b5cf6",
  Meta:      "#f59e0b",
  DeepSeek:  "#ec4899",
  xAI:       "#a3e635",
  Other:     "#555",
};

function modelLabel(model: string): string {
  return model
    .replace(/^anthropic\//i, "")
    .replace(/^openai\//i, "")
    .replace(/^google\//i, "")
    .replace(/^mistral\//i, "");
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

function AgentTable({ rows, totalCost }: { rows: { agentId: string; routerId?: string; tokens: number; cost: number; router: string; lastDate?: string }[]; totalCost: number }) {
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
          {rows.slice(0, 10).map((row, i) => {
            const share = totalCost > 0 ? (row.cost / totalCost) * 100 : 0;
            const rowKey = row.routerId ? `${row.routerId}--${row.agentId}` : row.agentId;
            return (
              <tr key={rowKey}
                onMouseEnter={() => setHovered(rowKey)}
                onMouseLeave={() => setHovered(null)}
                style={{ borderBottom: "1px solid #13131a", backgroundColor: hovered === rowKey ? "#131318" : "transparent", transition: "background 0.12s" }}
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

// ─── model / provider table ───────────────────────────────────────────────────

function ModelTable({ rows, totalCost, colorKey }: {
  rows: { label: string; tokens: number; cost: number; color: string; sub?: string }[];
  totalCost: number;
  colorKey?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e1e26" }}>
            {["#", colorKey ?? "Model", "Tokens", "Cost", "Share"].map((h, i) => (
              <th key={h} style={{
                padding: i === 0 ? "9px 10px 9px 20px" : i === 4 ? "9px 20px 9px 10px" : "9px 10px",
                textAlign: i >= 2 ? "right" : "left",
                color: "#444", fontWeight: 600, fontSize: "10px",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const share = totalCost > 0 ? (row.cost / totalCost) * 100 : 0;
            return (
              <tr key={row.label}
                onMouseEnter={() => setHovered(row.label)}
                onMouseLeave={() => setHovered(null)}
                style={{ borderBottom: "1px solid #13131a", backgroundColor: hovered === row.label ? "#131318" : "transparent", transition: "background 0.12s" }}
              >
                <td style={{ padding: "9px 10px 9px 20px", color: "#333", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{i + 1}</td>
                <td style={{ padding: "9px 10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span style={{ color: row.color, fontSize: "12px", fontWeight: 500 }}>{row.label}</span>
                    {row.sub && <span style={{ color: "#444", fontSize: "10px" }}>{row.sub}</span>}
                  </div>
                </td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: "#666", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{fmtTokens(row.tokens)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace,monospace", fontSize: "12px", fontWeight: 600 }}>{fmtCost(row.cost)}</td>
                <td style={{ padding: "9px 20px 9px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                    <span style={{ color: "#555", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{share.toFixed(1)}%</span>
                    <div style={{ width: "52px", height: "3px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", background: row.color, borderRadius: "2px" }} />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#333" }}>No model data yet — update routers to v1.1+</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function SpendingPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView]       = useState<View>("agents");
  const [period, setPeriod]   = useState<Period>("all");
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

  const periodCutoff = useMemo(() => {
    const p = PERIODS.find(p => p.id === period);
    if (!p?.days) return null;
    return daysAgo(p.days);
  }, [period]);

  // Period-filtered daily entries
  const filteredDaily = useMemo(() => {
    if (!periodCutoff) return data?.daily ?? [];
    return (data?.daily ?? []).filter(d => d.date >= periodCutoff);
  }, [data, periodCutoff]);

  const totalCost = useMemo(() => {
    if (!periodCutoff) return (data?.costs ?? []).reduce((s, c) => s + c.estimatedCost, 0);
    return filteredDaily.reduce((s, d) => s + d.estimatedCost, 0);
  }, [data, filteredDaily, periodCutoff]);

  const totalTokens = useMemo(() => {
    if (!periodCutoff) return (data?.costs ?? []).reduce((s, c) => s + c.tokens, 0);
    return filteredDaily.reduce((s, d) => s + d.tokens, 0);
  }, [data, filteredDaily, periodCutoff]);

  // Period chart series (by day)
  const areaSeries = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filteredDaily) m.set(d.date, (m.get(d.date) ?? 0) + d.estimatedCost);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cost]) => ({ date, cost }));
  }, [filteredDaily]);

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

  // By Agent — use all-time costs when period=all, else derive from filteredDaily
  const agentRows = useMemo(() => {
    if (!periodCutoff) {
      return [...(data?.costs ?? [])].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 10)
        .map(c => ({ agentId: c.agentId, routerId: c.routerId, tokens: c.tokens, cost: c.estimatedCost, router: c.routerLabel }));
    }
    // Key by routerId--agentId so same-named agents on different routers don't merge
    const m = new Map<string, { agentId: string; routerId: string; tokens: number; cost: number; router: string }>();
    for (const d of filteredDaily) {
      const key = `${d.routerId}--${d.agentId}`;
      const e = m.get(key);
      if (e) { e.tokens += d.tokens; e.cost += d.estimatedCost; }
      else m.set(key, { agentId: d.agentId, routerId: d.routerId, tokens: d.tokens, cost: d.estimatedCost, router: d.routerLabel });
    }
    return [...m.values()]
      .sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [data, filteredDaily, periodCutoff]);

  // By Router — use all-time when period=all, else derive from filteredDaily
  const routerRows = useMemo(() => {
    if (!periodCutoff) return data?.byRouter ?? [];
    const m = new Map<string, { label: string; tokens: number; cost: number }>();
    for (const d of filteredDaily) {
      const e = m.get(d.routerId);
      if (e) { e.tokens += d.tokens; e.cost += d.estimatedCost; }
      else m.set(d.routerId, { label: d.routerLabel, tokens: d.tokens, cost: d.estimatedCost });
    }
    return [...m.entries()]
      .map(([routerId, v]) => ({ routerId, routerLabel: v.label, totalTokens: v.tokens, estimatedCost: v.cost }))
      .sort((a, b) => b.estimatedCost - a.estimatedCost);
  }, [data, filteredDaily, periodCutoff]);
  const routerTotal = routerRows.reduce((s, r) => s + r.estimatedCost, 0);

  // By Model
  const byModel = data?.byModel ?? [];
  const modelTotal = byModel.reduce((s, m) => s + m.estimatedCost, 0);
  const modelRows = useMemo(() =>
    byModel.map((m, i) => ({
      label: modelLabel(m.model),
      tokens: m.totalTokens,
      cost: m.estimatedCost,
      color: COLORS[i % COLORS.length],
      sub: modelToProvider(m.model),
    })),
  [byModel]);

  // By Provider — aggregate models into providers
  const providerRows = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number }>();
    for (const m of byModel) {
      const p = modelToProvider(m.model);
      const e = map.get(p);
      if (e) { e.tokens += m.totalTokens; e.cost += m.estimatedCost; }
      else map.set(p, { tokens: m.totalTokens, cost: m.estimatedCost });
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, tokens: v.tokens, cost: v.cost, color: PROVIDER_COLORS[label] ?? "#555" }))
      .sort((a, b) => b.cost - a.cost);
  }, [byModel]);
  const providerTotal = providerRows.reduce((s, p) => s + p.cost, 0);

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
    { id: "agents",    label: "By Agent"    },
    { id: "routers",   label: "By Router"   },
    { id: "models",    label: "By Model"    },
    { id: "providers", label: "By Provider" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

      {/* Top nav */}
      <div style={{ borderBottom: "1px solid #1a1a22", background: "#060608", padding: "0 24px", display: "flex", alignItems: "center", height: "52px", gap: "16px", flexShrink: 0 }}>
        <span style={{ color: "#888", fontSize: "13px" }}>Mission Control</span>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#f0f0f0", fontSize: "13px", fontWeight: 500 }}>Spending</span>
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

      {/* Body with NavRail */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <NavRail activeView="spending" onViewChange={(v) => {
          if (v === "mission") window.location.href = "/";
          if (v === "swarms") window.location.href = "/teams";
          if (v === "activities") window.location.href = "/activities";
        }} />

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 40px", display: "flex", flexDirection: "column", gap: "32px" }}>

            {/* Page header */}
            <div>
              <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f0f0f0", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>Cost Intelligence</h1>
              <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>Real-time spend tracking across your AI agent fleet</p>
            </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label={period === "all" ? "All-Time Spend" : `${PERIODS.find(p=>p.id===period)?.label} Spend`} value={fmtCost(totalCost)} sub={`${fmtTokens(totalTokens)} tokens total`} accent={ORANGE} trend={trend7} />
          <KpiCard label="30-Day Run Rate"   value={fmtCost(runRate)}         sub="projected / month"                        accent={GREEN} />
          <KpiCard label="Daily Burn"        value={fmtCost(dailyBurn)}       sub="avg last 7 days"                          accent="#8b5cf6" />
          <KpiCard label="Active Agents"     value={String((data?.costs ?? []).filter(c => c.estimatedCost > 0).length)} sub="with recorded spend" accent="#38bdf8" />
        </div>

        {/* Tab bar + Period picker on the same row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "4px", background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "8px", padding: "4px" }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Period</span>
            <div style={{ display: "flex", gap: "2px", background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "8px", padding: "3px" }}>
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  style={{
                    padding: "5px 14px", borderRadius: "5px", border: "none", cursor: "pointer",
                    fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em",
                    background: period === p.id ? ORANGE : "transparent",
                    color: period === p.id ? "#fff" : "#555",
                    transition: "all 0.12s",
                  }}
                >{p.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── By Agent ── */}
        {view === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
              <SectionHead>Cost trend — {period === "all" ? "all time" : PERIODS.find(p => p.id === period)?.label.toLowerCase() + " period"}</SectionHead>
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
            <SectionHead>Top 10 spenders — {period === "all" ? "all time" : PERIODS.find(p => p.id === period)?.label.toLowerCase() + " period"}</SectionHead>
            <AgentTable
              rows={agentRows}
              totalCost={totalCost}
            />
          </div>
        )}

        {/* ── By Router ── */}
        {view === "routers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {routerRows.length <= 1 ? (
              <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "#333", fontSize: "13px", margin: "0 0 6px 0" }}>Only one router connected</p>
                <p style={{ color: "#222", fontSize: "12px", margin: 0 }}>Add more routers from the Connections Manager to compare gateway spend.</p>
              </div>
            ) : (
              <>
                <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
                  <SectionHead>Cost per router — all time</SectionHead>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={routerRows.map(r => ({ name: r.routerLabel, cost: r.estimatedCost }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                      <XAxis dataKey="name" stroke="#333" tick={{ fontSize: 12, fill: "#555" }} tickLine={false} axisLine={{ stroke: "#222" }} />
                      <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="cost" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={80} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
                  {routerRows.map((r, i) => {
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
        {/* ── By Model ── */}
        {view === "models" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {(view === "models" || view === "providers") && period !== "all" && (
              <p style={{ fontSize: "11px", color: "#444", margin: "0 0 16px 0" }}>
                ℹ Model and provider breakdowns reflect all-time usage — per-day model tracking coming soon.
              </p>
            )}
            {byModel.length > 0 && (
              <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
                <SectionHead>Token usage by model — all time</SectionHead>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={byModel.map((m, i) => ({ name: modelLabel(m.model), cost: m.estimatedCost, idx: i }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                    <XAxis dataKey="name" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} />
                    <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={80}>
                      {byModel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <SectionHead>All models — ranked by spend</SectionHead>
            <ModelTable rows={modelRows} totalCost={modelTotal} colorKey="Model" />
          </div>
        )}

        {/* ── By Provider ── */}
        {view === "providers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {period !== "all" && (
              <p style={{ fontSize: "11px", color: "#444", margin: "0 0 16px 0" }}>
                ℹ Model and provider breakdowns reflect all-time usage — per-day model tracking coming soon.
              </p>
            )}
            {providerRows.length > 0 ? (
              <>
                <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "24px" }}>
                  <SectionHead>Spend by AI provider — all time</SectionHead>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={providerRows.map(p => ({ name: p.label, cost: p.cost }))}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
                      <XAxis dataKey="name" stroke="#333" tick={{ fontSize: 12, fill: "#555" }} tickLine={false} axisLine={{ stroke: "#222" }} />
                      <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={100}>
                        {providerRows.map((p, i) => <Cell key={i} fill={p.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                  {providerRows.map(p => {
                    const share = providerTotal > 0 ? (p.cost / providerTotal) * 100 : 0;
                    const modelsForProvider = byModel.filter(m => modelToProvider(m.model) === p.label);
                    return (
                      <div key={p.label} style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderTop: `2px solid ${p.color}`, borderRadius: "10px", padding: "20px 22px" }}>
                        <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: "0 0 10px 0" }}>{p.label}</p>
                        <p style={{ fontSize: "28px", fontWeight: 700, fontFamily: "ui-monospace,monospace", color: "#f0f0f0", margin: "0 0 4px 0" }}>{fmtCost(p.cost)}</p>
                        <p style={{ fontSize: "11px", color: "#555", margin: "0 0 8px 0" }}>{fmtTokens(p.tokens)} tokens</p>
                        {modelsForProvider.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", margin: "0 0 12px 0" }}>
                            {modelsForProvider.map(m => (
                              <span key={m.model} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "20px", background: "rgba(255,255,255,0.04)", color: "#555", border: "1px solid #1e1e26" }}>
                                {modelLabel(m.model)}
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ width: "100%", height: "3px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", background: p.color, borderRadius: "2px" }} />
                        </div>
                        <p style={{ fontSize: "11px", color: "#444", margin: "6px 0 0 0", fontFamily: "ui-monospace,monospace" }}>{share.toFixed(1)}% of total spend</p>
                      </div>
                    );
                  })}
                </div>
                <SectionHead>All providers — ranked by spend</SectionHead>
                <ModelTable rows={providerRows} totalCost={providerTotal} colorKey="Provider" />
              </>
            ) : (
              <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "48px", textAlign: "center" }}>
                <p style={{ color: "#333", fontSize: "13px", margin: "0 0 6px 0" }}>No provider data yet</p>
                <p style={{ color: "#222", fontSize: "12px", margin: 0 }}>Update your routers to v1.1+ to enable model tracking.</p>
              </div>
            )}
          </div>
        )}

          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
