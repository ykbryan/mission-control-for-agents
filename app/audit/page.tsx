"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import NavRail from "@/components/mission-control/NavRail";
import { skillDescriptions } from "@/lib/agents";
import type {
  AuditEventsResponse,
  AuditEvent,
  AuditSeverity,
  AuditCategory,
  RouterHealthSnapshot,
  AgentRiskEntry,
} from "@/app/api/audit/events/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORANGE = "#e85d27";

const SEV_COLOR: Record<AuditSeverity, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      "#6b7280",
  info:     "#38bdf8",
};

const CAT_COLOR: Record<AuditCategory, string> = {
  cost:         "#10b981",
  availability: "#38bdf8",
  integrity:    "#8b5cf6",
  data:         "#ec4899",
  behavior:     "#f97316",
  compliance:   "#e85d27",
  access:       "#ef4444",
};

type Tab = "events" | "infrastructure" | "agents" | "trends";

const TABS: { id: Tab; label: string }[] = [
  { id: "events",         label: "Events"          },
  { id: "infrastructure", label: "Gateway"  },
  { id: "agents",         label: "Agent Risk"      },
  { id: "trends",         label: "Live Trends"     },
];

const SEV_ALL: AuditSeverity[] = ["critical", "high", "medium", "low", "info"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function uptimeFmt(s: number): string {
  if (s < 60)    return `${Math.round(s)}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.0000";
  if (n < 0.0001) return "< $0.0001";
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SeverityBadge({ sev }: { sev: AuditSeverity }) {
  const c = SEV_COLOR[sev];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", background: `${c}22`, color: c, border: `1px solid ${c}44`,
    }}>
      {sev}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: AuditCategory }) {
  const c = CAT_COLOR[cat];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 7px",
      borderRadius: "4px", fontSize: "10px", fontWeight: 600,
      background: `${c}18`, color: c,
    }}>
      {cat}
    </span>
  );
}

function KpiCard({ label, value, sub, accent = ORANGE, alert = false }: {
  label: string; value: string | number; sub?: string; accent?: string; alert?: boolean;
}) {
  return (
    <div style={{
      background: "#0f0f12", border: "1px solid #1e1e26",
      borderTop: `2px solid ${alert && Number(value) > 0 ? "#ef4444" : accent}`,
      borderRadius: "10px", padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", margin: 0 }}>{label}</p>
      <p style={{
        fontSize: "28px", fontWeight: 700, fontFamily: "ui-monospace,monospace",
        color: alert && Number(value) > 0 ? "#ef4444" : "#f0f0f0",
        margin: 0, letterSpacing: "-0.02em",
      }}>{value}</p>
      {sub && <p style={{ fontSize: "11px", color: "#555", margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ minHeight: "100vh", background: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: ORANGE, fontFamily: "ui-monospace,monospace", fontSize: "13px", opacity: 0.7 }}>
        Running security audit…
      </p>
    </div>
  );
}

// ── Events Tab ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

function EventsTab({ events, agentRisk }: { events: AuditEvent[]; agentRisk: AgentRiskEntry[] }) {
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [sevFilter, setSevFilter] = useState<AuditSeverity | "all">("all");
  const [page, setPage] = useState(0);

  const filtered = sevFilter === "all" ? events : events.filter(e => e.severity === sevFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEvents = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleFilter = (s: AuditSeverity | "all") => { setSevFilter(s); setPage(0); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "20px", alignItems: "start" }}>
      {/* Left: event feed + pagination */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0", minWidth: 0 }}>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          {(["all", ...SEV_ALL] as const).map(s => {
            const active = sevFilter === s;
            const color = s === "all" ? "#555" : SEV_COLOR[s];
            const count = s === "all" ? events.length : events.filter(e => e.severity === s).length;
            return (
              <button key={s} onClick={() => handleFilter(s)} style={{
                padding: "5px 13px", borderRadius: "20px", border: `1px solid ${active ? color : "#1e1e26"}`,
                background: active ? `${color}22` : "transparent",
                color: active ? color : "#555",
                fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                textTransform: "capitalize",
              }}>
                {s} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Event list — no scroll, fixed PAGE_SIZE items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: "13px" }}>
              No events for this filter
            </div>
          )}
          {pageEvents.map(evt => (
            <div
              key={evt.id}
              onClick={() => setSelected(evt)}
              style={{
                background: selected?.id === evt.id ? "#16161f" : "#0f0f12",
                border: `1px solid ${selected?.id === evt.id ? SEV_COLOR[evt.severity] + "55" : "#1e1e26"}`,
                borderLeft: `3px solid ${SEV_COLOR[evt.severity]}`,
                borderRadius: "8px",
                padding: "12px 16px",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <SeverityBadge sev={evt.severity} />
                <CategoryBadge cat={evt.category} />
                <span style={{ marginLeft: "auto", fontSize: "10px", color: "#444", fontFamily: "ui-monospace,monospace" }}>
                  {timeAgo(evt.detectedAt)}
                </span>
              </div>
              <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>{evt.title}</p>
              <p style={{ margin: 0, fontSize: "11px", color: "#555", lineHeight: "1.4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {evt.detail}
              </p>
              {evt.agentId && (
                <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#444", fontFamily: "ui-monospace,monospace" }}>
                  agent: {evt.agentId} · {evt.routerLabel}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", padding: "0 2px" }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: "5px 14px", borderRadius: "6px", border: "1px solid #1e1e26",
                background: "transparent", color: page === 0 ? "#333" : "#888",
                fontSize: "12px", fontWeight: 600, cursor: page === 0 ? "default" : "pointer",
              }}
            >← Prev</button>
            <span style={{ fontSize: "11px", color: "#444", fontFamily: "ui-monospace,monospace" }}>
              Page {page + 1} of {totalPages} · {filtered.length} events
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: "5px 14px", borderRadius: "6px", border: "1px solid #1e1e26",
                background: "transparent", color: page >= totalPages - 1 ? "#333" : "#888",
                fontSize: "12px", fontWeight: 600, cursor: page >= totalPages - 1 ? "default" : "pointer",
              }}
            >Next →</button>
          </div>
        )}
      </div>

      {/* Right: detail panel — sticky so it stays in view while left column paginates */}
      <div style={{
        position: "sticky", top: "20px",
        background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px",
        overflow: "hidden", display: "flex", flexDirection: "column",
        minHeight: "420px",
      }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "#333", padding: "48px 0" }}>
            <span style={{ fontSize: "32px" }}>🔍</span>
            <p style={{ fontSize: "12px", margin: 0 }}>Select an event to inspect</p>
          </div>
        ) : (() => {
          const agent = selected.agentId ? agentRisk.find(a => a.agentId === selected.agentId) : null;
          return (
            <div style={{ padding: "20px", overflowY: "auto" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <SeverityBadge sev={selected.severity} />
                <CategoryBadge cat={selected.category} />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 700, color: "#f0f0f0", lineHeight: "1.3" }}>{selected.title}</h3>
              <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888", lineHeight: "1.6" }}>{selected.detail}</p>

              {/* Meta grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                {[
                  ["Router", selected.routerLabel],
                  ["Agent", selected.agentId ?? "—"],
                  ["Detected", new Date(selected.detectedAt).toLocaleTimeString()],
                  ["Event ID", selected.id.slice(0, 22) + "…"],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", padding: "8px 10px" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{k}</p>
                    <p style={{ margin: 0, fontSize: "11px", color: "#ccc", fontFamily: "ui-monospace,monospace", wordBreak: "break-all" }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Model */}
              {agent?.model && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#444" }}>AI Model</p>
                  <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px", background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", padding: "10px 12px" }}>
                    <span style={{ fontSize: "14px" }}>⚡</span>
                    <span style={{ fontSize: "12px", color: "#c77c3a", fontFamily: "ui-monospace,monospace", fontWeight: 600 }}>{agent.model}</span>
                  </div>
                </>
              )}

              {/* Skills / Tools */}
              {agent && agent.allSkills.length > 0 && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#444" }}>Skills & Tools</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                    {agent.allSkills.map(sk => {
                      const isPriv = agent.privilegedSkills.includes(sk);
                      return (
                        <span
                          key={sk}
                          title={skillDescriptions[sk] ?? sk}
                          style={{
                            fontSize: "10px", fontWeight: 600, padding: "3px 9px",
                            borderRadius: "20px",
                            background: isPriv ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.04)",
                            color: isPriv ? "#f97316" : "#666",
                            border: `1px solid ${isPriv ? "rgba(249,115,22,0.3)" : "#1e1e26"}`,
                            cursor: "default",
                          }}
                        >
                          {isPriv ? "⚠ " : ""}{sk}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Agent profile summary */}
              {agent && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#444" }}>Agent Profile</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "16px" }}>
                    {[
                      ["Tier", agent.tier],
                      ["Configured", agent.configured ? "✓ yes" : "✗ no"],
                      ["Sessions", String(agent.activeSessions)],
                      ["Risk Score", String(agent.riskScore)],
                      ["Tokens", agent.totalTokens > 1000 ? `${(agent.totalTokens/1000).toFixed(1)}K` : String(agent.totalTokens)],
                      ["Cost", `$${agent.estimatedCost.toFixed(4)}`],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", padding: "7px 10px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k}</p>
                        <p style={{ margin: 0, fontSize: "11px", color: k === "Configured" ? (agent.configured ? "#22c55e" : "#ef4444") : "#ccc", fontFamily: "ui-monospace,monospace" }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Evidence */}
              <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#444" }}>Evidence</p>
              <div style={{ background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <tbody>
                    {Object.entries(selected.evidence).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px solid #12121a" }}>
                        <td style={{ padding: "7px 12px", color: "#555", fontWeight: 600, whiteSpace: "nowrap", width: "40%" }}>{k}</td>
                        <td style={{ padding: "7px 12px", color: "#aaa", fontFamily: "ui-monospace,monospace", wordBreak: "break-all" }}>
                          {Array.isArray(v) ? v.join(", ") : String(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Infrastructure Tab ────────────────────────────────────────────────────────

function InfrastructureTab({ routers }: { routers: RouterHealthSnapshot[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
      {routers.map(r => {
        const borderColor = !r.reachable ? "#ef4444" : r.hasRecentRestart || r.isStaleVersion ? "#f59e0b" : "#22c55e";
        const statusLabel = !r.reachable ? "UNREACHABLE" : r.hasRecentRestart ? "RESTARTED" : "HEALTHY";
        const statusColor = !r.reachable ? "#ef4444" : r.hasRecentRestart ? "#f59e0b" : "#22c55e";
        return (
          <div key={r.routerId} style={{
            background: "#0f0f12", border: `1px solid ${borderColor}44`,
            borderTop: `2px solid ${borderColor}`,
            borderRadius: "10px", padding: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: "14px", fontWeight: 700, color: "#f0f0f0" }}>{r.routerLabel}</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#555", fontFamily: "ui-monospace,monospace" }}>{r.hostname}</p>
              </div>
              <span style={{
                padding: "3px 9px", borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                letterSpacing: "0.06em", background: `${statusColor}22`, color: statusColor,
                border: `1px solid ${statusColor}44`,
              }}>
                {statusLabel}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {[
                ["OS",         r.osLabel],
                ["Platform",   r.platform],
                ["Node.js",    r.nodeVersion],
                ["Router v",   r.routerVersion + (r.isStaleVersion ? " ⚠" : "")],
                ["Uptime",     r.reachable ? uptimeFmt(r.uptimeSeconds) : "—"],
                ["Agents",     String(r.agentCount)],
                ["Sessions",   String(r.activeSessionCount)],
                ["Router ID",  r.routerId.slice(0, 8) + "…"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", padding: "7px 10px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{k}</p>
                  <p style={{ margin: 0, fontSize: "12px", color: v.includes("⚠") ? "#f59e0b" : "#ccc", fontFamily: "ui-monospace,monospace" }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {routers.length === 0 && (
        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px", color: "#333" }}>No routers found</div>
      )}
    </div>
  );
}

// ── Agent Risk Tab ────────────────────────────────────────────────────────────

function AgentRiskTab({ agents }: { agents: AgentRiskEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e1e26" }}>
            {["#", "Agent", "Tier", "Risk Score", "Sessions", "Cost", "Privileged Skills", "Flags"].map((h, i) => (
              <th key={h} style={{
                padding: i === 0 ? "10px 10px 10px 20px" : "10px 12px",
                textAlign: i >= 3 && i <= 5 ? "right" : "left",
                color: "#444", fontWeight: 600, fontSize: "10px",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => {
            const riskColor = a.riskScore >= 60 ? "#ef4444" : a.riskScore >= 30 ? "#f97316" : a.riskScore >= 15 ? "#f59e0b" : "#6b7280";
            const isExpanded = expandedId === a.agentId;
            return (
              <React.Fragment key={a.agentId}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : a.agentId)}
                  style={{
                    borderBottom: isExpanded ? "none" : "1px solid #13131a",
                    cursor: "pointer",
                    background: isExpanded ? "#131318" : "transparent",
                    transition: "background 0.12s",
                  }}
                >
                  <td style={{ padding: "10px 10px 10px 20px", color: "#333", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{i + 1}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div>
                      <p style={{ margin: 0, color: "#d0d0d0", fontWeight: 600 }}>{a.agentName}</p>
                      <p style={{ margin: 0, color: "#444", fontSize: "10px", fontFamily: "ui-monospace,monospace" }}>{a.agentId} · {a.routerLabel}</p>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {a.tier !== "unknown" ? (
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600,
                        background: a.tier === "orchestrator" ? "#8b5cf622" : "#38bdf822",
                        color: a.tier === "orchestrator" ? "#8b5cf6" : "#38bdf8",
                      }}>{a.tier}</span>
                    ) : <span style={{ color: "#333" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                      <span style={{ color: riskColor, fontFamily: "ui-monospace,monospace", fontWeight: 700, fontSize: "13px" }}>{a.riskScore}</span>
                      <div style={{ width: "64px", height: "4px", background: "#1e1e26", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ width: `${a.riskScore}%`, height: "100%", background: riskColor, borderRadius: "2px" }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: a.activeSessions > 0 ? "#f0f0f0" : "#555", fontFamily: "ui-monospace,monospace" }}>
                    {a.activeSessions}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: ORANGE, fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>
                    {fmtCost(a.estimatedCost)}
                  </td>
                  <td style={{ padding: "10px 12px", maxWidth: "180px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                      {a.privilegedSkills.slice(0, 3).map(s => (
                        <span key={s} style={{
                          padding: "1px 6px", borderRadius: "3px", fontSize: "9px", fontWeight: 600,
                          background: "#e85d2718", color: "#e85d27",
                        }}>{s}</span>
                      ))}
                      {a.privilegedSkills.length > 3 && (
                        <span style={{ fontSize: "9px", color: "#555" }}>+{a.privilegedSkills.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {!a.configured && <span style={{ padding: "1px 6px", borderRadius: "3px", fontSize: "9px", fontWeight: 700, background: "#ef444422", color: "#ef4444" }}>UNCONFIGURED</span>}
                      {a.riskFactors.length > 0 && <span style={{ color: "#444", fontSize: "10px" }}>{a.riskFactors.length} flag{a.riskFactors.length > 1 ? "s" : ""}</span>}
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr style={{ borderBottom: "1px solid #13131a", background: "#0d0d14" }}>
                    <td colSpan={8} style={{ padding: "12px 20px 16px" }}>
                      <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Risk Factors</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                        {a.riskFactors.length === 0
                          ? <span style={{ color: "#333", fontSize: "11px" }}>No risk factors</span>
                          : a.riskFactors.map(f => (
                            <span key={f} style={{
                              padding: "3px 10px", borderRadius: "4px", fontSize: "11px",
                              background: "#1e1e26", color: "#aaa", border: "1px solid #252530",
                            }}>{f}</span>
                          ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                        {[
                          ["Total Tokens",   fmtTokens(a.totalTokens)],
                          ["Last Active",    a.lastActiveAt > 0 ? timeAgo(a.lastActiveAt) : "Never"],
                          ["Router",         a.routerLabel],
                          ["Configured",     a.configured ? "Yes" : "No"],
                        ].map(([k, v]) => (
                          <div key={k} style={{ background: "#080810", border: "1px solid #1a1a22", borderRadius: "6px", padding: "7px 10px" }}>
                            <p style={{ margin: "0 0 2px", fontSize: "9px", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{k}</p>
                            <p style={{ margin: 0, fontSize: "12px", color: "#ccc", fontFamily: "ui-monospace,monospace" }}>{v}</p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {agents.length === 0 && (
            <tr><td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "#333" }}>No agent risk data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Live Trends Tab ───────────────────────────────────────────────────────────

interface TrendPoint {
  t: string;
  activeSessions: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalTokens: number;
}

function buildPoint(data: AuditEventsResponse): TrendPoint {
  const now = new Date();
  const t = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  return {
    t,
    activeSessions: data.summary.activeSessionCount,
    critical: data.summary.critical,
    high: data.summary.high,
    medium: data.summary.medium,
    low: data.summary.low,
    totalTokens: data.agentRisk.reduce((s, a) => s + a.totalTokens, 0),
  };
}

function LiveTrendsTab({ data }: { data: AuditEventsResponse }) {
  const [history, setHistory] = useState<TrendPoint[]>(() => {
    const seed = buildPoint(data);
    return Array(10).fill(seed);
  });

  useEffect(() => {
    const point = buildPoint(data);
    setHistory(prev => [...prev.slice(-29), point]);
  }, [data]);

  const gwData = data.routers.map(r => ({
    name: r.routerLabel,
    uptimeDays: r.reachable ? parseFloat((r.uptimeSeconds / 86400).toFixed(2)) : 0,
    color: !r.reachable ? "#ef4444" : r.hasRecentRestart ? "#f59e0b" : "#22c55e",
  }));

  const chartTooltipStyle = {
    background: "#0f0f12", border: "1px solid #1e1e26",
    borderRadius: "8px", padding: "10px 14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    fontSize: "11px", color: "#ccc",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
      {/* Active sessions over time */}
      <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px" }}>
        <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Active Sessions (live)</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" />
            <XAxis dataKey="t" tick={{ fill: "#444", fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#444", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Line type="monotone" dataKey="activeSessions" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Event count by severity */}
      <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px" }}>
        <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Events by Severity</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" />
            <XAxis dataKey="t" tick={{ fill: "#444", fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#444", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="#ef444420" strokeWidth={1.5} />
            <Area type="monotone" dataKey="high"     stackId="1" stroke="#f97316" fill="#f9731620" strokeWidth={1.5} />
            <Area type="monotone" dataKey="medium"   stackId="1" stroke="#f59e0b" fill="#f59e0b18" strokeWidth={1.5} />
            <Area type="monotone" dataKey="low"      stackId="1" stroke="#6b7280" fill="#6b728018" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Token rate */}
      <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px" }}>
        <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cumulative Token Volume</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" />
            <XAxis dataKey="t" tick={{ fill: "#444", fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#444", fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip contentStyle={chartTooltipStyle}
              formatter={(v) => [fmtTokens(Number(v ?? 0)), "Tokens"]} />
            <Area type="monotone" dataKey="totalTokens" stroke={ORANGE} fill={`${ORANGE}20`} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Gateway uptime */}
      <div style={{ background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "10px", padding: "20px" }}>
        <p style={{ margin: "0 0 16px", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gateway Uptime (days)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={gwData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a22" />
            <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: "#444", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={chartTooltipStyle}
              formatter={(v) => [`${Number(v ?? 0)} days`, "Uptime"]} />
            <Bar dataKey="uptimeDays" radius={[4, 4, 0, 0]}>
              {gwData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [data, setData] = useState<AuditEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<number>(0);
  const [tab, setTab] = useState<Tab>("events");
  const [tick, setTick] = useState(0);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/audit/events");
      if (!res.ok) throw new Error(`Audit API error: ${res.status}`);
      const json: AuditEventsResponse = await res.json();
      setData(json);
      setLastScannedAt(json.summary.generatedAt);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false).then(() => setLoading(false));
    const poll = setInterval(() => fetchData(true), 60_000);
    const tickInterval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => { clearInterval(poll); clearInterval(tickInterval); };
  }, [fetchData]);

  function exportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Skeleton />;

  // Security posture label
  const critCount = data?.summary.critical ?? 0;
  const highCount = data?.summary.high ?? 0;
  const postureLabel = critCount > 0 ? "CRITICAL" : highCount > 0 ? "ELEVATED" : "NOMINAL";
  const postureColor = critCount > 0 ? "#ef4444" : highCount > 0 ? "#f97316" : "#22c55e";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060608", color: "#f0f0f0", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #1a1a22", background: "#060608", padding: "0 24px", display: "flex", alignItems: "center", height: "52px", gap: "16px", flexShrink: 0 }}>
        <span style={{ color: "#888", fontSize: "13px" }}>Mission Control</span>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#f0f0f0", fontSize: "13px", fontWeight: 500 }}>Agent Healthcheck</span>
        <div style={{ flex: 1 }} />
        {error && (
          <span style={{ fontSize: "11px", color: "#ef4444", fontFamily: "ui-monospace,monospace" }}>{error}</span>
        )}
        {lastScannedAt > 0 && (
          <span style={{ fontSize: "11px", color: "#333", fontFamily: "ui-monospace,monospace" }}>
            Scanned {timeAgo(lastScannedAt)}
          </span>
        )}
        <button
          onClick={exportJson}
          disabled={!data}
          style={{
            background: "transparent", border: "1px solid #1e1e26",
            color: "#555", borderRadius: "6px", padding: "5px 12px",
            fontSize: "11px", cursor: "pointer",
          }}
        >
          Export JSON
        </button>
        <button
          onClick={() => fetchData()}
          disabled={refreshing}
          style={{
            background: "transparent", border: "1px solid #1e1e26",
            color: "#555", borderRadius: "6px", padding: "5px 12px",
            fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Rescan
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <NavRail activeView="audit" onViewChange={(v) => {
          if (v === "mission") window.location.href = "/";
          if (v === "swarms") window.location.href = "/teams";
          if (v === "activities") window.location.href = "/activities";
          if (v === "spending") window.location.href = "/spending";
        }} />

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 40px", display: "flex", flexDirection: "column", gap: "28px" }}>

            {/* Page header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#f0f0f0", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>Agent Healthcheck</h1>
                <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>Monitor the health and status of your AI agent fleet</p>
              </div>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px",
                padding: "12px 18px", background: `${postureColor}12`,
                border: `1px solid ${postureColor}33`, borderRadius: "10px",
              }}>
                <span style={{ fontSize: "9px", color: "#555", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Security Posture</span>
                <span style={{ fontSize: "20px", fontWeight: 800, color: postureColor, letterSpacing: "0.04em" }}>
                  {postureLabel}
                </span>
              </div>
            </div>

            {/* KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
              <KpiCard
                label="Critical Events"
                value={data?.summary.critical ?? 0}
                sub={`${data?.summary.high ?? 0} high severity`}
                accent="#ef4444"
                alert
              />
              <KpiCard
                label="High Severity"
                value={data?.summary.high ?? 0}
                sub={`${data?.summary.medium ?? 0} medium`}
                accent="#f97316"
              />
              <KpiCard
                label="Gateways Online"
                value={`${(data?.summary.routersChecked ?? 0) - (data?.summary.routersFailed ?? 0)} / ${data?.summary.routersChecked ?? 0}`}
                sub={data?.summary.routersFailed ? `${data.summary.routersFailed} unreachable` : "all healthy"}
                accent={data?.summary.routersFailed ? "#ef4444" : "#22c55e"}
              />
              <KpiCard
                label="Active Sessions"
                value={data?.summary.activeSessionCount ?? 0}
                sub={`${data?.summary.agentsScanned ?? 0} agents scanned`}
                accent="#38bdf8"
              />
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "4px", background: "#0f0f12", border: "1px solid #1e1e26", borderRadius: "8px", padding: "4px" }}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: "7px 18px", borderRadius: "6px", border: "none", cursor: "pointer",
                      fontSize: "12px", fontWeight: 600,
                      background: tab === t.id ? ORANGE : "transparent",
                      color: tab === t.id ? "#fff" : "#555",
                      transition: "all 0.15s",
                    }}
                  >{t.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#333", fontFamily: "ui-monospace,monospace" }}>
                  {data?.summary.totalEvents ?? 0} total events
                </span>
              </div>
            </div>

            {/* Tab content */}
            {tab === "events" && data && <EventsTab events={data.events} agentRisk={data.agentRisk} />}
            {tab === "infrastructure" && data && <InfrastructureTab routers={data.routers} />}
            {tab === "agents" && data && <AgentRiskTab agents={data.agentRisk} />}
            {tab === "trends" && data && <LiveTrendsTab data={data} />}

          </div>
        </div>
      </div>
    </div>
  );
}
