"use client";

import React, { useEffect, useMemo, useState } from "react";
import AnimatedMetricCard from "../analytics/AnimatedMetricCard";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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

type Tab = "overview" | "daily" | "weekly" | "byrouter";

// ─── helpers ──────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";
const GREEN  = "#22c55e";
const RED    = "#ef4444";
const PURPLE = "#8b5cf6";
const BLUE   = "#38bdf8";

function fmtCost(n: number): string {
  if (n === 0) return "$0.0000";
  if (n < 0.001) return "< $0.001";
  return `$${n.toFixed(4)}`;
}

function fmtCostFull(n: number): string {
  if (n === 0) return "$0.000000";
  return `$${n.toFixed(6)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTimestamp(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (dow - 1) * 86400000);
  const weekNum = Math.ceil((d.getTime() - weekStart.getTime()) / (7 * 86400000)) + 1;
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function dateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

// ─── custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cost = payload[0]?.value as number | undefined;
  return (
    <div style={{
      backgroundColor: "#0f0f12",
      border: "1px solid #1e1e26",
      borderRadius: "8px",
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      <p style={{ color: "#888", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {typeof label === "string" && label.length === 10 ? fmtDate(label) : label}
      </p>
      {cost !== undefined && (
        <p style={{ color: ORANGE, fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: "15px", margin: 0 }}>
          {fmtCostFull(cost)}
        </p>
      )}
    </div>
  );
}

// ─── section heading ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "#444",
      margin: "0 0 12px 0",
    }}>
      {children}
    </p>
  );
}

// ─── refresh icon ─────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: spinning ? "spin 0.8s linear infinite" : "none",
      }}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ─── overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  daily14,
  costs,
  totalCost,
}: {
  daily14: DailyEntry[];
  costs: CostEntry[];
  totalCost: number;
}) {
  const areaData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const d of daily14) {
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.estimatedCost);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));
  }, [daily14]);

  const topSpenders = useMemo(() => {
    return [...costs]
      .sort((a, b) => b.estimatedCost - a.estimatedCost)
      .slice(0, 12);
  }, [costs]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: "20px" }}>
      {/* Left: area chart */}
      <div style={{
        backgroundColor: "#0f0f12",
        border: "1px solid #1e1e26",
        borderRadius: "10px",
        padding: "20px 24px",
      }}>
        <SectionLabel>Cost over last 14 days</SectionLabel>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={areaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ORANGE} stopOpacity={0.25} />
                <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#333"
              tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={{ stroke: "#222" }}
              tickFormatter={fmtDate}
            />
            <YAxis
              stroke="#333"
              tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v.toFixed(3)}`}
              width={64}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="cost"
              stroke={ORANGE}
              strokeWidth={2}
              fill="url(#costGradient)"
              dot={false}
              activeDot={{ r: 4, fill: ORANGE, stroke: "#0f0f12", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Right: top spenders table */}
      <div style={{
        backgroundColor: "#0f0f12",
        border: "1px solid #1e1e26",
        borderRadius: "10px",
        overflow: "hidden",
      }}>
        <div style={{ padding: "20px 24px 12px" }}>
          <SectionLabel>Top spenders — all time</SectionLabel>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e26" }}>
              <th style={{ padding: "8px 12px 8px 24px", textAlign: "left", color: "#444", fontWeight: 500, letterSpacing: "0.06em", fontSize: "10px", textTransform: "uppercase" }}>#</th>
              <th style={{ padding: "8px 12px", textAlign: "left", color: "#444", fontWeight: 500, letterSpacing: "0.06em", fontSize: "10px", textTransform: "uppercase" }}>Agent</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: "#444", fontWeight: 500, letterSpacing: "0.06em", fontSize: "10px", textTransform: "uppercase" }}>Tokens</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: "#444", fontWeight: 500, letterSpacing: "0.06em", fontSize: "10px", textTransform: "uppercase" }}>Cost</th>
              <th style={{ padding: "8px 24px 8px 12px", textAlign: "right", color: "#444", fontWeight: 500, letterSpacing: "0.06em", fontSize: "10px", textTransform: "uppercase" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {topSpenders.map((agent, i) => {
              const share = totalCost > 0 ? (agent.estimatedCost / totalCost) * 100 : 0;
              return (
                <TopSpenderRow
                  key={agent.agentId}
                  rank={i + 1}
                  agent={agent}
                  share={share}
                />
              );
            })}
            {topSpenders.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#444", fontSize: "12px" }}>
                  No agent data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopSpenderRow({ rank, agent, share }: { rank: number; agent: CostEntry; share: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid #13131a",
        backgroundColor: hovered ? "#131318" : "transparent",
        transition: "background-color 0.15s",
        cursor: "default",
      }}
    >
      <td style={{ padding: "9px 12px 9px 24px", color: "#444", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
        {rank}
      </td>
      <td style={{ padding: "9px 12px", color: "#d0d0d0", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {agent.agentId}
      </td>
      <td style={{ padding: "9px 12px", textAlign: "right", color: "#666", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
        {fmtTokens(agent.tokens)}
      </td>
      <td style={{ padding: "9px 12px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace, monospace", fontSize: "12px", fontWeight: 600 }}>
        {fmtCost(agent.estimatedCost)}
      </td>
      <td style={{ padding: "9px 24px 9px 12px", textAlign: "right" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
          <span style={{ color: "#666", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
            {share.toFixed(1)}%
          </span>
          <div style={{ width: "48px", height: "3px", backgroundColor: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", backgroundColor: ORANGE, borderRadius: "2px" }} />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── daily tab ────────────────────────────────────────────────────────────────

function DailyTab({ daily14, allDaily }: { daily14: DailyEntry[]; allDaily: DailyEntry[] }) {
  const areaData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const d of daily14) {
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.estimatedCost);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));
  }, [daily14]);

  const agentTable = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; router: string; lastDate: string }>();
    for (const d of allDaily) {
      const existing = map.get(d.agentId);
      if (existing) {
        existing.tokens += d.tokens;
        existing.cost += d.estimatedCost;
        if (d.date > existing.lastDate) existing.lastDate = d.date;
      } else {
        map.set(d.agentId, { tokens: d.tokens, cost: d.estimatedCost, router: d.routerLabel, lastDate: d.date });
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].cost - a[1].cost);
  }, [allDaily]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ backgroundColor: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px 24px" }}>
        <SectionLabel>Daily total cost — last 14 days</SectionLabel>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={areaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ORANGE} stopOpacity={0.2} />
                <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
            <XAxis dataKey="date" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} tickFormatter={fmtDate} />
            <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(3)}`} width={64} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="cost" stroke={ORANGE} strokeWidth={2} fill="url(#dailyGradient)" dot={false} activeDot={{ r: 4, fill: ORANGE, stroke: "#0f0f12", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ backgroundColor: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 12px" }}>
          <SectionLabel>All agents — cumulative</SectionLabel>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e26" }}>
              {["Agent", "Router", "Tokens", "Cost", "Last Active"].map((col) => (
                <th key={col} style={{ padding: "8px 16px", textAlign: col === "Agent" || col === "Router" ? "left" : "right", color: "#444", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentTable.map(([agentId, data]) => (
              <AgentRow key={agentId} agentId={agentId} data={data} />
            ))}
            {agentTable.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#444" }}>No daily data available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentRow({ agentId, data }: { agentId: string; data: { tokens: number; cost: number; router: string; lastDate: string } }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: "1px solid #13131a", backgroundColor: hovered ? "#131318" : "transparent", transition: "background-color 0.15s" }}
    >
      <td style={{ padding: "9px 16px", color: "#d0d0d0", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentId}</td>
      <td style={{ padding: "9px 16px", color: "#666", fontSize: "11px" }}>{data.router || "—"}</td>
      <td style={{ padding: "9px 16px", textAlign: "right", color: "#666", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>{fmtTokens(data.tokens)}</td>
      <td style={{ padding: "9px 16px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{fmtCost(data.cost)}</td>
      <td style={{ padding: "9px 16px", textAlign: "right", color: "#555", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>{data.lastDate ? fmtDate(data.lastDate) : "—"}</td>
    </tr>
  );
}

// ─── weekly tab ───────────────────────────────────────────────────────────────

function WeeklyTab({ daily }: { daily: DailyEntry[] }) {
  const last42 = useMemo(() => {
    const cutoff = dateNDaysAgo(42);
    return daily.filter((d) => d.date >= cutoff);
  }, [daily]);

  const weeklyData = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const d of last42) {
      const w = isoWeek(d.date);
      byWeek.set(w, (byWeek.get(w) ?? 0) + d.estimatedCost);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, cost]) => ({ week, cost }));
  }, [last42]);

  // week-over-week comparison
  const wowComparison = useMemo(() => {
    if (weeklyData.length < 2) return [];
    return weeklyData.slice(-8).map((w, i, arr) => {
      const prev = arr[i - 1];
      const delta = prev ? ((w.cost - prev.cost) / (prev.cost || 1)) * 100 : null;
      return { ...w, delta };
    });
  }, [weeklyData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ backgroundColor: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px 24px" }}>
        <SectionLabel>Weekly cost — last 6 weeks</SectionLabel>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyData.slice(-8)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
            <XAxis dataKey="week" stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={{ stroke: "#222" }} />
            <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(3)}`} width={64} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="cost" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ backgroundColor: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 12px" }}>
          <SectionLabel>Week-over-week</SectionLabel>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e26" }}>
              {["Week", "Total Cost", "vs Prior Week"].map((col) => (
                <th key={col} style={{ padding: "8px 16px", textAlign: col === "Week" ? "left" : "right", color: "#444", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wowComparison.map(({ week, cost, delta }) => (
              <tr key={week} style={{ borderBottom: "1px solid #13131a" }}>
                <td style={{ padding: "9px 16px", color: "#d0d0d0", fontFamily: "ui-monospace, monospace" }}>{week}</td>
                <td style={{ padding: "9px 16px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{fmtCost(cost)}</td>
                <td style={{ padding: "9px 16px", textAlign: "right" }}>
                  {delta === null ? (
                    <span style={{ color: "#444", fontSize: "11px" }}>—</span>
                  ) : (
                    <span style={{
                      color: delta > 0 ? RED : delta < 0 ? GREEN : "#888",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {wowComparison.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: "24px", textAlign: "center", color: "#444" }}>Not enough data for weekly comparison</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── by router tab ────────────────────────────────────────────────────────────

function ByRouterTab({ byRouter, totalCost }: { byRouter: RouterEntry[]; totalCost: number }) {
  if (byRouter.length <= 1) {
    return (
      <div style={{
        backgroundColor: "#0f0f12",
        border: "1px solid #1e1e26",
        borderRadius: "10px",
        padding: "60px 24px",
        textAlign: "center",
      }}>
        <p style={{ color: "#333", fontSize: "13px", margin: 0 }}>
          Add more routers to compare spend across your fleet.
        </p>
        <p style={{ color: "#222", fontSize: "11px", marginTop: "8px" }}>
          Currently tracking {byRouter.length === 0 ? "no" : "1"} router.
        </p>
      </div>
    );
  }

  const chartData = byRouter.map((r) => ({ name: r.routerLabel, cost: r.estimatedCost }));
  const ROUTER_COLORS = [ORANGE, PURPLE, GREEN, BLUE, "#f59e0b", "#ec4899"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ backgroundColor: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px 24px" }}>
        <SectionLabel>Cost by router</SectionLabel>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" vertical={false} />
            <XAxis dataKey="name" stroke="#333" tick={{ fontSize: 11, fill: "#555" }} tickLine={false} axisLine={{ stroke: "#222" }} />
            <YAxis stroke="#333" tick={{ fontSize: 11, fill: "#555", fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(3)}`} width={64} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={72}
              fill={ORANGE}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
        {byRouter.map((r, i) => {
          const share = totalCost > 0 ? (r.estimatedCost / totalCost) * 100 : 0;
          const accent = ROUTER_COLORS[i % ROUTER_COLORS.length];
          return (
            <div key={r.routerId} style={{
              backgroundColor: "#0f0f12",
              border: "1px solid #1e1e26",
              borderTop: `2px solid ${accent}`,
              borderRadius: "10px",
              padding: "18px 20px",
            }}>
              <p style={{ color: "#666", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px 0" }}>Router</p>
              <p style={{ color: "#d0d0d0", fontWeight: 600, fontSize: "14px", margin: "0 0 12px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.routerLabel}</p>
              <p style={{ color: accent, fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: "20px", margin: "0 0 4px 0" }}>{fmtCost(r.estimatedCost)}</p>
              <p style={{ color: "#444", fontSize: "11px", margin: "0 0 10px 0" }}>{fmtTokens(r.totalTokens)} tokens</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, height: "3px", backgroundColor: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(share, 100)}%`, height: "100%", backgroundColor: accent, borderRadius: "2px" }} />
                </div>
                <span style={{ color: "#555", fontSize: "11px", fontFamily: "ui-monospace, monospace" }}>{share.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview"  },
  { id: "daily",    label: "Daily"     },
  { id: "weekly",   label: "Weekly"    },
  { id: "byrouter", label: "By Router" },
];

export default function AnalyticsStage() {
  const [analytics, setAnalytics]     = useState<AnalyticsData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<Tab>("overview");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  async function fetchCosts() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/telemetry/agent-costs");
      if (!res.ok) throw new Error("Failed to load telemetry data");
      setAnalytics(await res.json());
      setLastRefreshed(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── derived calculations ─────────────────────────────────────────────────────

  const totalCost = useMemo(
    () => (analytics?.costs ?? []).reduce((s, c) => s + c.estimatedCost, 0),
    [analytics]
  );

  const activeAgents = useMemo(
    () => (analytics?.costs ?? []).filter((c) => c.estimatedCost > 0).length,
    [analytics]
  );

  const daily14 = useMemo(() => {
    if (!analytics) return [];
    const cutoff = dateNDaysAgo(14);
    return analytics.daily.filter((d) => d.date >= cutoff);
  }, [analytics]);

  const runRate = useMemo(() => {
    if (!analytics) return 0;
    const cutoff = dateNDaysAgo(30);
    const last30 = analytics.daily.filter((d) => d.date >= cutoff);
    const sumCost = last30.reduce((s, d) => s + d.estimatedCost, 0);
    const uniqueDays = new Set(last30.map((d) => d.date)).size;
    if (uniqueDays === 0) return 0;
    return (sumCost / uniqueDays) * 30;
  }, [analytics]);

  const dailyBurn = useMemo(() => {
    if (!analytics) return 0;
    const cutoff = dateNDaysAgo(7);
    const last7 = analytics.daily.filter((d) => d.date >= cutoff);
    const sumCost = last7.reduce((s, d) => s + d.estimatedCost, 0);
    const uniqueDays = new Set(last7.map((d) => d.date)).size;
    return uniqueDays > 0 ? sumCost / uniqueDays : 0;
  }, [analytics]);

  const spendTrend = useMemo(() => {
    if (!analytics) return null;
    const cutoff7  = dateNDaysAgo(7);
    const cutoff14 = dateNDaysAgo(14);
    const last7  = analytics.daily.filter((d) => d.date >= cutoff7).reduce((s, d) => s + d.estimatedCost, 0);
    const prior7 = analytics.daily.filter((d) => d.date >= cutoff14 && d.date < cutoff7).reduce((s, d) => s + d.estimatedCost, 0);
    if (prior7 === 0) return null;
    return ((last7 - prior7) / prior7) * 100;
  }, [analytics]);

  // ── render ────────────────────────────────────────────────────────────────────

  const spinStyle = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `;

  if (loading) {
    return (
      <div
        className="mc-stage"
        style={{ gridColumn: "span 2", flex: 1, backgroundColor: "#060608", color: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <p style={{ color: ORANGE, fontSize: "13px", letterSpacing: "0.08em" }}>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mc-stage"
        style={{ gridColumn: "span 2", flex: 1, backgroundColor: "#060608", color: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <p style={{ color: RED, fontSize: "13px" }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      className="mc-stage"
      style={{ gridColumn: "span 2", flex: 1, backgroundColor: "#060608", color: "#f0f0f0" }}
    >
      <style>{spinStyle}</style>
      <div className="h-full overflow-y-auto custom-scrollbar px-8 py-6 flex flex-col gap-5">

        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#f0f0f0", margin: 0 }}>Cost Intelligence</h1>
            <p style={{ fontSize: "12px", color: "#555", margin: "3px 0 0 0" }}>Real-time spend across your AI agent fleet</p>
          </div>
          <a
            href="/spending"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 600, color: "#e85d27",
              background: "rgba(232,93,39,0.08)", border: "1px solid rgba(232,93,39,0.2)",
              borderRadius: "6px", padding: "6px 14px", textDecoration: "none",
              transition: "all 0.15s",
            }}
          >
            Open full page ↗
          </a>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
          <AnimatedMetricCard
            title="All-Time Spend"
            value={totalCost}
            prefix="$"
            decimals={4}
            accentColor={ORANGE}
            trend={spendTrend !== null ? { value: spendTrend, label: "vs last week" } : undefined}
          />
          <AnimatedMetricCard
            title="30-Day Run Rate"
            value={runRate}
            prefix="$"
            decimals={4}
            accentColor={GREEN}
            trend={undefined}
          />
          <AnimatedMetricCard
            title="Daily Burn"
            value={dailyBurn}
            prefix="$"
            decimals={4}
            accentColor={PURPLE}
            trend={undefined}
          />
          <AnimatedMetricCard
            title="Agents Active"
            value={activeAgents}
            decimals={0}
            accentColor="#38bdf8"
            trend={undefined}
          />
        </div>

        {/* KPI sub-labels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginTop: "-16px" }}>
          <p style={{ fontSize: "10px", color: "#444", margin: 0, paddingLeft: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>cumulative total</p>
          <p style={{ fontSize: "10px", color: "#444", margin: 0, paddingLeft: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>projected / mo</p>
          <p style={{ fontSize: "10px", color: "#444", margin: 0, paddingLeft: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>avg last 7 days</p>
          <p style={{ fontSize: "10px", color: "#444", margin: 0, paddingLeft: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>with recorded spend</p>
        </div>

        {/* Overview chart */}
        <OverviewTab
          daily14={daily14}
          costs={analytics?.costs ?? []}
          totalCost={totalCost}
        />

        {/* CTA to full page */}
        <a
          href="/spending"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "12px", borderRadius: "8px",
            background: "rgba(232,93,39,0.04)", border: "1px dashed rgba(232,93,39,0.15)",
            color: "#e85d27", fontSize: "12px", fontWeight: 500, textDecoration: "none",
            transition: "all 0.15s",
          }}
        >
          <span>💰</span> View full Cost Intelligence dashboard — daily, weekly, by router ↗
        </a>

      </div>
    </div>
  );
}
