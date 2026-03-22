import { Agent, skillDescriptions } from "@/lib/agents";
import MarkdownViewer from "@/components/MarkdownViewer";
import AgentLogStream from "./AgentLogStream";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { SessionGroup, SessionDetail } from "@/app/api/agent-sessions/route";

interface Props {
  agent: Agent;
  activeFile: string | null;
  onSelectFile: (file: string | null) => void;
}

const OPENCLAW_FILES: Record<string, string> = {
  "IDENTITY.md": "🪪",
  "SOUL.md": "✨",
  "TOOLS.md": "🔧",
  "HEARTBEAT.md": "💓",
  "AGENTS.md": "🤝",
  "USER.md": "👤",
  "MEMORY.md": "🧠",
  "CHANGELOG.md": "📋",
  "ARCHITECTURE.md": "🏗️",
};

function FilePreview({ agentId, file, routerId }: { agentId: string; file: string; routerId?: string }) {
  const [content, setContent] = useState<string>("Loading preview…");

  useEffect(() => {
    let cancelled = false;

    const routerParam = routerId ? `&routerId=${encodeURIComponent(routerId)}` : "";
    fetch(`/api/agent-file?agent=${agentId}&file=${file}${routerParam}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) {
            setContent(`# ${file}\n\n_Error: ${data.error}_`);
          } else {
            setContent(data.content ?? `# ${file}\n\n_No preview available._`);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setContent(`# ${file}\n\n_Failed to load content._`);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, file, routerId]);

  return <MarkdownViewer content={content} />;
}

function useSessionGroups(agentId: string, routerId?: string) {
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const routerParam = routerId ? `&routerId=${encodeURIComponent(routerId)}` : "";
    fetch(`/api/agent-sessions?agent=${encodeURIComponent(agentId)}${routerParam}`)
      .then(r => r.json())
      .then(d => { setGroups(d.groups ?? []); setTotal(d.total ?? 0); })
      .catch(() => {});
  }, [agentId, routerId]);

  return { groups, total };
}

function timeAgo(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 2) return "just now";
  if (h < 1) return `${m}m ago`;
  if (d < 1) return `${h}h ago`;
  return `${d}d ago`;
}

