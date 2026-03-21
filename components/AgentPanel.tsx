"use client";
import { Agent, skillDescriptions } from "@/lib/agents";
import MarkdownViewer from "./MarkdownViewer";

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

// Placeholder markdown content for each file type
const FILE_CONTENT: Record<string, string> = {
  "IDENTITY.md": `# Identity

This document defines who I am, my role, and how I operate within the OpenClaw agent network.

## Role
I am a specialized AI agent built on the OpenClaw platform, designed to fulfill a specific operational role.

## Purpose
My purpose is to provide consistent, reliable assistance within my designated domain.

## Principles
- Act with clarity and precision
- Maintain operational boundaries
- Collaborate with other agents when needed
- Report status and outcomes accurately`,
  "SOUL.md": `# Soul

The core essence and personality of this agent.

## Personality
I bring a focused, professional approach to every task. My decisions are guided by clear logic, domain expertise, and the user's best interests.

## Values
- **Precision**: I value accuracy over speed
- **Transparency**: I explain my reasoning clearly
- **Reliability**: I follow through on commitments
- **Growth**: I learn from every interaction`,
  "TOOLS.md": `# Tools

This document lists the tools and capabilities available to this agent.

## Available Tools
Each tool is carefully selected to match this agent's operational requirements.

## Usage Guidelines
- Tools are used purposefully and efficiently
- Each tool call is logged and auditable
- Failures are handled gracefully with fallbacks`,
  "HEARTBEAT.md": `# Heartbeat

Operational status and health monitoring for this agent.

## Status: Active ✅

## Metrics
- **Uptime**: Continuous
- **Response Time**: < 2s average
- **Error Rate**: < 0.1%
- **Last Check**: Automated`,
  "AGENTS.md": `# Agent Network

This document describes how I interact with other agents in the network.

## Coordination
I operate as part of a larger multi-agent system, able to delegate and collaborate.

## Communication Protocol
- Clear task handoffs
- Status updates on completion
- Error escalation when needed`,
  "USER.md": `# User Profile

Information about the primary user and their preferences.

## User: Bryan
- **Role**: Founder / Principal
- **Timezone**: Asia/Bangkok
- **Communication Style**: Direct and concise
- **Priorities**: Efficiency, quality, speed`,
  "MEMORY.md": `# Memory

Persistent memory and learned context for this agent.

## Stored Context
This file is updated automatically as I learn from interactions.

## Memory Categories
- User preferences
- Recurring patterns
- Decision history
- Important context`,
  "CHANGELOG.md": `# Changelog

## v2.1.0 — Latest
- Enhanced multi-step reasoning
- Improved error handling
- Better context retention

## v2.0.0
- Major update to capabilities
- New tool integrations

## v1.0.0
- Initial deployment`,
  "ARCHITECTURE.md": `# Architecture

Technical architecture and system design documentation.

## Overview
This agent operates within a microservices-style architecture where each agent has a defined interface.

## Components
- **Runtime**: OpenClaw Agent SDK
- **Tools**: Modular plugin system
- **Memory**: Persistent file-based storage
- **Communication**: Event-driven messaging`,
};

interface Props {
  agent: Agent;
  openFiles: Set<string>;
  onToggleFile: (f: string) => void;
}

export default function AgentPanel({ agent, openFiles, onToggleFile }: Props) {
  return (
    <div style={{
      width: 320,
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(10,10,10,0.7)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      flexShrink: 0,
    }}>
      {/* Agent header card */}
      <div style={{
        padding: "20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(17,17,17,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(232,93,39,0.3), rgba(196,74,26,0.2))",
            border: "2px solid rgba(232,93,39,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            boxShadow: "0 0 20px rgba(232,93,39,0.2)",
          }}>
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0" }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: "#e85d27", marginTop: 2 }}>{agent.role}</div>
          </div>
        </div>

        <div style={{
          fontSize: 13,
          color: "#999",
          lineHeight: 1.6,
          padding: "12px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.05)",
        }}>
          {agent.soul}
        </div>
      </div>

      {/* Skills */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
          Skills ({agent.skills.length})
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

      {/* Files */}
      <div style={{ padding: "16px 20px", flex: 1 }}>
        <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
          Agent Kit ({agent.files.length} files)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {agent.files.map((file) => {
            const isOpen = openFiles.has(file);
            const content = FILE_CONTENT[file] ?? `# ${file}\n\nContent for ${file} — specific to ${agent.name}.`;
            return (
              <div key={file}>
                <button
                  onClick={() => onToggleFile(file)}
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
                  <div style={{
                    borderRadius: "0 0 8px 8px",
                    border: "1px solid rgba(232,93,39,0.15)",
                    borderTop: "none",
                    overflow: "hidden",
                  }}>
                    <MarkdownViewer content={content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
