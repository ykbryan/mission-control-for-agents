"use client";

import { Agent } from "@/lib/agents";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { SessionGroup } from "@/app/api/agent-sessions/route";
import type { ScheduledJob } from "@/app/api/cron-schedule/route";
import type { NodeInfo } from "@/app/api/node-info/route";
import { AgentHero } from "./agent-profile/AgentHero";
import { ActivityTab } from "./agent-profile/ActivityTab";
import { CronsTab } from "./agent-profile/CronsTab";
import { SkillsTab } from "./agent-profile/SkillsTab";
import { parseHeartbeatLines, cleanMsg, type SessionDetail } from "./agent-profile/types";

interface Props {
  agent: Agent;
  onBack: () => void;
}

type ActiveTab = "activity" | "crons" | "skills";

export default function AgentProfileStage({ agent, onBack }: Props) {
  const [groups,   setGroups]   = useState<SessionGroup[]>([]);
  const [cronJobs, setCronJobs] = useState<ScheduledJob[]>([]);
  const [heartbeat,setHeartbeat]= useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [activeTab,setActiveTab]= useState<ActiveTab>("activity");
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

  function toggleSession(sessionKey: string) {
    if (expandedKey === sessionKey) { setExpandedKey(null); return; }
    setExpandedKey(sessionKey);
    if (sessionDetails[sessionKey]) return;

    const routerId = agent.routerId ?? "legacy";
    setSessionDetails(prev => ({ ...prev, [sessionKey]: { loading: true } }));

    fetch(`/api/agent-session?agent=${encodeURIComponent(agent.id)}&routerId=${encodeURIComponent(routerId)}&sessionKey=${encodeURIComponent(sessionKey)}`)
      .then(r => r.json())
      .then((events: Array<{ type: string; message: string; fullMessage?: string; timestamp?: string }>) => {
        const arr = Array.isArray(events) ? events : [];

        const firstChat = arr.find(e => e.type === "chat" || e.message?.startsWith("💬"));
        const prompt = firstChat ? cleanMsg(firstChat.fullMessage ?? firstChat.message) : undefined;

        const outputs = arr.filter(e =>
          e.message?.startsWith("🤖") &&
          !e.message.includes("NO_REPLY") &&
          !e.message.match(/^🤖\s*<final>\s*<\/final>/)
        );
        const lastOut = outputs[outputs.length - 1];
        const lastDelivery = lastOut ? cleanMsg(lastOut.fullMessage ?? lastOut.message) : undefined;
        const deliveryTime = lastOut?.timestamp ?? undefined;

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

  const hbLines = heartbeat ? parseHeartbeatLines(heartbeat) : [];

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

      <AgentHero
        agent={agent}
        onBack={onBack}
        groups={groups}
        cronJobs={cronJobs}
        nodeInfo={nodeInfo}
      />

      {/* Tab bar */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#1a1a2e transparent" }}>
        <div className="p-5">
          {activeTab === "activity" && (
            <ActivityTab
              loading={loading}
              groups={groups}
              allSessions={allSessions}
              expandedKey={expandedKey}
              sessionDetails={sessionDetails}
              onToggleSession={toggleSession}
            />
          )}
          {activeTab === "crons" && (
            <CronsTab
              loading={loading}
              hbLines={hbLines}
              cronJobs={cronJobs}
            />
          )}
          {activeTab === "skills" && (
            <SkillsTab agent={agent} />
          )}
        </div>
      </div>

    </div>
  );
}
