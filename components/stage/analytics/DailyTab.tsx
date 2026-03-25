"use client";

import React, { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCost, fmtTokens, fmtDate } from "@/lib/formatters";
import { ChartTooltip, SectionLabel } from "./ChartPrimitives";
import { ORANGE, type DailyEntry } from "./types";

// ─── agent row ────────────────────────────────────────────────────────────────

function AgentRow({ agentId, data }: {
  agentId: string;
  data: { tokens: number; cost: number; router: string; lastDate: string };
}) {
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

// ─── daily tab ────────────────────────────────────────────────────────────────

interface DailyTabProps {
  daily14: DailyEntry[];
  allDaily: DailyEntry[];
}

export function DailyTab({ daily14, allDaily }: DailyTabProps) {
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
    // Key by routerId--agentId so "main" on two different routers don't collide
    const map = new Map<string, { tokens: number; cost: number; router: string; lastDate: string }>();
    for (const d of allDaily) {
      const key = d.routerId ? `${d.routerId}--${d.agentId}` : d.agentId;
      const existing = map.get(key);
      if (existing) {
        existing.tokens += d.tokens;
        existing.cost += d.estimatedCost;
        if (d.date > existing.lastDate) existing.lastDate = d.date;
      } else {
        map.set(key, { tokens: d.tokens, cost: d.estimatedCost, router: d.routerLabel, lastDate: d.date });
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
