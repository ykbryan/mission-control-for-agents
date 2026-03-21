"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Agent, skillDescriptions } from "@/lib/agents";

interface Props {
  agent: Agent;
  viewMode: "graph" | "workflow";
  onViewModeChange: (m: "graph" | "workflow") => void;
  darkMode?: boolean;
}

interface SkillNode {
  skill: string;
  x: number;
  y: number;
  angle: number;
}

// Kept for workflow view and hover tooltip
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

function hexPath(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (-90 + i * 60) * (Math.PI / 180);
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  });
  return `M ${points.join(" L ")} Z`;
}

function SkillIcon({ skill, cx, cy }: { skill: string; cx: number; cy: number }) {
  const color = "#d0d0d0";
  const sp = {
    stroke: color,
    strokeWidth: 1.5,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (skill === "web_search" || skill === "browser") {
    return (
      <>
        <circle cx={cx - 2} cy={cy - 2} r={8} {...sp} />
        <line x1={cx + 4} y1={cy + 4} x2={cx + 9} y2={cy + 9} {...sp} strokeWidth={2.5} />
      </>
    );
  }
  if (skill === "notion" || skill === "pdf" || skill === "web_fetch") {
    return (
      <>
        <rect x={cx - 7} y={cy - 9} width={14} height={18} rx={2} {...sp} />
        <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy - 4} {...sp} />
        <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} {...sp} />
        <line x1={cx - 4} y1={cy + 4} x2={cx + 1} y2={cy + 4} {...sp} />
      </>
    );
  }
  if (["exec", "github", "git", "xcode", "claude-code", "vercel-deploy"].includes(skill)) {
    return (
      <>
        <polyline points={`${cx - 10},${cy - 8} ${cx - 4},${cy} ${cx - 10},${cy + 8}`} {...sp} />
        <polyline points={`${cx + 10},${cy - 8} ${cx + 4},${cy} ${cx + 10},${cy + 8}`} {...sp} />
      </>
    );
  }
  if (skill === "gog" || skill === "message") {
    return (
      <>
        <rect x={cx - 10} y={cy - 7} width={20} height={14} rx={2} {...sp} />
        <polyline points={`${cx - 10},${cy - 7} ${cx},${cy + 2} ${cx + 10},${cy - 7}`} {...sp} />
      </>
    );
  }
  if (["cron", "calendar", "apple-reminders"].includes(skill)) {
    return (
      <>
        <circle cx={cx} cy={cy} r={9} {...sp} />
        <line x1={cx} y1={cy - 5} x2={cx} y2={cy} {...sp} />
        <line x1={cx} y1={cy} x2={cx + 4} y2={cy + 3} {...sp} />
      </>
    );
  }
  if (["nodes", "healthcheck", "firehose"].includes(skill)) {
    return (
      <>
        <circle cx={cx} cy={cy} r={5} {...sp} />
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const rad = (deg - 90) * Math.PI / 180;
          return (
            <line
              key={i}
              x1={cx + Math.cos(rad) * 6.5} y1={cy + Math.sin(rad) * 6.5}
              x2={cx + Math.cos(rad) * 10} y2={cy + Math.sin(rad) * 10}
              {...sp} strokeWidth={2.5}
            />
          );
        })}
      </>
    );
  }
  if (skill === "image" || skill === "camera") {
    return (
      <polygon
        points={`${cx},${cy - 10} ${cx + 7},${cy} ${cx},${cy + 10} ${cx - 7},${cy}`}
        {...sp}
      />
    );
  }
  // Default: circle with center dot
  return (
    <>
      <circle cx={cx} cy={cy} r={9} {...sp} />
      <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="none" />
    </>
  );
}

