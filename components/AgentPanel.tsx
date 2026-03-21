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

interface FileContentCache {
  [key: string]: string;
}

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

  // Reset content when agent changes
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
          padding: "9px 12px",
          background: isOpen ? "rgba(232,93,39,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${isOpen ? "rgba(232,93,39,0.25)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: isOpen ? "8px 8px 0 0" : 8,
          color: isOpen ? "#f0f0f0" : "#ccc",
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
        <span style={{ fontSize: 10, color: isOpen ? "#e85d27" : "#555", transition: "color 0.15s" }}>
          {isOpen ? "▲ hide" : "▼ view"}
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            borderRadius: "0 0 8px 8px",
            border: "1px solid rgba(232,93,39,0.15)",
            borderTop: "none",
            overflow: "hidden",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px 20px", color: "#666", fontSize: 13 }}>
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
    <div
      style={{
        width: 320,
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,10,0.7)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
        // Ensure this panel is scrollable independently
        height: "100%",
      }}
    >
      {/* AGENT KIT header — RUBRIC style */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(17,17,17,0.6)",
        }}
      >
        <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
          Agent Kit
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(232,93,39,0.15)",
              border: "1px solid rgba(232,93,39,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {agent.emoji}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f0f0f0" }}>{agent.name}</div>
        </div>
      </div>

      {/* Agent soul / description */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>{agent.soul}</div>
      </div>

      {/* Skills */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div
          style={{
            fontSize: 10,
            color: "#555",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Skills Included
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {agent.skills.map((skill) => (
            <div
              key={skill}
              title={skillDescriptions[skill]}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(232,93,39,0.08)",
                border: "1px solid rgba(232,93,39,0.2)",
                borderRadius: 20,
                padding: "4px 10px",
                fontSize: 11,
                color: "#e85d27",
                cursor: "default",
              }}
            >
              <span style={{ fontSize: 12 }}>{SKILL_ICONS[skill] || "🔧"}</span>
              <span>{skill}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Files — reads from real filesystem via API */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            color: "#555",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Markdown Files ({agent.files.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
    </div>
  );
}
