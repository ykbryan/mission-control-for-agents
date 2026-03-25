"use client";

import React from "react";
import { timeAgo } from "@/lib/formatters";
import type { ScheduledJob } from "@/app/api/cron-schedule/route";
import { VALIDITY_COLOR } from "./types";

interface HeartbeatLine {
  name: string;
  schedule: string;
  desc: string;
}

interface CronsTabProps {
  loading: boolean;
  hbLines: HeartbeatLine[];
  cronJobs: ScheduledJob[];
}

export function CronsTab({ loading, hbLines, cronJobs }: CronsTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20">
        <div className="w-5 h-5 rounded-full border-2 border-t-orange-500 animate-spin" style={{ borderColor: "#1a1a2e", borderTopColor: "#e85d27" }} />
        <span className="text-xs" style={{ color: "#3f3f52" }}>Loading schedules…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Heartbeat routines */}
      {hbLines.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">💓</span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#f59e0b" }}>Heartbeat Routines</span>
            <div className="flex-1 h-px" style={{ background: "rgba(245,158,11,0.1)" }} />
          </div>
          <div className="flex flex-col gap-2">
            {hbLines.map((h, i) => (
              <div key={i} className="relative flex gap-4 px-4 py-3.5 rounded-xl overflow-hidden"
                style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)" }}>
                {/* Left glow bar */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
                  style={{ background: "linear-gradient(180deg, #f59e0b80, transparent)" }} />
                {/* Schedule pill */}
                <div className="shrink-0 pt-0.5">
                  <span className="text-[9px] font-bold font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
                    {h.schedule || "routine"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "#e4d4a8" }}>{h.name}</p>
                  {h.desc && <p className="text-xs leading-relaxed" style={{ color: "#6b6040" }}>{h.desc}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inferred cron jobs */}
      {cronJobs.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">⏰</span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6366f1" }}>
              Inferred Jobs
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(99,102,241,0.1)" }} />
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{cronJobs.length}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {cronJobs.map(job => {
              const vc = VALIDITY_COLOR[job.validity ?? "unconfirmed"];
              const nextDiff = job.nextRunAt ? job.nextRunAt - Date.now() : null;
              const nextLabel = nextDiff == null ? "—"
                : nextDiff < 0 ? `${Math.round(Math.abs(nextDiff)/3_600_000)}h overdue`
                : nextDiff < 3_600_000 ? `in ${Math.round(nextDiff/60_000)}m`
                : `in ${Math.round(nextDiff/3_600_000)}h`;
              return (
                <div key={job.id} className="relative rounded-xl overflow-hidden px-4 py-4"
                  style={{ background: "#0c0c14", border: "1px solid #18182a" }}>
                  {/* Header */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#d4d4e0" }}>{job.name}</p>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 font-mono"
                      style={{ color: vc, background: vc + "15", border: `1px solid ${vc}30` }}>
                      {job.validity}
                    </span>
                  </div>
                  {/* Description */}
                  <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: "#4a4a62" }}>
                    {job.description}
                  </p>
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg font-bold"
                      style={{ background: "rgba(99,102,241,0.08)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}>
                      {job.scheduleStr}
                    </span>
                    <span className="text-[10px]" style={{ color: "#2e2e42" }}>·</span>
                    <span className="text-[10px]" style={{ color: "#3a3a52" }}>{job.runCount} runs</span>
                    <span className="text-[10px]" style={{ color: "#2e2e42" }}>·</span>
                    <span className="text-[10px]" style={{ color: "#3a3a52" }}>last {timeAgo(job.lastRunAt)}</span>
                    {job.nextRunAt && (
                      <>
                        <span className="text-[10px]" style={{ color: "#2e2e42" }}>·</span>
                        <span className="text-[10px] font-mono font-semibold" style={{ color: vc }}>{nextLabel}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : hbLines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-3xl opacity-20">⏰</span>
          <p className="text-sm" style={{ color: "#3f3f52" }}>No scheduled routines found</p>
        </div>
      )}
    </div>
  );
}
