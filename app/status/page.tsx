"use client";

import { useEffect, useState, useCallback } from "react";
import type { Incident } from "@/app/api/incidents/route";

// ── helpers ────────────────────────────────────────────────────────────────
function shortModel(m: string): string {
  const s = m.split("/").pop() ?? m;
  if (/gemini/i.test(s)) {
    const v = s.match(/gemini[-_.]?(\d+\.?\d*)/i);
    return v ? `gemini-${v[1]}` : "gemini";
  }
  if (/claude/i.test(s)) {
    const v = s.match(/claude[-_.]?([\w.]+)/i);
    return v ? `claude-${v[1]}` : "claude";
  }
  return s.length > 22 ? s.slice(0, 20) + "…" : s;
}

function modelColor(m: string): string {
  const l = m.toLowerCase();
  if (l.includes("gemini") || l.includes("google")) return "#4285f4";
  if (l.includes("claude") || l.includes("anthropic")) return "#e85d27";
  if (l.includes("gpt") || l.includes("openai")) return "#10a37f";
  if (l.includes("mistral")) return "#7c3aed";
  return "#888";
}

function timeAgo(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 1000);
  if (d < 60)  return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function duration(startMs: number, endMs?: number): string {
  const diff = Math.floor(((endMs ?? Date.now()) - startMs) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

// ── types ──────────────────────────────────────────────────────────────────
interface AgentEntry {
  id: string;
  name?: string;
  soul?: string;
  tier?: string;
  routerId: string;
  routerLabel?: string;
  configured: boolean;
  lastActiveAt?: number;
  model?: string;  // from live-models
}

// ── sub-components ─────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: active ? "#22c55e" : "#444",
      boxShadow: active ? "0 0 6px #22c55e88" : "none",
      flexShrink: 0,
    }} />
  );
}

function AgentCard({ agent }: { agent: AgentEntry }) {
  const isActive = !!agent.lastActiveAt && Date.now() - agent.lastActiveAt < 10 * 60 * 1000;
  const mc = agent.model ? modelColor(agent.model) : "#555";
  return (
    <div style={{
      background: "#111", border: "1px solid #1e1e1e", borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
      transition: "border-color 0.15s",
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot active={isActive} />
        <span style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {agent.name ?? agent.id}
        </span>
        {agent.tier && (
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", background: "#1a1a1a", padding: "2px 6px", borderRadius: 4 }}>
            {agent.tier}
          </span>
        )}
      </div>

      {agent.model ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9 }}>⚡</span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
            color: mc, background: `${mc}18`, border: `1px solid ${mc}30`,
            padding: "2px 7px", borderRadius: 4,
          }}>
            {shortModel(agent.model)}
          </span>
        </div>
      ) : (
        <span style={{ fontSize: 10, color: "#333" }}>model unknown</span>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: "#555" }}>
          {agent.routerLabel ?? agent.routerId.slice(0, 8)}
        </span>
        <span style={{ fontSize: 10, color: "#444" }}>
          {agent.lastActiveAt ? timeAgo(agent.lastActiveAt) : "never"}
        </span>
      </div>
    </div>
  );
}

const INCIDENT_LABELS: Record<string, string> = {
  model_fallback: "Model Fallback",
  api_error:      "API Error",
  tool_error:     "Tool Error",
};

const INCIDENT_COLORS: Record<string, string> = {
  model_fallback: "#f59e0b",
  api_error:      "#ef4444",
  tool_error:     "#f97316",
};

