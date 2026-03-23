"use client";

import { Agent } from "@/lib/agents";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { SessionGroup } from "@/app/api/agent-sessions/route";
import type { ScheduledJob } from "@/app/api/cron-schedule/route";
import type { NodeInfo } from "@/app/api/node-info/route";

interface Props {
  agent: Agent;
  onBack: () => void;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - (ms > 1e12 ? ms : ms * 1000);
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTokens(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function parseHeartbeatLines(content: string): Array<{ name: string; schedule: string; desc: string }> {
  const results: Array<{ name: string; schedule: string; desc: string }> = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\s*(?:\((.+?)\))?\*\*:?\s*(.*)/);
    if (m) results.push({ name: m[1].trim(), schedule: m[2]?.trim() ?? "", desc: m[3]?.trim() ?? "" });
  }
  return results.slice(0, 8);
}

// Deterministic color from a string
const PALETTE = ["#e85d27","#3b82f6","#8b5cf6","#10b981","#f59e0b","#ec4899","#06b6d4","#84cc16"];
function accentColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Emoji icon for common skills
const SKILL_ICONS: Record<string, string> = {
  calendar:"📅", notion:"📝", jira:"🎯", slack:"💬", telegram:"✈️",
  github:"🔧", email:"📧", search:"🔍", gog:"🎮", sheets:"📊",
  docs:"📄", drive:"☁️", browser:"🌐", api:"🔌", database:"🗄️",
  code:"💻", git:"🔀", figma:"🎨", linear:"📐", trello:"📋",
  twitter:"🐦", discord:"🎮", openai:"🤖", claude:"🧠", news:"📰",
  finance:"💹", stocks:"📈", crypto:"🪙", weather:"⛅", maps:"🗺️",
};
function skillEmoji(s: string): string {
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(SKILL_ICONS)) {
    if (lower.includes(k)) return v;
  }
  return "⚡";
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  cron:       "#f59e0b",
  "tg-topic": "#3b82f6",
  "tg-direct":"#8b5cf6",
  "tg-group": "#6366f1",
  main:       "#6b7280",
  subagent:   "#10b981",
};

const VALIDITY_COLOR: Record<string, string> = {
  active:"#22c55e", overdue:"#f59e0b", stale:"#f97316", paused:"#6b7280", unconfirmed:"#6366f1",
};

// ── session detail fetch ─────────────────────────────────────────────────────

interface SessionDetail {
  loading: boolean;
  prompt?: string;
  lastDelivery?: string;
  deliveryTime?: string;
  destination?: string;
  eventCount?: number;
}

function cleanMsg(msg: string): string {
  return msg
    .replace(/^[🤖💬🛠️🧠❌]\s*/, "")
    .replace(/<final>[\s\S]*?<\/final>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^NO_REPLY\s*/i, "")
    .trim();
}

// ── component ────────────────────────────────────────────────────────────────

