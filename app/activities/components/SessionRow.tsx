"use client";

import type { ActivitySession } from "@/app/activities/types";
import { timeAgo, fmtTokens } from "@/lib/formatters";
import { fmtTs, ACTIVE_MS, typeStyle } from "@/app/activities/components/shared";

export function SessionRow({ s, onClick }: { s: ActivitySession; onClick: () => void }) {
  const isActive = Date.now() - s.updatedAt < ACTIVE_MS;
  const ts = typeStyle(s.type);
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 border-b text-left transition-colors hover:bg-white/[0.03]"
      style={{ borderColor: "#111" }}
    >
      {/* Active pulse / type dot */}
      <div className="flex-shrink-0 flex items-center justify-center w-8">
        {isActive ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${ts.dot} opacity-40`} />
        )}
      </div>

      {/* Icon + label */}
      <div className="flex-shrink-0 text-base w-6 text-center">{s.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-200">{s.agentId}</span>
          <span className="text-zinc-700 text-xs">·</span>
          <span className="text-xs text-zinc-400 truncate">{s.label}</span>
          {isActive && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] text-zinc-700">{fmtTs(s.updatedAt)}</span>
          {s.routerLabel && (
            <span className="text-[9px] font-medium px-1.5 py-px rounded" style={{ background: "#1a1a2a", color: "#5a5a8a" }}>
              🛰️ {s.routerLabel}
            </span>
          )}
        </div>
      </div>

      {/* Type badge */}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${ts.bg} ${ts.text} flex-shrink-0`}>
        {s.type}
      </span>

      {/* Tokens */}
      {s.totalTokens > 0 && (
        <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 w-14 text-right">
          {fmtTokens(s.totalTokens)}
        </span>
      )}

      {/* Time ago */}
      <span className="text-[10px] text-zinc-700 flex-shrink-0 w-16 text-right tabular-nums">
        {timeAgo(s.updatedAt)}
      </span>

      {/* Open hint */}
      <span className="text-[10px] text-zinc-800 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
    </button>
  );
}