export default function AgentGraph({ agent, viewMode, onViewModeChange, darkMode = true }: Props) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect") {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

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
  const radius = Math.min(size.w, size.h) * 0.3;

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
      style={{ width: "100%", height: "100%", position: "relative", cursor: isDragging.current ? "grabbing" : "grab", background: darkMode ? "#0a0a0a" : "#f5f5f5" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
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

      <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "#444", pointerEvents: "none", zIndex: 5 }}>
        drag to pan
      </div>

      <svg width={size.w} height={size.h} style={{ position: "absolute", top: 0, left: 0, userSelect: "none" }}>
        <rect x={0} y={0} width={size.w} height={size.h} fill={darkMode ? "#0a0a0a" : "#f5f5f5"} />

        <defs>
          <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-node" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Connection lines — defined with IDs for animateMotion */}
        {skillNodes.map((node, idx) => (
          <path
            key={`line-${idx}`}
            id={`lp-${idx}`}
            d={`M ${cx},${cy} L ${node.x},${node.y}`}
            stroke={hoveredSkill === node.skill ? "rgba(232,93,39,0.45)" : "rgba(255,255,255,0.14)"}
            strokeWidth={hoveredSkill === node.skill ? 1.5 : 1}
            fill="none"
            style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
          />
        ))}

        {/* Animated orange particles traveling along connection lines */}
        {skillNodes.map((_node, idx) =>
          [0, 0.8, 1.6].map((delay, j) => (
            <circle key={`p-${idx}-${j}`} r={3} fill="#e85d27" opacity={0.85}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <animateMotion
                {...({ dur: "2s", repeatCount: "indefinite", begin: `${delay}s` } as any)}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <mpath {...({ href: `#lp-${idx}` } as any)} />
              </animateMotion>
            </circle>
          ))
        )}

        {/* Pulse rings */}
        <motion.circle
          cx={cx} cy={cy} r={56}
          fill="none" stroke="rgba(232,93,39,0.25)" strokeWidth={1}
          animate={{ r: [56, 95], opacity: [0.6, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
        />
        <motion.circle
          cx={cx} cy={cy} r={56}
          fill="none" stroke="rgba(232,93,39,0.15)" strokeWidth={1}
          animate={{ r: [56, 95], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut", delay: 1.25 }}
        />

        {/* Hex glow */}
        <path
          d={hexPath(cx, cy, 52)}
          fill="rgba(232,93,39,0.08)"
          filter="url(#glow-orange)"
        />

        {/* Hexagonal center node */}
        <path
          d={hexPath(cx, cy, 44)}
          fill="#0d0d0d"
          stroke="#e85d27"
          strokeWidth={2}
        />

        {/* Robot face */}
        {/* Left eye */}
        <circle cx={cx - 11} cy={cy - 7} r={5} fill="#111" stroke="#e85d27" strokeWidth={1.5} />
        <circle cx={cx - 11} cy={cy - 7} r={2} fill="#e85d27" />
        {/* Right eye */}
        <circle cx={cx + 11} cy={cy - 7} r={5} fill="#111" stroke="#e85d27" strokeWidth={1.5} />
        <circle cx={cx + 11} cy={cy - 7} r={2} fill="#e85d27" />
        {/* Mouth bar */}
        <rect x={cx - 11} y={cy + 5} width={22} height={6} rx={2} fill="none" stroke="#e85d27" strokeWidth={1.5} />
        <line x1={cx - 4} y1={cy + 5} x2={cx - 4} y2={cy + 11} stroke="#e85d27" strokeWidth={1} />
        <line x1={cx + 4} y1={cy + 5} x2={cx + 4} y2={cy + 11} stroke="#e85d27" strokeWidth={1} />

        {/* Center label */}
        <text x={cx} y={cy + 62} textAnchor="middle" fill="#f0f0f0" fontSize={13} fontWeight={700} letterSpacing="0.08em">
          Agent
        </text>
        <text x={cx} y={cy + 78} textAnchor="middle" fill="#666" fontSize={11}>
          {agent.name}
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
            {hoveredSkill === node.skill && (
              <circle cx={node.x} cy={node.y} r={42} fill="rgba(232,93,39,0.08)" filter="url(#glow-node)" />
            )}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r={34}
              fill={hoveredSkill === node.skill ? "rgba(28,28,28,1)" : "rgba(18,18,18,0.95)"}
              stroke={hoveredSkill === node.skill ? "rgba(232,93,39,0.6)" : "rgba(255,255,255,0.1)"}
              strokeWidth={1.5}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + idx * 0.05, type: "spring", stiffness: 260, damping: 20 }}
            />
            <SkillIcon skill={node.skill} cx={node.x} cy={node.y} />
            <text
              x={node.x}
              y={node.y + 48}
              textAnchor="middle"
              fill={hoveredSkill === node.skill ? "#e85d27" : "#aaa"}
              fontSize={11}
              fontWeight={500}
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