export default function AgentProfileStage({ agent, onBack }: Props) {
  const [groups,   setGroups]   = useState<SessionGroup[]>([]);
  const [cronJobs, setCronJobs] = useState<ScheduledJob[]>([]);
  const [heartbeat,setHeartbeat]= useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [activeTab,setActiveTab]= useState<"activity"|"crons"|"skills">("activity");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<Record<string, SessionDetail>>({});
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);

  useEffect(() => {
    const routerId = agent.routerId ?? "legacy";
    setLoading(true);
    Promise.allSettled([
      fetch(`/api/agent-sessions?agent=${encodeURIComponent(agent.id)}&routerId=${encodeURIComponent(routerId)}`)
        .then(r => r.json()).then(d => setGroups(d.groups ?? [])),
      fetch(`/api/cron-schedule`)
        .then(r => r.json()).then(d => setCronJobs((d.jobs ?? []).filter((j: ScheduledJob) => j.agentId === agent.id))),
      fetch(`/api/agent-file?agent=${encodeURIComponent(agent.id)}&file=HEARTBEAT.md&routerId=${encodeURIComponent(routerId)}`)
        .then(r => r.json()).then(d => setHeartbeat(d.content ?? null)).catch(() => {}),
      fetch(`/api/node-info`)
        .then(r => r.json()).then((d: { nodes?: NodeInfo[] }) => {
          const match = (d.nodes ?? []).find(n => n.routerId === routerId);
          if (match) setNodeInfo(match);
        }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [agent.id, agent.routerId]);

  // ── expand a session row and lazy-fetch its detail ──────────────────────
  function toggleSession(sessionKey: string) {
    if (expandedKey === sessionKey) { setExpandedKey(null); return; }
    setExpandedKey(sessionKey);
    if (sessionDetails[sessionKey]) return; // already fetched

    const routerId = agent.routerId ?? "legacy";
    setSessionDetails(prev => ({ ...prev, [sessionKey]: { loading: true } }));

    fetch(`/api/agent-session?agent=${encodeURIComponent(agent.id)}&routerId=${encodeURIComponent(routerId)}&sessionKey=${encodeURIComponent(sessionKey)}`)
      .then(r => r.json())
      .then((events: Array<{ type: string; message: string; fullMessage?: string; timestamp?: string }>) => {
        const arr = Array.isArray(events) ? events : [];

        // Prompt: first chat message
        const firstChat = arr.find(e => e.type === "chat" || e.message?.startsWith("💬"));
        const prompt = firstChat ? cleanMsg(firstChat.fullMessage ?? firstChat.message) : undefined;

        // Last delivery: last 🤖 that isn't NO_REPLY
        const outputs = arr.filter(e =>
          e.message?.startsWith("🤖") &&
          !e.message.includes("NO_REPLY") &&
          !e.message.match(/^🤖\s*<final>\s*<\/final>/)
        );
        const lastOut = outputs[outputs.length - 1];
        const lastDelivery = lastOut ? cleanMsg(lastOut.fullMessage ?? lastOut.message) : undefined;
        const deliveryTime = lastOut?.timestamp ?? undefined;

        // Destination: look for telegram send tool call
        let destination: string | undefined;
        for (const e of arr) {
          const m = (e.fullMessage ?? e.message ?? "").match(/message\(\{"action":"send","channel":"telegram"[^}]*"chatId":(-?\d+)[^}]*"topic(?:Id)?":(\d+)/);
          if (m) { destination = `📨 Telegram ${m[1]} · topic ${m[2]}`; break; }
        }

        setSessionDetails(prev => ({
          ...prev,
          [sessionKey]: { loading: false, prompt, lastDelivery, deliveryTime, destination, eventCount: arr.length },
        }));
      })
      .catch(() => setSessionDetails(prev => ({ ...prev, [sessionKey]: { loading: false } })));
  }

  const totalSessions = groups.reduce((s, g) => s + g.count, 0);
  const totalTokens   = groups.reduce((s, g) => s + g.totalTokens, 0);
  const isActive      = agent.status === "online";
  const lastSeen      = groups.reduce((t, g) => Math.max(t, g.lastUpdated), 0);
  const hbLines       = heartbeat ? parseHeartbeatLines(heartbeat) : [];

  const allSessions = groups
    .flatMap(g => g.sessions.map(s => ({ ...s, groupType: g.type, groupIcon: g.icon, groupLabel: g.label })))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);

  const tabs = [
    { key: "activity" as const, label: "Activity",         icon: "⚡", count: allSessions.length },
    { key: "crons"    as const, label: "Scheduled Crons",  icon: "⏰", count: cronJobs.length },
    { key: "skills"   as const, label: "Skills & Identity",icon: "✦",  count: agent.skills.length },
  ];

  return (
    <div className="flex flex-col h-full w-full text-zinc-100 overflow-hidden" style={{ background: "#080810" }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
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

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center shrink-0 px-5 gap-1"
        style={{ background: "#08080f", borderBottom: "1px solid #12121e" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="relative flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all"
            style={{ color: activeTab === t.key ? "#f0f0f8" : "#3f3f52" }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.count > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold"
                style={{
                  background: activeTab === t.key ? "rgba(232,93,39,0.2)" : "rgba(255,255,255,0.04)",
                  color: activeTab === t.key ? "#e85d27" : "#2e2e3e",
                }}>{t.count}</span>
            )}
            {activeTab === t.key && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t"
                style={{ background: "linear-gradient(90deg, #e85d27, #f97316)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#1a1a2e transparent" }}>

        {/* ── ACTIVITY ────────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-20">
                <div className="w-5 h-5 rounded-full border-2 border-t-orange-500 animate-spin" style={{ borderColor: "#1a1a2e", borderTopColor: "#e85d27" }} />
                <span className="text-xs" style={{ color: "#3f3f52" }}>Loading activity…</span>
              </div>
            ) : allSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <span className="text-3xl opacity-20">🗂</span>
                <p className="text-sm" style={{ color: "#3f3f52" }}>No sessions recorded yet</p>
              </div>
            ) : (
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
                          onClick={() => toggleSession(s.key)}
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
            )}
          </div>
        )}

        {/* ── CRONS ───────────────────────────────────────────────────────── */}
        {activeTab === "crons" && (
          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-20">
                <div className="w-5 h-5 rounded-full border-2 border-t-orange-500 animate-spin" style={{ borderColor: "#1a1a2e", borderTopColor: "#e85d27" }} />
                <span className="text-xs" style={{ color: "#3f3f52" }}>Loading schedules…</span>
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* ── SKILLS ──────────────────────────────────────────────────────── */}
        {activeTab === "skills" && (
          <div className="p-5 flex flex-col gap-6">

            {/* Soul card */}
            <div className="relative rounded-2xl px-5 py-5 overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(232,93,39,0.06) 0%, rgba(232,93,39,0.02) 100%)", border: "1px solid rgba(232,93,39,0.15)" }}>
              <div className="absolute top-3 left-4 text-4xl font-serif leading-none select-none" style={{ color: "rgba(232,93,39,0.15)" }}>"</div>
              <div className="absolute bottom-1 right-4 text-4xl font-serif leading-none select-none" style={{ color: "rgba(232,93,39,0.15)" }}>"</div>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#e85d2780" }}>Soul</p>
              <p className="text-sm italic leading-relaxed relative z-10 px-4" style={{ color: "#a08070" }}>{agent.soul}</p>
            </div>

            {/* Role */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#2e2e42" }}>Role</p>
              <p className="text-sm font-medium" style={{ color: "#8888a0" }}>{agent.role}</p>
            </div>

            {/* Skills & Tools */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2e2e42" }}>Skills & Tools</p>
              <div className="flex flex-wrap gap-2">
                {agent.skills.map((skill, i) => {
                  const color = accentColor(skill);
                  const icon  = skillEmoji(skill);
                  return (
                    <div key={i} className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{
                        background: color + "0e",
                        border: `1px solid ${color}28`,
                      }}>
                      <span className="text-base leading-none">{icon}</span>
                      <span className="text-sm font-medium" style={{ color: color + "cc" }}>{skill}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Memory Files */}
            {agent.files.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2e2e42" }}>Memory Files</p>
                <div className="flex flex-wrap gap-2">
                  {agent.files.map(f => (
                    <span key={f} className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg"
                      style={{ background: "#0d0d18", border: "1px solid #1c1c2e", color: "#3a3a52" }}>
                      <span style={{ color: "#2e2e42" }}>📄</span>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
