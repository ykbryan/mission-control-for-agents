"use client";

import React, { useEffect, useMemo, useState } from "react";
import { KpiRow } from "./analytics/KpiRow";
import { OverviewTab } from "./analytics/OverviewTab";
import { DailyTab } from "./analytics/DailyTab";
import { WeeklyTab } from "./analytics/WeeklyTab";
import { ByRouterTab } from "./analytics/ByRouterTab";
import {
  ORANGE, RED,
  dateNDaysAgo,
  type AnalyticsData,
  type Tab,
} from "./analytics/types";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview"  },
  { id: "daily",    label: "Daily"     },
  { id: "weekly",   label: "Weekly"    },
  { id: "byrouter", label: "By Router" },
];

const spinStyle = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`;

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

        <KpiRow
          totalCost={totalCost}
          runRate={runRate}
          dailyBurn={dailyBurn}
          activeAgents={activeAgents}
          spendTrend={spendTrend}
        />

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
