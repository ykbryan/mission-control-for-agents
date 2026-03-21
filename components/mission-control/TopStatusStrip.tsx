interface Props {
  mode: "graph" | "workflow";
  darkMode: boolean;
  status: string[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onToggleTheme: () => void;
}

import SearchTrigger from "@/components/ui/SearchTrigger";

export default function TopStatusStrip({
  mode,
  darkMode,
  status,
  searchQuery,
  onSearchChange,
  onToggleTheme,
}: Props) {
  return (
    <header className="mc-top-strip">
      <div className="mc-top-strip__identity">
        <div className="mc-kicker">MISSION CONTROL</div>
        <div>
          <h1 className="mc-top-strip__title">Executive operations theatre</h1>
          <p className="mc-top-strip__subtitle">OpenClaw network · framed stage layout</p>
        </div>
      </div>

      <div className="mc-top-strip__status" aria-label="System status summary">
        {status.map((item) => (
          <span key={item} className="mc-status-pill">
            {item}
          </span>
        ))}
      </div>

      <div className="mc-top-strip__actions">
        <SearchTrigger value={searchQuery} onChange={onSearchChange} />
        <button className="mc-icon-button" onClick={onToggleTheme} title="Toggle theme">
          {darkMode ? "☀︎" : "☾"}
        </button>
        <div className="mc-mode-pill">{mode === "graph" ? "Graph stage" : "Workflow stage"}</div>
      </div>
    </header>
  );
}
