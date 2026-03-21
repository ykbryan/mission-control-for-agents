import { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  selectedAgentId: string;
  railExpanded: boolean;
  onSelect: (agent: Agent) => void;
  onToggleExpanded: () => void;
}

export default function NavRail({ agents, selectedAgentId, railExpanded, onSelect, onToggleExpanded }: Props) {
  return (
    <aside className={`mc-rail ${railExpanded ? "is-expanded" : ""}`}>
      <div className="mc-rail__brand">
        <div className="mc-rail__brand-mark">◈</div>
        {railExpanded && (
          <div className="mc-rail__brand-copy">
            <div className="mc-kicker">Workspace</div>
            <div className="mc-rail__brand-title">Agents</div>
          </div>
        )}
      </div>

      <nav className="mc-rail__nav" aria-label="Agent navigation">
        {agents.map((agent) => {
          const active = agent.id === selectedAgentId;
          return (
            <button
              key={agent.id}
              className={`mc-rail-item ${active ? "is-active" : ""}`}
              onClick={() => onSelect(agent)}
              title={agent.name}
            >
              <span className="mc-rail-item__icon">{agent.emoji}</span>
              {railExpanded && (
                <span className="mc-rail-item__copy">
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mc-rail__utilities">
        <button className="mc-rail-utility" onClick={onToggleExpanded} title={railExpanded ? "Collapse rail" : "Expand rail"}>
          {railExpanded ? "←" : "→"}
        </button>
        <button className="mc-rail-utility" title="Settings">
          ⚙
        </button>
      </div>
    </aside>
  );
}
