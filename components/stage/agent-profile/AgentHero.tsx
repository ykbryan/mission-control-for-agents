"use client";

import React from "react";
import { motion } from "framer-motion";
import { fmtTokens, timeAgo } from "@/lib/formatters";
import type { Agent } from "@/lib/agents";
import type { SessionGroup } from "@/app/api/agent-sessions/route";
import type { ScheduledJob } from "@/app/api/cron-schedule/route";
import type { NodeInfo } from "@/app/api/node-info/route";

interface AgentHeroProps {
  agent: Agent;
  onBack: () => void;
  groups: SessionGroup[];
  cronJobs: ScheduledJob[];
  nodeInfo: NodeInfo | null;
}

export function AgentHero({ agent, onBack, groups, cronJobs, nodeInfo }: AgentHeroProps) {
  const isActive    = agent.status === "online";
  const totalTokens = groups.reduce((s, g) => s + g.totalTokens, 0);
  const totalSessions = groups.reduce((s, g) => s + g.count, 0);
  const lastSeen    = groups.reduce((t, g) => Math.max(t, g.lastUpdated), 0);

  return (
    <div className="relative shrink-0 overflow-hidden" style={{ background: "#08080f" }}>
      {/* Atmospheric glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 60% 80% at 20% -10%, rgba(232,93,39,0.18) 0%, transparent 65%)",
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 40% 60% at 85% 110%, rgba(99,102,241,0.08) 0%, transparent 60%)",
      }} />

      {/* Top bar */}
      <div className="relative flex items-center gap-3 px-5 pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 transition-colors group"
          style={{ color: "#3f3f52" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#3f3f52")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-xs">Agents</span>
        </button>
        <span style={{ color: "#1e1e2e" }}>/</span>
        <span className="text-xs" style={{ color: "#3f3f52" }}>{agent.name}</span>
      </div>

      {/* Main hero content */}
      <div className="relative flex items-start gap-5 px-5 py-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-2xl" style={{
            background: "rgba(232,93,39,0.15)",
            filter: "blur(12px)",
            transform: "scale(1.3)",
          }} />
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            className="relative w-16 h-16 text-3xl rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(232,93,39,0.12) 0%, rgba(232,93,39,0.04) 100%)",
              border: "1px solid rgba(232,93,39,0.3)",
              boxShadow: "0 0 24px rgba(232,93,39,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {agent.emoji}
          </motion.div>
          {isActive && (
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 bg-emerald-400 animate-pulse"
              style={{ borderColor: "#08080f" }} />
          )}
        </div>

        {/* Name + identity */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#f0f0f8" }}>{agent.name}</h1>
            {agent.tier === "orchestrator" && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: "rgba(232,93,39,0.15)", color: "#e85d27", border: "1px solid rgba(232,93,39,0.25)" }}>
                Orchestrator
              </span>
            )}
          </div>
          <p className="text-sm mb-1.5" style={{ color: "#6b6b82" }}>{agent.role}</p>
          {agent.routerLabel && (
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="text-[10px]">🛰️</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
                {agent.routerLabel}
              </span>
              {agent.nodeHostname ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#8888a8", border: "1px solid rgba(255,255,255,0.1)" }}
                  title="OpenClaw worker node">
                  <span>🖥️</span>
                  <span>{agent.nodeHostname}</span>
                </span>
              ) : nodeInfo && (
                <span className="flex items-center gap-1 text-[10px]"
                  style={{ color: "#8888a8" }}
                  title={`${nodeInfo.osLabel} · ${nodeInfo.arch} · ${nodeInfo.cpuCount} CPU · ${nodeInfo.totalMemGb}GB`}>
                  <span>{nodeInfo.platformIcon}</span>
                  <span style={{ color: "#8888a8" }}>{nodeInfo.machineLabel}</span>
                </span>
              )}
            </div>
          )}
          <p className="text-xs italic leading-relaxed" style={{ color: "#3f3f52" }}>
            <span style={{ color: "#e85d2740", fontSize: "1.1em" }}>"</span>
            {agent.soul}
            <span style={{ color: "#e85d2740", fontSize: "1.1em" }}>"</span>
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="relative flex items-stretch mx-5 mb-5 rounded-xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {[
          { label: "Sessions",  value: totalSessions || "—", icon: "🗂", color: "#f59e0b" },
          { label: "Cron Jobs", value: cronJobs.length || "—", icon: "⏰", color: "#e85d27" },
          { label: "Tokens",    value: fmtTokens(totalTokens), icon: "⚡", color: "#3b82f6" },
          { label: "Last Seen", value: timeAgo(lastSeen), icon: "🕐", color: "#10b981" },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex-1 flex items-center gap-2.5 px-4 py-3"
            style={{ borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span className="text-base shrink-0" style={{ filter: "saturate(0.8)" }}>{s.icon}</span>
            <div>
              <p className="text-base font-bold font-mono leading-none mb-0.5" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: "#3a3a4e" }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
