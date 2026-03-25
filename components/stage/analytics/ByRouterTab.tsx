"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCost, fmtTokens } from "@/lib/formatters";
import { ChartTooltip, SectionLabel } from "./ChartPrimitives";
import { ORANGE, PURPLE, GREEN, BLUE, type RouterEntry } from "./types";

const ROUTER_COLORS = [ORANGE, PURPLE, GREEN, BLUE, "#f59e0b", "#ec4899"];

interface ByRouterTabProps {
  byRouter: RouterEntry[];
  totalCost: number;
}

export function ByRouterTab({ byRouter, totalCost }: ByRouterTabProps) {
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
            <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={72} fill={ORANGE} />
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
