import { Agent, skillDescriptions } from "@/lib/agents";
import MarkdownViewer from "@/components/MarkdownViewer";
import AgentLogStream from "./AgentLogStream";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

export default function InspectorPanel({ agent, activeFile, onSelectFile }: Props) {
  const [activeTab, setActiveTab] = useState<"context" | "logs">("context");

  return (
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
  );
}
