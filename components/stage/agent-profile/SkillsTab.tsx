"use client";

import React from "react";
import type { Agent } from "@/lib/agents";
import { accentColor, skillEmoji } from "./types";

interface SkillsTabProps {
  agent: Agent;
}

export function SkillsTab({ agent }: SkillsTabProps) {
  return (
    <div className="flex flex-col gap-6">

      {/* Soul card */}
      <div className="relative rounded-2xl px-5 py-5 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(232,93,39,0.06) 0%, rgba(232,93,39,0.02) 100%)", border: "1px solid rgba(232,93,39,0.15)" }}>
        <div className="absolute top-3 left-4 text-4xl font-serif leading-none select-none" style={{ color: "rgba(232,93,39,0.15)" }}>"</div>
        <div className="absolute bottom-1 right-4 text-4xl font-serif leading-none select-none" style={{ color: "rgba(232,93,39,0.15)" }}>"</div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#e85d2780" }}>Soul</p>
        <p className="text-sm italic leading-relaxed relative z-10 px-4" style={{ color: "#a08070" }}>{agent.soul}</p>
      </div>

      {/* Role */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#2e2e42" }}>Role</p>
        <p className="text-sm font-medium" style={{ color: "#8888a0" }}>{agent.role}</p>
      </div>

      {/* Skills & Tools */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2e2e42" }}>Skills & Tools</p>
        <div className="flex flex-wrap gap-2">
          {agent.skills.map((skill, i) => {
            const color = accentColor(skill);
            const icon  = skillEmoji(skill);
            return (
              <div key={i} className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl"
                style={{
                  background: color + "0e",
                  border: `1px solid ${color}28`,
                }}>
                <span className="text-base leading-none">{icon}</span>
                <span className="text-sm font-medium" style={{ color: color + "cc" }}>{skill}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Memory Files */}
      {agent.files.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2e2e42" }}>Memory Files</p>
          <div className="flex flex-wrap gap-2">
            {agent.files.map(f => (
              <span key={f} className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg"
                style={{ background: "#0d0d18", border: "1px solid #1c1c2e", color: "#3a3a52" }}>
                <span style={{ color: "#2e2e42" }}>📄</span>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
