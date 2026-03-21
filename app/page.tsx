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
  const [darkMode, setDarkMode] = useState(true);

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
    <div className={`hex-bg app-shell ${!darkMode ? "light-mode" : ""}`}>
      <div className="app-chrome">
        <header className="topbar glass-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="brand-mark">⚡</div>
            <div>
              <div className="brand-title">MISSION CONTROL</div>
              <div className="brand-subtitle">OpenClaw Agent Network</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="mode-toggle"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            <div className="agent-count-pill">
              <span className="agent-count-number">{agents.length}</span>
              <span>agents online</span>
            </div>
          </div>
        </header>

        <main className="content-grid">
          {sidebarOpen ? (
            <div className="sidebar-shell">
              <AgentList
                agents={filteredAgents}
                selectedAgent={selectedAgent}
                onSelect={(a) => {
                  setSelectedAgent(a);
                  setViewMode("graph");
                }}
              />
              <button
                onClick={() => setSidebarOpen(false)}
                className="edge-toggle edge-toggle-right"
                title="Collapse sidebar"
              >
                {"<"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="edge-toggle edge-toggle-left"
              title="Expand sidebar"
            >
              {">"}
            </button>
          )}

          <section className="graph-shell glass-panel">
            <AgentGraph
              agent={selectedAgent}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              darkMode={darkMode}
            />
          </section>

          <AgentPanel
            agent={selectedAgent}
            openFiles={openFiles}
            onToggleFile={toggleFile}
          />
        </main>
      </div>
    </div>
  );
}
