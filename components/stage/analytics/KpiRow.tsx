"use client";

import React from "react";
import AnimatedMetricCard from "@/components/analytics/AnimatedMetricCard";
import { ORANGE, GREEN, PURPLE } from "./types";

interface KpiRowProps {
  totalCost: number;
  runRate: number;
  dailyBurn: number;
  activeAgents: number;
  spendTrend: number | null;
}

export function KpiRow({ totalCost, runRate, dailyBurn, activeAgents, spendTrend }: KpiRowProps) {
  const subLabelStyle = {
    fontSize: "10px", color: "#444", margin: 0, paddingLeft: "2px",
    textTransform: "uppercase" as const, letterSpacing: "0.06em",
  };

  return (
    <>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginTop: "-16px" }}>
        <p style={subLabelStyle}>cumulative total</p>
        <p style={subLabelStyle}>projected / mo</p>
        <p style={subLabelStyle}>avg last 7 days</p>
        <p style={subLabelStyle}>with recorded spend</p>
      </div>
    </>
  );
}
