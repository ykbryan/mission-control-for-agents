"use client";

import SearchTrigger from "@/components/ui/SearchTrigger";

interface Props {
  mode: "graph" | "workflow";
  darkMode: boolean;
  status: string[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onToggleTheme: () => void;
  selectedAgent?: string;
}

export default function TopStatusStrip({
  mode,
  darkMode,
  status,
  searchQuery,
  onSearchChange,
  onToggleTheme,
  selectedAgent,
}: Props) {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 text-zinc-100 shrink-0">
      <div className="flex items-center gap-2 text-sm font-medium tracking-wide">
        <span className="text-zinc-400">Mission Control</span>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-300">Agents</span>
        {selectedAgent && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-orange-500">{selectedAgent}</span>
          </>
        )}
      </div>

      <div className="flex-1 max-w-md mx-4 relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
        <input
          id="search-input"
          type="text"
          placeholder="Global command search..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="block w-full pl-10 pr-12 py-1.5 bg-zinc-900/50 border border-zinc-700/50 rounded-md text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
        />
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
          <span className="text-xs text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50">Cmd+K</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status.map((item) => (
          <span key={item} className="text-xs font-mono text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800/50">
            {item}
          </span>
        ))}
        <button onClick={onToggleTheme} title="Toggle theme" className="p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors">
          {darkMode ? "☀︎" : "☾"}
        </button>
        <button onClick={handleLogout} title="Disconnect" className="px-3 py-1.5 text-xs font-medium bg-transparent border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
          Disconnect
        </button>
      </div>
    </header>
  );
}
