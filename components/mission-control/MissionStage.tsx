import AgentGraph from "@/components/AgentGraph";
import { Agent } from "@/lib/agents";

interface Props {
  agent: Agent;
  mode: "graph" | "workflow";
  darkMode: boolean;
  onModeChange: (mode: "graph" | "workflow") => void;
}

export default function MissionStage({ agent, mode, darkMode, onModeChange }: Props) {
  return (
    <section className="mc-stage">
      <div className="mc-stage__toolbar">
        <div>
          <div className="mc-kicker">Center stage</div>
          <h2>{agent.name}</h2>
        </div>
        <div className="mc-stage__toolbar-actions">
          <button
            className={`mc-stage-toggle ${mode === "graph" ? "is-active" : ""}`}
            onClick={() => onModeChange("graph")}
          >
            Graph
          </button>
          <button
            className={`mc-stage-toggle ${mode === "workflow" ? "is-active" : ""}`}
            onClick={() => onModeChange("workflow")}
          >
            Workflow
          </button>
        </div>
      </div>

      <div className="mc-stage__canvas-wrap">
        <div className="mc-stage__glow mc-stage__glow--one" />
        <div className="mc-stage__glow mc-stage__glow--two" />
        <AgentGraph agent={agent} viewMode={mode} onViewModeChange={onModeChange} darkMode={darkMode} />
      </div>
    </section>
  );
}