export default function InspectorPanel({ agent, activeFile, onSelectFile }: Props) {
  const [activeTab, setActiveTab] = useState<"context" | "logs">("context");
  const { groups: sessionGroups, total: sessionTotal } = useSessionGroups(agent.id, agent.routerId);
  const [expandedGroup, setExpandedGroup] = useState<SessionGroup | null>(null);
  const [drillSession, setDrillSession] = useState<SessionDetail | null>(null);
  const [drillLogs, setDrillLogs] = useState<{ id: string; type: string; message: string; fullMessage?: string; timestamp: string; model?: string }[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillFilter, setDrillFilter] = useState<"all" | "chat" | "info" | "memory" | "error">("all");

  function openSession(s: SessionDetail) {
    setDrillSession(s);
    setDrillLogs([]);
    setDrillLoading(true);
    setDrillFilter("all");
    const routerParam = agent.routerId ? `&routerId=${encodeURIComponent(agent.routerId)}` : "";
    fetch(`/api/agent-session?agent=${encodeURIComponent(agent.id)}&sessionKey=${encodeURIComponent(s.key)}${routerParam}`)
      .then(r => r.json())
      .then(data => {
        const normalised = (Array.isArray(data) ? data : []).map((e: { type: string; message: string; fullMessage?: string; id: string; timestamp: string; model?: string }) =>
          e.type === "info" && e.message.startsWith("💬") ? { ...e, type: "chat" } : e
        );
        setDrillLogs(normalised);
      })
      .catch(() => setDrillLogs([]))
      .finally(() => setDrillLoading(false));
  }

  return (
    <>
    <aside className="mc-inspector w-[332px] flex flex-col h-full flex-shrink-0 relative overflow-hidden" style={{ display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
      {/* Tabs Header */}
      <div className="flex border-b border-[#333] sticky top-0 z-20 bg-[#0a0a0a]">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ease-in-out ${activeTab === 'context' ? 'text-[#e85d27] border-b-2 border-[#e85d27]' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('context')}
        >
          Context
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ease-in-out ${activeTab === 'logs' ? 'text-[#e85d27] border-b-2 border-[#e85d27]' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('logs')}
        >
          Activity & Logs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        {activeTab === 'context' && (
          <div className="flex flex-col h-full p-4 space-y-6">
            <div className="mc-inspector__hero">
              <div className="mc-inspector__avatar">{agent.emoji}</div>
              <div>
                <div className="mc-kicker">Contextual inspector</div>
                <h2>{agent.name}</h2>
                <p>{agent.role}</p>
              </div>
            </div>

            {agent.routerLabel && (
              <section className="mc-inspector__section">
                <div className="mc-section-label">Gateway</div>
                <p className="text-xs text-zinc-400">{agent.routerLabel}</p>
              </section>
            )}

            {sessionGroups.length > 0 && (
              <section className="mc-inspector__section">
                <div className="mc-section-label">Sessions · {sessionTotal}</div>
                <div className="flex flex-col gap-1 mt-1">
                  {sessionGroups.map(g => (
                    <button
                      key={g.type}
                      onClick={() => setExpandedGroup(g)}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md bg-[#141414] border border-[#222] hover:border-[#333] hover:bg-[#1a1a1a] transition-colors w-full text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{g.icon}</span>
                        <div>
                          <div className="text-xs text-zinc-300 font-medium">{g.label}</div>
                          {g.lastUpdated > 0 && (
                            <div className="text-[10px] text-zinc-600">{timeAgo(g.lastUpdated)}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-zinc-500 bg-[#1e1e1e] px-1.5 py-0.5 rounded">{g.count}</span>
                        <span className="text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">↗</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

{/* portals rendered outside inspector overflow */}

            <section className="mc-inspector__section">
              <div className="mc-section-label">Summary</div>
              <p className="mc-inspector__summary">{agent.soul}</p>
            </section>

            <section className="mc-inspector__section">
              <div className="mc-section-label">Capabilities</div>
              <div className="mc-chip-grid">
                {agent.skills.map((skill) => (
                  <div key={skill} className="mc-skill-chip" title={skillDescriptions[skill] || skill}>
                    <span className="mc-skill-chip__dot" />
                    {skill}
                  </div>
                ))}
              </div>
            </section>

            {(() => {
              const ocFiles = agent.files.filter((f) => f in OPENCLAW_FILES);
              const customFiles = agent.files.filter((f) => !(f in OPENCLAW_FILES));
              const renderFileRow = (file: string) => {
                const active = file === activeFile;
                return (
                  <button
                    key={file}
                    className={`mc-file-row ${active ? "is-active" : ""}`}
                    onClick={() => onSelectFile(active ? null : file)}
                  >
                    <span className="mc-file-row__meta">
                      <span>{OPENCLAW_FILES[file] || "📄"}</span>
                      <span>{file}</span>
                    </span>
                    <span className="mc-file-row__action">{active ? "Close" : "Open"}</span>
                  </button>
                );
              };
              return (
                <>
                  {ocFiles.length > 0 && (
                    <section className="mc-inspector__section mc-inspector__section--files">
                      <div className="mc-section-label">OpenClaw files</div>
                      <div className="mc-file-list">{ocFiles.map(renderFileRow)}</div>
                    </section>
                  )}
                  {customFiles.length > 0 && (
                    <section className="mc-inspector__section mc-inspector__section--files">
                      <div className="mc-section-label">Custom</div>
                      <div className="mc-file-list">{customFiles.map(renderFileRow)}</div>
                    </section>
                  )}
                </>
              );
            })()}

            <section className="mc-inspector__section mc-inspector__section--overview">
              <div className="mc-section-label">Overview</div>
              <div className="mc-overview-card">
                <strong>Quiet by default</strong>
                <p>Select a file to bring detail forward. The stage remains primary until you ask for depth.</p>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="h-full">
             <AgentLogStream agentId={agent.id} routerId={agent.routerId} />
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeFile && activeTab === 'context' && (
          <motion.div
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-x-0 bottom-0 top-[49px] z-30 bg-[#0a0a0a] flex flex-col border-t border-[#333] shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#0a0a0a] sticky top-0 z-40">
              <strong className="text-sm font-medium text-white">{activeFile}</strong>
              <button
                className="text-gray-400 hover:text-white transition-colors flex items-center justify-center w-6 h-6 rounded-md hover:bg-[#333]"
                onClick={() => onSelectFile(null)}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <FilePreview agentId={agent.id} file={activeFile} routerId={agent.routerId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>

    {/* ── Session group popup (portal) ── */}
    {expandedGroup && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
        onClick={() => setExpandedGroup(null)}
      >
        <div
          className="w-full max-w-md flex flex-col overflow-hidden"
          style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: "10px", maxHeight: "72vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#1a1a1a" }}>
            <div className="flex items-center gap-2">
              <span>{expandedGroup.icon}</span>
              <span className="text-sm font-semibold text-zinc-100">{expandedGroup.label}</span>
              <span className="text-[10px] text-zinc-600 font-mono bg-[#1a1a1a] px-1.5 py-0.5 rounded">{expandedGroup.count} sessions</span>
            </div>
            <button onClick={() => setExpandedGroup(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors text-xl leading-none px-1">×</button>
          </div>
          {/* Summary */}
          <div className="flex gap-6 px-4 py-2.5 border-b" style={{ borderColor: "#141414", background: "#0a0a0a" }}>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-700 mb-0.5">Last Active</div>
              <div className="text-xs text-zinc-400">{timeAgo(expandedGroup.lastUpdated)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-700 mb-0.5">Total Tokens</div>
              <div className="text-xs text-zinc-400 font-mono">{expandedGroup.totalTokens.toLocaleString()}</div>
            </div>
          </div>
          {/* Sessions list — click to drill in */}
          <div className="overflow-y-auto custom-scrollbar">
            {(expandedGroup.sessions ?? []).map((s: SessionDetail, i: number) => (
              <button
                key={s.key}
                onClick={() => { openSession(s); setExpandedGroup(null); }}
                className="w-full text-left px-4 py-3 border-b hover:bg-white/[0.03] transition-colors group"
                style={{ borderColor: "#111" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-zinc-700 font-mono flex-shrink-0">#{i + 1}</span>
                    <span className="text-xs text-zinc-200 truncate">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.totalTokens > 0 && <span className="text-[10px] font-mono text-zinc-600">{s.totalTokens.toLocaleString()} tok</span>}
                    <span className="text-[10px] text-zinc-700 group-hover:text-[#e85d27] transition-colors">View logs ↗</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[9px] text-zinc-700">{timeAgo(s.updatedAt)}</span>
                  <span className="text-[9px] text-zinc-800 font-mono truncate">{s.key}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* ── Session log drill-down (portal) ── */}
    {drillSession && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
        onClick={() => setDrillSession(null)}
      >
        <div
          className="w-full max-w-lg flex flex-col overflow-hidden"
          style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: "10px", maxHeight: "78vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#1a1a1a" }}>
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => { setDrillSession(null); setExpandedGroup(expandedGroup); }} className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors mr-1">←</button>
              <span className="text-sm font-semibold text-zinc-100 truncate">{drillSession.label}</span>
              {drillSession.totalTokens > 0 && (
                <span className="text-[10px] text-zinc-600 font-mono bg-[#1a1a1a] px-1.5 py-0.5 rounded flex-shrink-0">{drillSession.totalTokens.toLocaleString()} tok</span>
              )}
            </div>
            <button onClick={() => setDrillSession(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors text-xl leading-none px-1 flex-shrink-0">×</button>
          </div>
          {/* Filter bar */}
          {!drillLoading && drillLogs.length > 0 && (() => {
            const counts = {
              chat:   drillLogs.filter(l => l.type === "chat").length,
              info:   drillLogs.filter(l => l.type === "info").length,
              memory: drillLogs.filter(l => l.type === "memory").length,
              error:  drillLogs.filter(l => l.type === "error").length,
            };
            const tabs = [
              { key: "all",    label: "All",    dot: null,            count: drillLogs.length },
              { key: "chat",   label: "Chats",  dot: "bg-sky-500",    count: counts.chat },
              { key: "info",   label: "Info",   dot: "bg-emerald-500",count: counts.info },
              { key: "memory", label: "Memory", dot: "bg-violet-500", count: counts.memory },
              { key: "error",  label: "Error",  dot: "bg-red-500",    count: counts.error },
            ].filter(t => t.key === "all" || t.count > 0);
            return (
              <div className="flex items-center gap-1 px-3 py-2 border-b flex-wrap" style={{ background: "#0a0a0a", borderColor: "#161616" }}>
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setDrillFilter(t.key as typeof drillFilter)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      drillFilter === t.key
                        ? "bg-[#1e1e1e] text-white border border-[#2e2e2e]"
                        : "text-zinc-600 hover:text-zinc-300 hover:bg-[#111]"
                    }`}
                  >
                    {t.dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${drillFilter === t.key ? t.dot : "bg-zinc-700"}`} />}
                    {t.label}
                    <span className={`px-1.5 py-px rounded text-[10px] font-mono ${drillFilter === t.key ? "bg-[#2a2a2a] text-zinc-400" : "text-zinc-700"}`}>
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}
          {/* Log entries */}
          <div className="overflow-y-auto custom-scrollbar flex-1" style={{ minHeight: 0 }}>
            {drillLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "#222", borderTopColor: "#e85d27" }} />
                <span className="text-xs text-zinc-600">Loading logs…</span>
              </div>
            ) : drillLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <div className="text-xl opacity-10">◌</div>
                <p className="text-xs text-zinc-600">No activity found for this session</p>
              </div>
            ) : (() => {
              const visible = drillFilter === "all" ? drillLogs : drillLogs.filter(l => l.type === drillFilter);
              const typeColors: Record<string, string> = { chat: "text-sky-300/90", info: "text-emerald-300/90", memory: "text-violet-300/90", error: "text-red-300/90" };
              const borderColors: Record<string, string> = { chat: "border-l-sky-500/40", info: "border-l-emerald-500/30", memory: "border-l-violet-500/40", error: "border-l-red-500/50" };
              return visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <div className="text-xl opacity-10">◌</div>
                  <p className="text-xs text-zinc-600">No entries match this filter</p>
                </div>
              ) : visible.map((log, i) => (
                <div key={log.id} className={`border-l-2 px-3 pt-2 pb-2.5 ${borderColors[log.type] ?? "border-l-zinc-800"}`}
                  style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)", borderBottom: "1px solid #0f0f0f" }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] tabular-nums text-zinc-700">{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    {log.model && <span className="text-[9px] font-mono text-zinc-700 bg-[#111] border border-[#1e1e1e] px-1.5 py-px rounded">{log.model.split("/").pop()}</span>}
                  </div>
                  <p className={`text-[11px] ${typeColors[log.type] ?? "text-zinc-400"} leading-relaxed break-words whitespace-pre-wrap`}>
                    {log.fullMessage ?? log.message}
                  </p>
                </div>
              ));
            })()}
          </div>
          <div className="px-4 py-1.5 border-t flex items-center justify-between" style={{ borderColor: "#141414", background: "#080808" }}>
            <span className="text-[9px] text-zinc-800 font-mono truncate">{drillSession.key}</span>
            {drillLogs.length > 0 && <span className="text-[10px] text-zinc-700 tabular-nums">{drillLogs.length} events</span>}
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
