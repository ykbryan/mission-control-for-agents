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
import AgentProfileStage from "@/components/stage/AgentProfileStage";
import { AnimatePresence, motion } from "framer-motion";

export default function MissionControlScreen({ agents }: MissionControlScreenProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [drilledDownAgentId, setDrilledDownAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"graph" | "workflow">("graph");
  const [darkMode, setDarkMode] = useState(true);
  const [activeView, setActiveView] = useState<"mission" | "swarms" | "analytics">("mission");

  const filteredAgents = useMemo(() => filterAgents(agents, searchQuery), [agents, searchQuery]);
  const selectedAgent = getSelectedAgent(filteredAgents.length ? filteredAgents : agents, selectedAgentId);
  const profileAgent = getSelectedAgent(agents, drilledDownAgentId ?? "");
  const status = getSystemStatusSummary(agents, mode, selectedAgent);
  const inspectorMode = getInspectorMode(activeFile);

  useEffect(() => {
    setActiveFile(null);
  }, [selectedAgentId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Handle Cmd+K
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      }
      if (event.key === "Escape") {
        setDrilledDownAgentId(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100 ${darkMode ? "dark" : "light"}`} data-inspector-mode={inspectorMode}>
      <TopStatusStrip
        mode={mode}
        darkMode={darkMode}
        status={status}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleTheme={() => setDarkMode((value) => !value)}
        selectedAgent={drilledDownAgentId ? profileAgent?.name : selectedAgent?.name}
      />

      <div className="flex flex-row overflow-hidden flex-nowrap w-full h-full flex-1 min-h-0">
        <NavRail
          activeView={activeView}
          onViewChange={setActiveView}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          <AnimatePresence mode="wait">
            {activeView === "mission" && !drilledDownAgentId && (
              <motion.div
                key="mission-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 h-full w-full"
              >
                <MissionStage
                  agents={filteredAgents}
                  selectedAgentId={selectedAgent.id}
                  onSelectAgent={(agentId) => {
                    setSelectedAgentId(agentId);
                    setMode("graph");
                  }}
                  onNodeDoubleClick={(agentId) => {
                    setDrilledDownAgentId(agentId);
                  }}
                  mode={mode}
                  darkMode={darkMode}
                  onModeChange={setMode}
                />
              </motion.div>
            )}
            
            {activeView === "mission" && drilledDownAgentId && profileAgent && (
              <motion.div
                key="agent-profile-stage"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full overflow-y-auto custom-scrollbar"
              >
                <AgentProfileStage
                  agent={profileAgent}
                  onBack={() => setDrilledDownAgentId(null)}
                />
              </motion.div>
            )}
            
            {activeView === "swarms" && (
              <motion.div
                key="swarm-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 h-full w-full"
              >
                <SwarmStage />
              </motion.div>
            )}

            {activeView === "analytics" && (
              <motion.div
                key="analytics-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 h-full w-full"
              >
                <AnalyticsStage />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeView === "mission" && !drilledDownAgentId && (
          <InspectorPanel
            agent={selectedAgent}
            activeFile={activeFile}
            onSelectFile={setActiveFile}
          />
        )}
      </div>
    </div>
  );
}
