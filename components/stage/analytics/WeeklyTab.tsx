"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCost, isoWeek } from "@/lib/formatters";
import { ChartTooltip, SectionLabel } from "./ChartPrimitives";
import { ORANGE, GREEN, RED, dateNDaysAgo, type DailyEntry } from "./types";

interface WeeklyTabProps {
  daily: DailyEntry[];
}

export function WeeklyTab({ daily }: WeeklyTabProps) {
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
