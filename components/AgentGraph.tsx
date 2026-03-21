"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Agent, skillDescriptions } from "@/lib/agents";

interface Props {
  agent: Agent;
  viewMode: "graph" | "workflow";
  onViewModeChange: (m: "graph" | "workflow") => void;
}

interface SkillNode {
  skill: string;
  x: number;
  y: number;
  angle: number;
}

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

export default function AgentGraph({ agent, viewMode, onViewModeChange }: Props) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag on the SVG background (not on skill nodes)
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect") {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
      e.preventDefault();
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Reset pan when agent changes
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [agent.id]);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    const el = document.getElementById("graph-container");
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cx = size.w / 2 + pan.x;
  const cy = size.h / 2 + pan.y;
  const radius = Math.min(size.w, size.h) * 0.28;

  const skillNodes: SkillNode[] = agent.skills.map((skill, i) => {
    const angle = (i / agent.skills.length) * 2 * Math.PI - Math.PI / 2;
    return {
      skill,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
    };
  });

  if (viewMode === "workflow") {
    return (
      <div id="graph-container" style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <button
          onClick={() => onViewModeChange("graph")}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "rgba(232,93,39,0.15)",
            border: "1px solid rgba(232,93,39,0.4)",
            color: "#e85d27",
            padding: "7px 16px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >← Graph View</button>

        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "0 60px", maxWidth: "100%" }}>
          {/* Input node */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "12px 20px",
              textAlign: "center",
              minWidth: 100,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>INPUT</div>
            <div style={{ fontSize: 13, color: "#888" }}>User Request</div>
          </motion.div>

          {agent.skills.map((skill, i) => (
            <div key={skill} style={{ display: "flex", alignItems: "center" }}>
              {/* Arrow */}
              <svg width="50" height="20" style={{ flexShrink: 0 }}>
                <defs>
                  <marker id={`arrow-${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill="rgba(232,93,39,0.5)" />
                  </marker>
                </defs>
                <line
                  x1="0" y1="10" x2="44" y2="10"
                  stroke="rgba(232,93,39,0.3)"
                  strokeWidth="1.5"
                  strokeDasharray="4,3"
                  markerEnd={`url(#arrow-${i})`}
                />
              </svg>
              {/* Step card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                style={{
                  background: "rgba(17,17,17,0.9)",
                  border: "1px solid rgba(232,93,39,0.2)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  textAlign: "center",
                  minWidth: 120,
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>STEP {i + 1}</div>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{SKILL_ICONS[skill] || "🔧"}</div>
                <div style={{ fontSize: 12, color: "#e85d27", fontWeight: 600 }}>{skill}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4, maxWidth: 110 }}>
                  {skillDescriptions[skill]?.slice(0, 40) ?? skill}
                </div>
              </motion.div>
            </div>
          ))}

          {/* Arrow to output */}
          <svg width="50" height="20" style={{ flexShrink: 0 }}>
            <defs>
              <marker id="arrow-out" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="rgba(232,93,39,0.5)" />
              </marker>
            </defs>
            <line
              x1="0" y1="10" x2="44" y2="10"
              stroke="rgba(232,93,39,0.3)"
              strokeWidth="1.5"
              strokeDasharray="4,3"
              markerEnd="url(#arrow-out)"
            />
          </svg>

          {/* Output node */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: agent.skills.length * 0.08 }}
            style={{
              background: "rgba(232,93,39,0.1)",
              border: "1px solid rgba(232,93,39,0.3)",
              borderRadius: 12,
              padding: "12px 20px",
              textAlign: "center",
              minWidth: 100,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 11, color: "#e85d27", marginBottom: 4 }}>OUTPUT</div>
            <div style={{ fontSize: 13, color: "#f0f0f0" }}>{agent.name}</div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="graph-container"
      style={{ width: "100%", height: "100%", position: "relative", cursor: isDragging.current ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Visualize Workflow button */}
      <button
        onClick={() => onViewModeChange("workflow")}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 5,
          background: "linear-gradient(135deg, #e85d27, #c44a1a)",
          border: "none",
          color: "#fff",
          padding: "8px 18px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 0 20px rgba(232,93,39,0.3)",
        }}
      >
        Visualize Workflow →
      </button>

      {/* Pan hint */}
      <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "#444", pointerEvents: "none", zIndex: 5 }}>
        drag to pan
      </div>

      <svg width={size.w} height={size.h} style={{ position: "absolute", top: 0, left: 0, userSelect: "none" }}>
        {/* Invisible drag target for background */}
        <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />
        {/* Defs for glow */}
        <defs>
          <filter id="glow-orange">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-node">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="center-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e85d27" stopOpacity="1" />
            <stop offset="100%" stopColor="#c44a1a" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Connecting lines */}
        {skillNodes.map((node) => (
          <motion.line
            key={`line-${node.skill}`}
            x1={cx}
            y1={cy}
            x2={node.x}
            y2={node.y}
            stroke={hoveredSkill === node.skill ? "rgba(232,93,39,0.5)" : "rgba(255,255,255,0.12)"}
            strokeWidth={hoveredSkill === node.skill ? 1.5 : 1}
            strokeDasharray="6,4"
            style={{ transition: "stroke 0.2s" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
        ))}

        {/* Outer pulse ring 1 */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={56}
          fill="none"
          stroke="rgba(232,93,39,0.2)"
          strokeWidth={1}
          animate={{ r: [56, 90], opacity: [0.6, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
        />
        {/* Outer pulse ring 2 */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={56}
          fill="none"
          stroke="rgba(232,93,39,0.15)"
          strokeWidth={1}
          animate={{ r: [56, 90], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut", delay: 1.2 }}
        />

        {/* Center node glow */}
        <circle
          cx={cx}
          cy={cy}
          r={52}
          fill="rgba(232,93,39,0.08)"
          filter="url(#glow-orange)"
        />

        {/* Center node */}
        <circle
          cx={cx}
          cy={cy}
          r={44}
          fill="url(#center-grad)"
        />
        <circle
          cx={cx}
          cy={cy}
          r={44}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1.5}
        />

        {/* Agent emoji */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={28}
        >
          {agent.emoji}
        </text>

        {/* Agent name under center */}
        <text
          x={cx}
          y={cy + 62}
          textAnchor="middle"
          fill="#f0f0f0"
          fontSize={14}
          fontWeight={700}
          letterSpacing="0.05em"
        >
          {agent.name.toUpperCase()}
        </text>
        <text
          x={cx}
          y={cy + 80}
          textAnchor="middle"
          fill="#888"
          fontSize={11}
        >
          {agent.role}
        </text>

        {/* Skill nodes */}
        {skillNodes.map((node, idx) => (
          <g
            key={node.skill}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setHoveredSkill(node.skill);
              const rect = (e.currentTarget.closest("svg") as SVGElement).getBoundingClientRect();
              setHoveredPos({ x: node.x + rect.left, y: node.y + rect.top });
            }}
            onMouseLeave={(e) => { e.stopPropagation(); setHoveredSkill(null); setHoveredPos(null); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Glow */}
            <circle
              cx={node.x}
              cy={node.y}
              r={28}
              fill={hoveredSkill === node.skill ? "rgba(232,93,39,0.15)" : "rgba(255,255,255,0.03)"}
              style={{ transition: "fill 0.2s" }}
            />
            {/* Circle */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r={24}
              fill={hoveredSkill === node.skill ? "rgba(30,30,30,1)" : "rgba(20,20,20,0.95)"}
              stroke={hoveredSkill === node.skill ? "rgba(232,93,39,0.7)" : "rgba(255,255,255,0.12)"}
              strokeWidth={hoveredSkill === node.skill ? 1.5 : 1}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + idx * 0.05, type: "spring", stiffness: 260, damping: 20 }}
            />
            {/* Icon */}
            <text
              x={node.x}
              y={node.y - 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={14}
              style={{ pointerEvents: "none" }}
            >
              {SKILL_ICONS[node.skill] || "🔧"}
            </text>
            {/* Skill label */}
            <text
              x={node.x}
              y={node.y + 36}
              textAnchor="middle"
              fill={hoveredSkill === node.skill ? "#e85d27" : "#888"}
              fontSize={10}
              style={{ transition: "fill 0.2s", pointerEvents: "none" }}
            >
              {node.skill}
            </text>
          </g>
        ))}
      </svg>

      {/* Hover popup */}
      <AnimatePresence>
        {hoveredSkill && hoveredPos && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: "fixed",
              left: hoveredPos.x + 30,
              top: hoveredPos.y - 20,
              background: "rgba(17,17,17,0.98)",
              border: "1px solid rgba(232,93,39,0.3)",
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 180,
              maxWidth: 240,
              pointerEvents: "none",
              zIndex: 100,
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{SKILL_ICONS[hoveredSkill] || "🔧"}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e85d27" }}>{hoveredSkill}</span>
            </div>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>
              {skillDescriptions[hoveredSkill] ?? "Custom skill capability"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
