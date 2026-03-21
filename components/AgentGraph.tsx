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
}

const SKILL_ICONS: Record<string, string> = {
  web_search: "⌕",
  notion: "N",
  pdf: "P",
  web_fetch: "W",
  image: "I",
  gog: "G",
  calendar: "C",
  "apple-reminders": "R",
  nodes: "◎",
  cron: "T",
  firehose: "F",
  "claude-code": "AI",
  exec: ">_",
  git: "G",
  github: "GH",
  xcode: "X",
  browser: "B",
  "vercel-deploy": "V",
  healthcheck: "+",
  message: "M",
};

export default function AgentGraph({ agent, viewMode, onViewModeChange, darkMode = true }: Props) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect") {
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        panStart.current = { ...pan };
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
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
      for (const entry of entries) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });

    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const cx = size.w / 2 + pan.x;
  const cy = size.h / 2 + pan.y;
  const radiusX = Math.min(size.w, 980) * 0.26;
  const radiusY = Math.min(size.h, 620) * 0.28;

  const skillNodes: SkillNode[] = agent.skills.map((skill, index) => {
    const count = agent.skills.length;
    const theta = (index / count) * Math.PI * 2 - Math.PI / 2;
    const breath = index % 2 === 0 ? 1.06 : 0.92;

    return {
      skill,
      x: cx + Math.cos(theta) * radiusX * breath,
      y: cy + Math.sin(theta) * radiusY,
    };
  });

  if (viewMode === "workflow") {
    return (
      <div className="graph-workflow">
        <div className="graph-workflow__header">
          <div>
            <div className="mc-kicker">Workflow mode</div>
            <h3>{agent.name} execution sequence</h3>
          </div>
          <button className="graph-workflow__back" onClick={() => onViewModeChange("graph")}>
            Return to graph
          </button>
        </div>
        <div className="graph-workflow__strip">
          <div className="graph-workflow__bookend">Input</div>
          {agent.skills.map((skill, index) => (
            <div key={skill} className="graph-workflow__step-wrap">
              <div className="graph-workflow__connector" />
              <motion.div
                className="graph-workflow__step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <span className="graph-workflow__glyph">{SKILL_ICONS[skill] || "•"}</span>
                <strong>{skill}</strong>
                <small>{skillDescriptions[skill]}</small>
              </motion.div>
            </div>
          ))}
          <div className="graph-workflow__connector" />
          <div className="graph-workflow__bookend graph-workflow__bookend--accent">Output</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
    >
      <div className="graph-canvas__overlay graph-canvas__overlay--top-left">
        <div className="mc-kicker">Mission surface</div>
        <strong>{agent.role}</strong>
        <span>{agent.skills.length} linked capabilities</span>
      </div>

      <div className="graph-canvas__overlay graph-canvas__overlay--bottom-center">Drag to pan · hover nodes for detail</div>

      <svg width={size.w} height={size.h} className="graph-canvas__svg">
        <defs>
          <radialGradient id="stage-vignette" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)"} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={size.w} height={size.h} fill={darkMode ? "#0a121c" : "#f5f7fb"} />
        <rect x={0} y={0} width={size.w} height={size.h} fill="url(#stage-vignette)" opacity={0.7} />

        {skillNodes.map((node) => {
          const dimmed = hoveredSkill && hoveredSkill !== node.skill;
          const active = hoveredSkill === node.skill;
          return (
            <line
              key={`line-${node.skill}`}
              x1={cx}
              y1={cy}
              x2={node.x}
              y2={node.y}
              stroke={active ? "rgba(240,120,73,0.7)" : darkMode ? "rgba(191,210,230,0.16)" : "rgba(92,110,132,0.2)"}
              strokeWidth={active ? 1.6 : 1}
              opacity={dimmed ? 0.18 : 1}
            />
          );
        })}

        <motion.circle
          cx={cx}
          cy={cy}
          r={84}
          fill="rgba(240,120,73,0.04)"
          animate={{ opacity: [0.25, 0.45, 0.25], scale: [1, 1.03, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        />

        <g>
          <circle
            cx={cx}
            cy={cy}
            r={64}
            fill={darkMode ? "rgba(16,26,38,0.95)" : "rgba(255,255,255,0.95)"}
            stroke="rgba(240,120,73,0.35)"
            strokeWidth={1.2}
          />
          <circle cx={cx} cy={cy} r={42} fill="rgba(240,120,73,0.08)" />
          <text x={cx} y={cy - 4} textAnchor="middle" fill={darkMode ? "#f1f5fa" : "#102033"} fontSize="15" fontWeight="700">
            {agent.name}
          </text>
          <text x={cx} y={cy + 18} textAnchor="middle" fill={darkMode ? "#7d91a8" : "#6d7f92"} fontSize="11">
            command node
          </text>
        </g>

        {skillNodes.map((node, index) => {
          const active = hoveredSkill === node.skill;
          const dimmed = hoveredSkill && hoveredSkill !== node.skill;

          return (
            <g
              key={node.skill}
              onMouseEnter={(event) => {
                setHoveredSkill(node.skill);
                const rect = (event.currentTarget.closest("svg") as SVGElement).getBoundingClientRect();
                setHoveredPos({ x: node.x + rect.left, y: node.y + rect.top });
              }}
              onMouseLeave={() => {
                setHoveredSkill(null);
                setHoveredPos(null);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              style={{ cursor: "pointer" }}
            >
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={active ? 44 : 36}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: dimmed ? 0.24 : 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                fill={darkMode ? "rgba(18,28,40,0.92)" : "rgba(255,255,255,0.98)"}
                stroke={active ? "rgba(240,120,73,0.55)" : darkMode ? "rgba(255,255,255,0.1)" : "rgba(16,32,51,0.1)"}
                strokeWidth={1.2}
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                fill={active ? "#ff996d" : darkMode ? "#dce6f2" : "#203246"}
                fontSize="12"
                fontWeight="700"
              >
                {SKILL_ICONS[node.skill] || "•"}
              </text>
              <text
                x={node.x}
                y={node.y + 58}
                textAnchor="middle"
                fill={active ? "#ff996d" : darkMode ? "#8fa1b4" : "#5d6f83"}
                fontSize="11"
                opacity={dimmed ? 0.28 : 1}
              >
                {node.skill}
              </text>
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {hoveredSkill && hoveredPos && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="graph-tooltip"
            style={{ left: hoveredPos.x + 22, top: hoveredPos.y - 24 }}
          >
            <div className="mc-kicker">Capability</div>
            <strong>{hoveredSkill}</strong>
            <p>{skillDescriptions[hoveredSkill] ?? "Custom skill capability"}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