function IncidentRow({ inc }: { inc: Incident }) {
  const [open, setOpen] = useState(false);
  const color = INCIDENT_COLORS[inc.type] ?? "#888";
  const ongoing = !inc.resolvedAt || inc.resolvedAt === inc.startedAt;
  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        padding: "10px 14px", borderBottom: "1px solid #0e0e0e",
        cursor: "pointer", transition: "background 0.12s",
        borderLeft: `2px solid ${color}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Status */}
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          color: ongoing ? color : "#555",
          background: ongoing ? `${color}18` : "#1a1a1a",
          border: `1px solid ${ongoing ? color + "40" : "#2a2a2a"}`,
          padding: "2px 7px", borderRadius: 4, flexShrink: 0,
        }}>
          {ongoing ? "●  ongoing" : "✓  resolved"}
        </span>

        {/* Type */}
        <span style={{ fontSize: 10, fontWeight: 600, color, flexShrink: 0 }}>
          {INCIDENT_LABELS[inc.type] ?? inc.type}
        </span>

        {/* Agent */}
        <span style={{ fontSize: 11, color: "#888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {inc.agentId}
          <span style={{ color: "#444", marginLeft: 4 }}>
            · {inc.routerLabel ?? inc.routerId.slice(0, 8)}
          </span>
        </span>

        {/* Time */}
        <span style={{ fontSize: 10, color: "#444", flexShrink: 0 }}>
          {fmtDate(inc.startedAt)} {fmtTime(inc.startedAt)}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#0a0a0a", borderRadius: 6 }}>
          <p style={{ fontSize: 11, color: "#888", margin: 0, lineHeight: 1.6 }}>
            {inc.message}
          </p>
          {inc.fromModel && (
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#555" }}>From:</span>
              <code style={{ fontSize: 10, color: modelColor(inc.fromModel), background: `${modelColor(inc.fromModel)}15`, padding: "1px 6px", borderRadius: 3 }}>{inc.fromModel}</code>
              <span style={{ fontSize: 10, color: "#333" }}>→</span>
              <code style={{ fontSize: 10, color: inc.toModel ? modelColor(inc.toModel) : "#888", background: inc.toModel ? `${modelColor(inc.toModel)}15` : "#1a1a1a", padding: "1px 6px", borderRadius: 3 }}>{inc.toModel ?? "unknown"}</code>
            </div>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#444" }}>
              Started: <span style={{ color: "#666" }}>{new Date(inc.startedAt).toLocaleString()}</span>
            </span>
            {inc.resolvedAt && inc.resolvedAt !== inc.startedAt && (
              <span style={{ fontSize: 10, color: "#444" }}>
                Resolved: <span style={{ color: "#666" }}>{new Date(inc.resolvedAt).toLocaleString()}</span>
                <span style={{ color: "#444", marginLeft: 6 }}>({duration(inc.startedAt, inc.resolvedAt)})</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export default function StatusPage() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [incLoading, setIncLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [incFilter, setIncFilter] = useState<"all" | "ongoing" | "model_fallback" | "api_error" | "tool_error">("all");

  const load = useCallback(async () => {
    try {
      const [agentsData, costTelemetry, liveModels, activitiesData] = await Promise.all([
        fetch("/api/agents").then(r => r.json()),
        fetch("/api/telemetry/agent-costs").then(r => r.json()).catch(() => ({ costs: [] })),
        fetch("/api/agent-live-models").then(r => r.json()),
        fetch("/api/activities").then(r => r.json()),
      ]);

      const rawAgents: AgentEntry[] = (agentsData.agents ?? []);

      // Build model map: cost telemetry as baseline, live-models as override
      const models: Record<string, string> = {};
      for (const c of (costTelemetry.costs ?? []) as Array<{ agentId: string; model?: string; routerId?: string }>) {
        if (c.model) {
          if (c.routerId) models[`${c.routerId}--${c.agentId}`] = c.model;
          if (!models[c.agentId]) models[c.agentId] = c.model;
        }
      }
      for (const [key, model] of Object.entries(liveModels.models ?? {} as Record<string, string>)) {
        models[key] = model;
      }
      const sessions: Array<{ agentId: string; routerId: string; updatedAt: number }> = activitiesData.sessions ?? [];

      // Build lastActiveAt per routerId--agentId
      const lastActive = new Map<string, number>();
      for (const s of sessions) {
        const key = `${s.routerId}--${s.agentId}`;
        const prev = lastActive.get(key) ?? 0;
        if (s.updatedAt > prev) lastActive.set(key, s.updatedAt);
      }

      const enriched: AgentEntry[] = rawAgents.map(a => ({
        ...a,
        model: models[`${a.routerId}--${a.id}`] ?? models[a.id],
        lastActiveAt: lastActive.get(`${a.routerId}--${a.id}`) ?? a.lastActiveAt,
      }));

      // Sort: active first, then by lastActiveAt desc
      enriched.sort((a, b) => {
        const aActive = !!a.lastActiveAt && Date.now() - a.lastActiveAt < 10 * 60 * 1000;
        const bActive = !!b.lastActiveAt && Date.now() - b.lastActiveAt < 10 * 60 * 1000;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
      });

      setAgents(enriched);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    setIncLoading(true);
    try {
      const data = await fetch("/api/incidents").then(r => r.json());
      setIncidents(data.incidents ?? []);
    } catch { /* ignore */ } finally {
      setIncLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadIncidents();
    const iv = setInterval(load, 30_000);
    const iv2 = setInterval(loadIncidents, 60_000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, [load, loadIncidents]);

  const activeCount  = agents.filter(a => !!a.lastActiveAt && Date.now() - a.lastActiveAt < 10 * 60 * 1000).length;
  const ongoingCount = incidents.filter(i => !i.resolvedAt || i.resolvedAt === i.startedAt).length;

  const filteredIncidents = incidents.filter(i => {
    if (incFilter === "all") return true;
    if (incFilter === "ongoing") return !i.resolvedAt || i.resolvedAt === i.startedAt;
    return i.type === incFilter;
  });

  return (
    <div style={{ display: "flex", height: "100vh", background: "#080808", color: "#e0e0e0", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      {/* Nav rail */}
      <aside style={{ width: 60, borderRight: "1px solid #1a1a1a", background: "#0e0e0e", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 4, flexShrink: 0 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 40, textDecoration: "none", marginBottom: 16 }}>
          <span style={{ fontSize: 22, color: "#e85d27" }}>◈</span>
        </a>
        {[
          { href: "/", icon: "🎯", label: "Canvas" },
          { href: "/teams", icon: "🐝", label: "Teams" },
          { href: "/activities", icon: "⚡", label: "Activities" },
          { href: "/spending", icon: "💰", label: "Spending" },
          { href: "/healthcheck", icon: "🔐", label: "Security" },
          { href: "/status", icon: "🛡", label: "Status", active: true },
        ].map(({ href, icon, label, active }) => (
          <a key={href} href={href} title={label} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: 40, textDecoration: "none", position: "relative",
            color: active ? "#e85d27" : "#666",
            background: active ? "#1a0f0a" : "transparent",
            fontSize: 18, transition: "color 0.15s",
          }}>
            {active && <span style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: "#e85d27", borderRadius: 0 }} />}
            {icon}
          </a>
        ))}
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Mission Control</span>
              <span style={{ fontSize: 11, color: "#333" }}>/</span>
              <span style={{ fontSize: 11, color: "#888" }}>Agent Status</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f0f0f0", lineHeight: 1.3 }}>
              Agent Status & Incidents
            </h1>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            {ongoingCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#1a0a0a", border: "1px solid #ef444440", borderRadius: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>{ongoingCount} ongoing</span>
              </div>
            )}
            <span style={{ fontSize: 10, color: "#333" }}>↻ {timeAgo(lastRefresh)}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Agent grid */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
                Agents
              </h2>
              <span style={{ fontSize: 10, color: "#333" }}>
                {activeCount} active · {agents.length} total
              </span>
              {loading && <span style={{ fontSize: 10, color: "#333", marginLeft: "auto" }}>Loading…</span>}
            </div>

            {!loading && agents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#333", fontSize: 12 }}>No agents found</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {agents.map(a => (
                  <AgentCard key={`${a.routerId}--${a.id}`} agent={a} />
                ))}
              </div>
            )}
          </section>

          {/* Incidents */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
                Incidents
              </h2>
              <span style={{ fontSize: 10, color: "#333" }}>last 24 hours</span>
              {incLoading && <span style={{ fontSize: 10, color: "#333" }}>Loading…</span>}

              {/* Filters */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {([
                  ["all", `All ${incidents.length}`],
                  ["ongoing", `Ongoing ${ongoingCount}`],
                  ["model_fallback", "Fallbacks"],
                  ["api_error",      "API Errors"],
                  ["tool_error",     "Tool Errors"],
                ] as const).map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setIncFilter(f)}
                    style={{
                      fontSize: 10, padding: "3px 9px", borderRadius: 5, border: "1px solid transparent",
                      cursor: "pointer", background: incFilter === f ? "#1a1a1a" : "transparent",
                      color: incFilter === f ? "#e0e0e0" : "#444",
                      borderColor: incFilter === f ? "#2a2a2a" : "transparent",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 8, overflow: "hidden" }}>
              {!incLoading && filteredIncidents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#333", fontSize: 12 }}>
                  No incidents in the last 24 hours
                </div>
              ) : (
                filteredIncidents.map(inc => (
                  <IncidentRow key={inc.id} inc={inc} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>
    </div>
  );
}
