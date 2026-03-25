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
import { ORANGE, type CostEntry, type DailyEntry } from "./types";

// ─── top spender row ──────────────────────────────────────────────────────────

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

// ─── overview tab ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  daily14: DailyEntry[];
  costs: CostEntry[];
  totalCost: number;
}

export function OverviewTab({ daily14, costs, totalCost }: OverviewTabProps) {
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
