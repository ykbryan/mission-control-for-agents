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
  Legend,
} from "recharts";

interface DataPoint {
  agentId: string;
  date: string;
  tokens: number;
  estimatedCost: number;
}

interface Props {
  data: DataPoint[];
}

export default function AgentCostChart({ data }: Props) {
  return (
    <div className="w-full h-80 bg-[#0a0a0a] p-4 rounded-xl border border-[#222]">
      <h3 className="text-[#f0f0f0] mb-4 text-lg font-medium">Estimated Cost per Agent</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="agentId" stroke="#888" />
          <YAxis stroke="#888" />
          <Tooltip
            contentStyle={{ backgroundColor: "#111", border: "1px solid #e85d27", borderRadius: 8 }}
            itemStyle={{ color: "#f0f0f0" }}
          />
          <Legend />
          <Bar dataKey="estimatedCost" fill="#e85d27" name="Cost ($)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
