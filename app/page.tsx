"use client";

import { useState, useEffect } from "react";
import { agents } from "@/lib/agents";
import AgentList from "@/components/AgentList";
import AgentGraph from "@/components/AgentGraph";
import AgentPanel from "@/components/AgentPanel";
import SearchBar from "@/components/SearchBar";
import { Agent } from "@/lib/agents";

export default function Home() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(agents[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"graph" | "workflow">("graph");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleFile = (fileName: string) => {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  };

  useEffect(() => {
    setOpenFiles(new Set());
  }, [selectedAgent]);

  // "/" shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="hex-bg" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,10,0.9)",
        backdropFilter: "blur(10px)",
        zIndex: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: "linear-gradient(135deg, #e85d27, #c44a1a)",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.02em", color: "#f0f0f0" }}>
              MISSION CONTROL
            </div>
            <div style={{ fontSize: 11, color: "#e85d27", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              OpenClaw Agent Network
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <div style={{ fontSize: 12, color: "#555", display: "flex", gap: 6 }}>
            <span style={{ color: "#888" }}>{agents.length}</span>
            <span>agents</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar — collapsible */}
        {sidebarOpen ? (
          <div style={{ position: "relative", flexShrink: 0, display: "flex" }}>
            <AgentList
              agents={filteredAgents}
              selectedAgent={selectedAgent}
              onSelect={(a) => { setSelectedAgent(a); setViewMode("graph"); }}
            />
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "absolute",
                top: "50%",
                right: -12,
                transform: "translateY(-50%)",
                width: 20,
                height: 48,
                background: "rgba(25,25,25,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderLeft: "none",
                borderRadius: "0 6px 6px 0",
                color: "#666",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                zIndex: 10,
                padding: 0,
              }}
              title="Collapse sidebar"
            >{"<"}</button>
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 20,
              flexShrink: 0,
              alignSelf: "center",
              height: 48,
              background: "rgba(25,25,25,0.97)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderLeft: "none",
              borderRadius: "0 6px 6px 0",
              color: "#666",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              padding: 0,
            }}
            title="Expand sidebar"
          >{">"}</button>
        )}

        {/* Center canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <AgentGraph
            agent={selectedAgent}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>

        {/* Right panel */}
        <AgentPanel
          agent={selectedAgent}
          openFiles={openFiles}
          onToggleFile={toggleFile}
        />
      </div>
    </div>
  );
}
