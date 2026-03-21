"use client";

import React, { useEffect, useState } from "react";
import AnimatedMetricCard from "../analytics/AnimatedMetricCard";
import AgentCostChart from "../analytics/AgentCostChart";

interface CostData {
  agentId: string;
  date: string;
  tokens: number;
  estimatedCost: number;
}

export default function AnalyticsStage() {
  const [data, setData] = useState<CostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const res = await fetch("/api/telemetry/agent-costs");
        if (!res.ok) throw new Error("Failed to load telemetry data");
        const json = await res.json();
        // Calculate costs across sessions in the UI if not fully done in backend, 
        // but backend already aggregated it.
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
    // Poll every 30s
    const interval = setInterval(fetchCosts, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="h-full flex items-center justify-center text-[#e85d27]">Loading Analytics...</div>;
  if (error) return <div className="h-full flex items-center justify-center text-red-500">{error}</div>;

  const totalCost = data.reduce((acc, curr) => acc + curr.estimatedCost, 0);
  const totalTokens = data.reduce((acc, curr) => acc + curr.tokens, 0);
  const topAgent = data.sort((a, b) => b.estimatedCost - a.estimatedCost)[0];

  return (
    <div className="mc-stage" style={{ gridColumn: 'span 2', flex: 1, backgroundColor: 'var(--mc-bg-stage, #0a0a0a)', color: '#f0f0f0' }}>
      <div className="h-full overflow-y-auto custom-scrollbar p-8 w-full">
      <h1 className="text-3xl font-bold text-white mb-8 tracking-tight">Token &amp; Cost Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <AnimatedMetricCard title="Total Cost" prefix="$" value={totalCost} decimals={4} />
        <AnimatedMetricCard title="Total Tokens" value={totalTokens} />
        <AnimatedMetricCard title="Highest Spender" value={topAgent?.estimatedCost || 0} prefix="$" suffix={` (${topAgent?.agentId || "N/A"})`} decimals={4} />
      </div>

      <div className="w-full">
        <AgentCostChart data={data} />
      </div>
    </div>
    </div>
  );
}
