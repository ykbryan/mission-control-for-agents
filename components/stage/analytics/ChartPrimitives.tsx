"use client";

import React from "react";
import { fmtDate } from "@/lib/formatters";
import { ORANGE, fmtCostFull } from "./types";

// ─── custom tooltip ───────────────────────────────────────────────────────────

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cost = payload[0]?.value as number | undefined;
  return (
    <div style={{
      backgroundColor: "#0f0f12",
      border: "1px solid #1e1e26",
      borderRadius: "8px",
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      <p style={{ color: "#888", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {typeof label === "string" && label.length === 10 ? fmtDate(label) : label}
      </p>
      {cost !== undefined && (
        <p style={{ color: ORANGE, fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: "15px", margin: 0 }}>
          {fmtCostFull(cost)}
        </p>
      )}
    </div>
  );
}

// ─── section heading ──────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "#444",
      margin: "0 0 12px 0",
    }}>
      {children}
    </p>
  );
}

// ─── refresh icon ─────────────────────────────────────────────────────────────

export function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: spinning ? "spin 0.8s linear infinite" : "none",
      }}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
