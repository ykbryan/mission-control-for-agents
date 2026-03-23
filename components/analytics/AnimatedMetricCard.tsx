"use client";

import React from "react";
import CountUp from "react-countup";

interface TrendBadge {
  value: number;   // positive = up, negative = down
  label: string;   // e.g. "vs last week"
}

interface Props {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  accentColor?: string;
  trend?: TrendBadge;
}

export default function AnimatedMetricCard({
  title,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  accentColor = "#e85d27",
  trend,
}: Props) {
  const trendUp = trend && trend.value > 0;
  const trendDown = trend && trend.value < 0;

  return (
    <div
      style={{
        backgroundColor: "#0f0f12",
        borderTop: `2px solid ${accentColor}`,
        borderRight: "1px solid #1e1e26",
        borderBottom: "1px solid #1e1e26",
        borderLeft: "1px solid #1e1e26",
        borderRadius: "10px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {/* Label */}
      <p
        style={{
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#666",
          margin: 0,
        }}
      >
        {title}
      </p>

      {/* Number */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "4px",
          marginTop: "6px",
        }}
      >
        {prefix && (
          <span
            style={{ fontSize: "20px", color: "#555", fontWeight: 600, fontFamily: "ui-monospace, monospace" }}
          >
            {prefix}
          </span>
        )}
        <span
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: "#f0f0f0",
            fontFamily: "ui-monospace, monospace",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          <CountUp start={0} end={value} duration={2.2} separator="," decimals={decimals} />
        </span>
        {suffix && (
          <span
            style={{ fontSize: "14px", color: "#555", fontWeight: 500, marginLeft: "2px" }}
          >
            {suffix}
          </span>
        )}
      </div>

      {/* Trend badge */}
      {trend && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "8px",
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: trendUp ? "rgba(34,197,94,0.1)" : trendDown ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
            width: "fit-content",
          }}
        >
          {trendUp && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1L9 5H6V9H4V5H1L5 1Z" fill="#22c55e" />
            </svg>
          )}
          {trendDown && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 9L1 5H4V1H6V5H9L5 9Z" fill="#ef4444" />
            </svg>
          )}
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: trendUp ? "#22c55e" : trendDown ? "#ef4444" : "#6b7280",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {trendUp ? "+" : ""}{trend.value.toFixed(1)}% {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}
