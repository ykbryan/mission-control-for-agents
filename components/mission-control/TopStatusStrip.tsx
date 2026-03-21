"use client";

import SearchTrigger from "@/components/ui/SearchTrigger";
import Cookies from "js-cookie";

interface Props {
  mode: "graph" | "workflow";
  darkMode: boolean;
  status: string[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onToggleTheme: () => void;
}

export default function TopStatusStrip({
  mode,
  darkMode,
  status,
  searchQuery,
  onSearchChange,
  onToggleTheme,
}: Props) {
  const handleLogout = () => {
    Cookies.remove("gatewayUrl");
    Cookies.remove("gatewayToken");
    window.location.href = "/login";
  };

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
        <button className="mc-icon-button" onClick={handleLogout} title="Disconnect/Logout" style={{ padding: "0 8px", fontSize: "12px", background: "transparent", color: "inherit", border: "1px solid currentColor", borderRadius: "4px" }}>
          Disconnect
        </button>
        <div className="mc-mode-pill">{mode === "graph" ? "Graph stage" : "Workflow stage"}</div>
      </div>
    </header>
  );
}
