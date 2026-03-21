"use client";

import { useEffect, useMemo, useState } from "react";
import { getInspectorMode, getSelectedAgent, getSystemStatusSummary, filterAgents } from "@/lib/mission-control-view-model";
import { MissionControlScreenProps } from "@/components/mission-control-types";
import TopStatusStrip from "@/components/mission-control/TopStatusStrip";
import NavRail from "@/components/mission-control/NavRail";
import MissionStage from "@/components/mission-control/MissionStage";
import SwarmStage from "@/components/stage/SwarmStage";
import InspectorPanel from "@/components/inspector/InspectorPanel";

import AnalyticsStage from "@/components/stage/AnalyticsStage";

export default function MissionControlScreen({ agents }: MissionControlScreenProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"graph" | "workflow">("graph");
  const [railExpanded, setRailExpanded] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [activeView, setActiveView] = useState<"mission" | "swarms" | "analytics">("mission");

  const filteredAgents = useMemo(() => filterAgents(agents, searchQuery), [agents, searchQuery]);
  const selectedAgent = getSelectedAgent(filteredAgents.length ? filteredAgents : agents, selectedAgentId);
  const status = getSystemStatusSummary(agents, mode, selectedAgent);
  const inspectorMode = getInspectorMode(activeFile);

  useEffect(() => {
    setActiveFile(null);
  }, [selectedAgentId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={`mc-root ${darkMode ? "theme-dark" : "theme-light"}`} data-inspector-mode={inspectorMode}>
      <div className="mc-shell">
        <TopStatusStrip
          mode={mode}
          darkMode={darkMode}
          status={status}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleTheme={() => setDarkMode((value) => !value)}
        />

        <div className="flex flex-row overflow-hidden flex-nowrap w-full h-full gap-[18px] flex-1 min-h-0">
          <NavRail
            activeView={activeView}
            onViewChange={setActiveView}
          />

          <div className="flex-1 flex flex-col min-w-0">
          {activeView === "mission" ? (
            <MissionStage
              agents={filteredAgents}
              selectedAgentId={selectedAgent.id}
              onSelectAgent={(agentId) => {
                setSelectedAgentId(agentId);
                setMode("graph");
              }}
              mode={mode}
              darkMode={darkMode}
              onModeChange={setMode}
            />
          ) : activeView === "swarms" ? (
            <SwarmStage />
          ) : (
            <AnalyticsStage />
          )}
          </div>

          {activeView === "mission" && (
            <InspectorPanel
              agent={selectedAgent}
              activeFile={activeFile}
              onSelectFile={setActiveFile}
            />
          )}
        </div>
      </div>
    </div>
  );
}
