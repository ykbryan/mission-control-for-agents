"use client";

import React from "react";
import { fmtTokens, timeAgo } from "@/lib/formatters";
import type { SessionGroup } from "@/app/api/agent-sessions/route";
import { SESSION_TYPE_COLORS, type SessionDetail } from "./types";

interface FlatSession {
  key: string;
  label: string;
  totalTokens: number;
  updatedAt: number;
  groupType: string;
  groupIcon: string;
  groupLabel: string;
}

interface ActivityTabProps {
  loading: boolean;
  groups: SessionGroup[];
  allSessions: FlatSession[];
  expandedKey: string | null;
  sessionDetails: Record<string, SessionDetail>;
  onToggleSession: (key: string) => void;
}

export function ActivityTab({
  loading,
  groups,
  allSessions,
  expandedKey,
  sessionDetails,
  onToggleSession,
}: ActivityTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20">
        <div className="w-5 h-5 rounded-full border-2 border-t-orange-500 animate-spin" style={{ borderColor: "#1a1a2e", borderTopColor: "#e85d27" }} />
        <span className="text-xs" style={{ color: "#3f3f52" }}>Loading activity…</span>
      </div>
    );
  }

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <span className="text-3xl opacity-20">🗂</span>
        <p className="text-sm" style={{ color: "#3f3f52" }}>No sessions recorded yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Type legend */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {groups.map(g => {
          const c = SESSION_TYPE_COLORS[g.type] ?? "#6b7280";
          return (
            <div key={g.type} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{ background: c + "12", border: `1px solid ${c}28`, color: c }}>
              <span>{g.icon}</span>
              <span className="font-medium">{g.label}</span>
              <span className="font-mono opacity-60">{g.count}</span>
            </div>
          );
        })}
      </div>

      {/* Session list */}
      <div className="flex flex-col gap-1.5">
        {allSessions.map(s => {
          const typeColor = SESSION_TYPE_COLORS[s.groupType] ?? "#6b7280";
          const isOpen = expandedKey === s.key;
          const detail = sessionDetails[s.key];
          return (
            <div key={s.key} className="rounded-xl overflow-hidden transition-all"
              style={{
                background: isOpen ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                border: isOpen ? `1px solid ${typeColor}35` : "1px solid rgba(255,255,255,0.04)",
              }}>
              {/* Row */}
              <button
                onClick={() => onToggleSession(s.key)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                {/* Color accent */}
                <div className="w-1 h-9 rounded-full shrink-0" style={{ background: `linear-gradient(180deg, ${typeColor}, ${typeColor}40)` }} />
                {/* Icon bubble */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base"
                  style={{ background: typeColor + "15" }}>{s.groupIcon}</div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#d4d4e0" }}>{s.label}</p>
                  <p className="text-[10px] font-mono truncate" style={{ color: "#2e2e3e" }}>{s.key}</p>
                </div>
                {/* Token badge */}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#52526b" }}>
                  {fmtTokens(s.totalTokens)}
                </span>
                {/* Time */}
                <span className="text-[10px] shrink-0 w-14 text-right" style={{ color: "#3a3a52" }}>
                  {timeAgo(s.updatedAt)}
                </span>
                {/* Chevron */}
                <svg className="w-3 h-3 shrink-0 transition-transform" style={{ color: "#3a3a52", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded detail panel */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1 flex flex-col gap-3" style={{ borderTop: `1px solid ${typeColor}18` }}>
                  {detail?.loading ? (
                    <div className="flex items-center gap-2 py-3">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-t-orange-500 animate-spin shrink-0"
                        style={{ borderColor: "#1a1a2e", borderTopColor: typeColor }} />
                      <span className="text-xs" style={{ color: "#3f3f52" }}>Loading session…</span>
                    </div>
                  ) : (
                    <>
                      {/* Prompt */}
                      {detail?.prompt && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#3a3a52" }}>Prompt</p>
                          <p className="text-xs leading-relaxed line-clamp-4 px-3 py-2.5 rounded-lg"
                            style={{ background: "rgba(255,255,255,0.025)", color: "#8888a0", borderLeft: `2px solid ${typeColor}50` }}>
                            {detail.prompt}
                          </p>
                        </div>
                      )}

                      {/* Last delivery */}
                      {detail?.lastDelivery && (
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#3a3a52" }}>Last Delivery</p>
                            {detail.destination && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                                style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
                                {detail.destination}
                              </span>
                            )}
                            {detail.deliveryTime && (
                              <span className="text-[9px] ml-auto" style={{ color: "#2e2e42" }}>
                                {timeAgo(new Date(detail.deliveryTime).getTime())}
                              </span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed line-clamp-5 px-3 py-2.5 rounded-lg"
                            style={{ background: "rgba(255,255,255,0.025)", color: "#8888a0", borderLeft: "2px solid rgba(34,197,94,0.4)" }}>
                            {detail.lastDelivery}
                          </p>
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-3 flex-wrap pt-0.5">
                        {detail?.eventCount != null && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,0.04)", color: "#3a3a52" }}>
                            {detail.eventCount} events
                          </span>
                        )}
                        <span className="text-[9px] font-mono break-all" style={{ color: "#2a2a3e" }}>{s.key}</span>
                      </div>

                      {/* No data fallback */}
                      {!detail?.prompt && !detail?.lastDelivery && (
                        <p className="text-xs py-2" style={{ color: "#3a3a52" }}>No message history available for this session.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
