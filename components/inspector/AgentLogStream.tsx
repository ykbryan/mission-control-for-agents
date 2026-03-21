import { useEffect, useRef, useState } from "react";

type LogType = "info" | "error" | "memory";

interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: string;
}

export default function AgentLogStream({ agentId }: { agentId: string }) {
  const [filter, setFilter] = useState<LogType | "all">("all");
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "1", type: "info", message: "Agent initialized", timestamp: new Date().toISOString() },
    { id: "2", type: "memory", message: "Memory loaded from workspace", timestamp: new Date().toISOString() },
    { id: "3", type: "info", message: "Awaiting tasks...", timestamp: new Date().toISOString() },
  ]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter(log => filter === "all" || log.type === filter);

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-[#0a0a0a] border-b border-[#333] p-2 flex gap-2 z-10">
        <button
          className={`px-2 py-1 text-xs rounded ${filter === 'all' ? 'bg-[#e85d27] text-white' : 'bg-[#1a1a1a] text-gray-400'}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${filter === 'info' ? 'bg-[#e85d27] text-white' : 'bg-[#1a1a1a] text-gray-400'}`}
          onClick={() => setFilter("info")}
        >
          Info
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${filter === 'memory' ? 'bg-[#e85d27] text-white' : 'bg-[#1a1a1a] text-gray-400'}`}
          onClick={() => setFilter("memory")}
        >
          Memory
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${filter === 'error' ? 'bg-[#e85d27] text-white' : 'bg-[#1a1a1a] text-gray-400'}`}
          onClick={() => setFilter("error")}
        >
          Error
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain p-2 font-mono text-xs custom-scrollbar">
        {filteredLogs.map(log => (
          <div key={log.id} className="mb-2">
            <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span className={`ml-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'memory' ? 'text-purple-400' : 'text-green-400'}`}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
