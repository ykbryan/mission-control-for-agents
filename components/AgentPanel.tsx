"use client";
import { Agent, skillDescriptions } from "@/lib/agents";
import MarkdownViewer from "./MarkdownViewer";
import { useState, useEffect } from "react";

const SKILL_ICONS: Record<string, string> = {
  web_search: "🔍",
  notion: "📝",
  pdf: "📄",
  web_fetch: "🌐",
  image: "🖼️",
  gog: "📧",
  calendar: "📅",
  "apple-reminders": "🍎",
  nodes: "⚙️",
  cron: "⏰",
  firehose: "🔥",
  "claude-code": "🤖",
  exec: "💻",
  git: "🌿",
  github: "🐙",
  xcode: "🔨",
  browser: "🌍",
  "vercel-deploy": "▲",
  healthcheck: "💊",
  message: "💬",
};

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

function FileRow({
  agentId,
  file,
  isOpen,
  onToggle,
}: {
  agentId: string;
  file: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && content === null) {
      setLoading(true);
      fetch(`/api/agent-file?agent=${agentId}&file=${file}`)
        .then((r) => r.json())
        .then((d) => {
          setContent(d.content);
          setLoading(false);
        })
        .catch(() => {
          setContent(`# ${file}\n\n_Failed to load content._`);
          setLoading(false);
        });
    }
  }, [isOpen, agentId, file, content]);

  useEffect(() => {
    setContent(null);
  }, [agentId]);

  return (
    <div key={file}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          background: isOpen ? "rgba(232,93,39,0.1)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${isOpen ? "rgba(232,93,39,0.2)" : "rgba(255,255,255,0.05)"}`,
          borderRadius: isOpen ? "14px 14px 0 0" : 14,
          color: isOpen ? "#f0f0f0" : "#d0d4da",
          cursor: "pointer",
          fontSize: 13,
          textAlign: "left",
          transition: "all 0.15s",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{FILE_ICONS[file] || "📄"}</span>
          <span style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12 }}>{file}</span>
        </span>
        <span style={{ fontSize: 10, color: isOpen ? "#ff8a57" : "#6d7380", transition: "color 0.15s" }}>
          {isOpen ? "▲ hide" : "▼ view"}
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            borderRadius: "0 0 14px 14px",
            border: "1px solid rgba(232,93,39,0.14)",
            borderTop: "none",
            overflow: "hidden",
            maxHeight: 400,
            overflowY: "auto",
            background: "rgba(8,9,12,0.45)",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px 20px", color: "#7a808c", fontSize: 13 }}>
              Loading {file}…
            </div>
          ) : content !== null ? (
            <MarkdownViewer content={content} />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface Props {
  agent: Agent;
  openFiles: Set<string>;
  onToggleFile: (f: string) => void;
}

export default function AgentPanel({ agent, openFiles, onToggleFile }: Props) {
  return (
    <aside
      style={{
        width: 340,
        background: "linear-gradient(180deg, rgba(15,16,20,0.92), rgba(12,13,17,0.78))",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 28,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
        minHeight: 0,
        boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
      }}
    >
      <div
        style={{
          padding: "18px 18px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#6b7280",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Agent Kit
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "rgba(232,93,39,0.15)",
              border: "1px solid rgba(232,93,39,0.24)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              boxShadow: "0 12px 24px rgba(232,93,39,0.14)",
            }}
          >
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontWeight: 720, fontSize: 15, color: "#f0f0f0" }}>{agent.name}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: "#7f8794" }}>{agent.role}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ fontSize: 12, color: "#9aa1ab", lineHeight: 1.7 }}>{agent.soul}</div>
      </div>

      <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div
          style={{
            fontSize: 10,
            color: "#6b7280",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Skills Included
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {agent.skills.map((skill) => (
            <div
              key={skill}
              title={skillDescriptions[skill]}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(232,93,39,0.08)",
                border: "1px solid rgba(232,93,39,0.16)",
                borderRadius: 999,
                padding: "6px 11px",
                fontSize: 11,
                color: "#ff8a57",
                cursor: "default",
              }}
            >
              <span style={{ fontSize: 12 }}>{SKILL_ICONS[skill] || "🔧"}</span>
              <span>{skill}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 18px", flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            color: "#6b7280",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Markdown Files ({agent.files.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {agent.files.map((file) => (
            <FileRow
              key={`${agent.id}-${file}`}
              agentId={agent.id}
              file={file}
              isOpen={openFiles.has(file)}
              onToggle={() => onToggleFile(file)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
