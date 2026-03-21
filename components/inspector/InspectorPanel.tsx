import { Agent, skillDescriptions } from "@/lib/agents";
import MarkdownViewer from "@/components/MarkdownViewer";
import AgentLogStream from "./AgentLogStream";
import { useEffect, useState } from "react";

interface Props {
  agent: Agent;
  activeFile: string | null;
  onSelectFile: (file: string | null) => void;
}

const FILE_ICONS: Record<string, string> = {
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

function FilePreview({ agentId, file }: { agentId: string; file: string }) {
  const [content, setContent] = useState<string>("Loading preview…");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/agent-file?agent=${agentId}&file=${file}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setContent(data.content ?? `# ${file}\n\n_No preview available._`);
      })
      .catch(() => {
        if (!cancelled) setContent(`# ${file}\n\n_Failed to load content._`);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, file]);

  return <MarkdownViewer content={content} />;
}

export default function InspectorPanel({ agent, activeFile, onSelectFile }: Props) {
  const [activeTab, setActiveTab] = useState<"context" | "logs">("context");

  return (
    <aside className="mc-inspector w-[332px] flex flex-col h-full flex-shrink-0" style={{ display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
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

      <div className="flex-1 overflow-y-auto custom-scrollbar transition-all duration-200 ease-in-out relative">
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

            <section className="mc-inspector__section mc-inspector__section--files">
              <div className="mc-section-label">Markdown files</div>
              <div className="mc-file-list">
                {agent.files.map((file) => {
                  const active = file === activeFile;
                  return (
                    <button
                      key={file}
                      className={`mc-file-row ${active ? "is-active" : ""}`}
                      onClick={() => onSelectFile(active ? null : file)}
                    >
                      <span className="mc-file-row__meta">
                        <span>{FILE_ICONS[file] || "📄"}</span>
                        <span>{file}</span>
                      </span>
                      <span className="mc-file-row__action">{active ? "Close" : "Open"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {activeFile ? (
              <section className="mc-inspector__preview">
                <div className="mc-section-label">Focused preview</div>
                <div className="mc-preview-shell">
                  <div className="mc-preview-shell__header">
                    <strong>{activeFile}</strong>
                    <button className="mc-preview-shell__close" onClick={() => onSelectFile(null)}>
                      ×
                    </button>
                  </div>
                  <div className="mc-preview-shell__content">
                    <FilePreview agentId={agent.id} file={activeFile} />
                  </div>
                </div>
              </section>
            ) : (
              <section className="mc-inspector__section mc-inspector__section--overview">
                <div className="mc-section-label">Overview</div>
                <div className="mc-overview-card">
                  <strong>Quiet by default</strong>
                  <p>Select a file to bring detail forward. The stage remains primary until you ask for depth.</p>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="h-full">
             <AgentLogStream agentId={agent.id} />
          </div>
        )}
      </div>
    </aside>
  );
}
