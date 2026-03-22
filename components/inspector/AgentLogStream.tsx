"use client";

import { useEffect, useRef, useState } from "react";

type LogType = "info" | "error" | "memory";

interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: string;
  model?: string;
}

const POLL_INTERVAL = 4000; // ms

export default function AgentLogStream({ agentId, routerId }: { agentId: string; routerId?: string }) {
  const [filter, setFilter] = useState<LogType | "all">("all");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLogs([]);
    setLoading(true);

    async function fetchLogs() {
      try {
        const routerParam = routerId ? `&routerId=${encodeURIComponent(routerId)}` : "";
        const res = await fetch(`/api/agent-session?agent=${encodeURIComponent(agentId)}${routerParam}`);
        if (!res.ok) return;
        const data: LogEntry[] = await res.json();
        if (!active) return;
        setLogs(data);
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [agentId, routerId]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = filter === "all" ? logs : logs.filter((l) => l.type === filter);

  const counts = {
    info:   logs.filter((l) => l.type === "info").length,
    memory: logs.filter((l) => l.type === "memory").length,
    error:  logs.filter((l) => l.type === "error").length,
  };

  function tabClass(active: boolean) {
    return `px-2 py-1 text-xs rounded transition-colors ${
      active ? "bg-[#e85d27] text-white" : "bg-[#1a1a1a] text-gray-400 hover:text-gray-200"
    }`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="sticky top-0 bg-[#0a0a0a] border-b border-[#333] p-2 flex gap-2 flex-wrap z-10">
        <button className={tabClass(filter === "all")} onClick={() => setFilter("all")}>
          All {logs.length > 0 && <span className="ml-1 opacity-60">{logs.length}</span>}
        </button>
        <button className={tabClass(filter === "info")} onClick={() => setFilter("info")}>
          Info {counts.info > 0 && <span className="ml-1 opacity-60">{counts.info}</span>}
        </button>
        <button className={tabClass(filter === "memory")} onClick={() => setFilter("memory")}>
          Memory {counts.memory > 0 && <span className="ml-1 opacity-60">{counts.memory}</span>}
        </button>
        <button className={tabClass(filter === "error")} onClick={() => setFilter("error")}>
          Error {counts.error > 0 && <span className="ml-1 opacity-60">{counts.error}</span>}
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overscroll-contain p-2 font-mono text-xs custom-scrollbar"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="text-gray-500 text-xs animate-pulse">Loading activity…</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="text-2xl mb-2 opacity-40">📭</div>
            <p className="text-gray-500 text-xs">
              {logs.length === 0
                ? `No activity found for agent "${agentId}".`
                : "No entries match the current filter."}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="mb-2 leading-relaxed">
              <span className="text-gray-600">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              {log.model && (
                <span className="ml-1 text-[10px] text-gray-600 bg-[#1a1a1a] px-1 rounded">
                  {log.model.split("/").pop()}
                </span>
              )}
              <span
                className={`ml-2 ${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "memory"
                    ? "text-purple-400"
                    : "text-green-400"
                }`}
              >
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-[#333] px-3 py-1 flex items-center justify-between bg-[#0a0a0a]">
        <span className="text-[10px] text-gray-600">Polls every {POLL_INTERVAL / 1000}s</span>
        {logs.length > 0 && (
          <span className="text-[10px] text-gray-600">{logs.length} events</span>
        )}
      </div>
    </div>
  );
}
