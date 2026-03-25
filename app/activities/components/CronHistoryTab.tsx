"use client";

import { useState } from "react";
import type { ActivitySession, CronGroup } from "@/app/activities/types";
import { timeAgo, fmtTokens } from "@/lib/formatters";
import { fmtTs, ACTIVE_MS } from "@/app/activities/components/shared";

// ── CronCard ──────────────────────────────────────────────────────────────────

export function CronCard({ g, onOpen }: { g: CronGroup; onOpen: (s: ActivitySession) => void }) {
  const [open, setOpen] = useState(false);
  const avgTokens = g.runs.length ? Math.round(g.totalTokens / g.runs.length) : 0;
  return (
    <div className="border overflow-hidden" style={{ background: "#0d0d0d", borderColor: "#1a1a1a", borderRadius: "8px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-base flex-shrink-0">⏰</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-200">{g.jobName}</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-xs text-zinc-500">{g.agentId}</span>
            {g.isActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
                Running
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-700">Last: {timeAgo(g.lastRun)}</span>
            <span className="text-[10px] text-zinc-700">{g.runs.length} run{g.runs.length !== 1 ? "s" : ""}</span>
            <span className="text-[10px] text-zinc-700">avg {fmtTokens(avgTokens)} tok</span>
          </div>
        </div>
        <span className="text-zinc-700 text-xs ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: "#151515" }}>
          {g.runs.map((r, i) => (
            <button
              key={r.key}
              onClick={() => onOpen(r)}
              className="group w-full flex items-center gap-3 px-4 py-2 border-b text-left text-[11px] hover:bg-white/[0.03] transition-colors"
              style={{ borderColor: "#111" }}
            >
              <span className="text-zinc-700 font-mono w-5">#{i + 1}</span>
              <span className="text-zinc-500 flex-1">{fmtTs(r.updatedAt)}</span>
              {r.totalTokens > 0 && <span className="text-zinc-600 font-mono">{fmtTokens(r.totalTokens)} tok</span>}
              <span className="text-zinc-700">{timeAgo(r.updatedAt)}</span>
              {Date.now() - r.updatedAt < ACTIVE_MS && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              <span className="text-[10px] text-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">View logs ↗</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
