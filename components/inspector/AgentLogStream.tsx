"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type LogType = "info" | "error" | "memory";

interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  fullMessage?: string;
  timestamp: string;
  model?: string;
}

const POLL_INTERVAL = 4000;

const TYPE_CFG = {
  info: {
    dot: "bg-emerald-500",
    bar: "border-l-emerald-500/30",
    text: "text-emerald-300/90",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dot2: "bg-emerald-500/50",
    label: "Info",
  },
  memory: {
    dot: "bg-violet-500",
    bar: "border-l-violet-500/40",
    text: "text-violet-300/90",
    badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    dot2: "bg-violet-500/50",
    label: "Memory",
  },
  error: {
    dot: "bg-red-500",
    bar: "border-l-red-500/50",
    text: "text-red-300/90",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    dot2: "bg-red-500/60",
    label: "Error",
  },
} as const;

function isToolCall(msg: string) {
  const stripped = msg.replace(/^[^\w(]*/, ""); // strip leading emoji/spaces
  return (
    msg.startsWith("🛠") ||
    msg.startsWith("⚙") ||
    stripped.startsWith("exec(") ||
    stripped.startsWith("bash(") ||
    stripped.startsWith("python") ||
    /^[\w_]+\s*\(/.test(stripped)
  );
}

export default function AgentLogStream({
  agentId,
  routerId,
}: {
  agentId: string;
  routerId?: string;
}) {
  const [filter, setFilter] = useState<LogType | "all">("all");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLog, setExpandedLog] = useState<LogEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLogs([]);
    setFetchError(null);
    setLoading(true);

    async function fetchLogs() {
      try {
        const routerParam = routerId
          ? `&routerId=${encodeURIComponent(routerId)}`
          : "";
        const res = await fetch(
          `/api/agent-session?agent=${encodeURIComponent(agentId)}${routerParam}`
        );
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setFetchError(
            data?.error ??
              `HTTP ${res.status} — check that the correct gateway router is configured`
          );
          return;
        }
        if (data?.error) {
          setFetchError(data.error);
          return;
        }
        setLogs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (active)
          setFetchError(e instanceof Error ? e.message : "Network error");
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

  // Auto-scroll to bottom on new logs when enabled
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Detect if user scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  }, []);

  const filteredLogs =
    filter === "all" ? logs : logs.filter((l) => l.type === filter);

  const counts = {
    info: logs.filter((l) => l.type === "info").length,
    memory: logs.filter((l) => l.type === "memory").length,
    error: logs.filter((l) => l.type === "error").length,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#080808" }}>
      {/* ── Filter bar ── */}
      <div
        className="sticky top-0 z-10 flex items-center gap-1 px-3 py-2 border-b flex-wrap"
        style={{ background: "#0a0a0a", borderColor: "#161616" }}
      >
        {/* All */}
        <FilterTab
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={logs.length}
          activeClass="bg-[#1e1e1e] text-white border border-[#2e2e2e]"
          countClass="bg-[#2a2a2a] text-gray-400"
        />
        {(["info", "memory", "error"] as LogType[]).map((t) => {
          const cfg = TYPE_CFG[t];
          return (
            <FilterTab
              key={t}
              active={filter === t}
              onClick={() => setFilter(t)}
              label={cfg.label}
              count={counts[t]}
              dot={cfg.dot}
              activeDot={cfg.dot}
              activeClass={`border ${cfg.badge}`}
              countClass="bg-black/20"
            />
          );
        })}
      </div>

      {/* ── Log list ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{
                borderColor: "#222",
                borderTopColor: "#e85d27",
              }}
            />
            <p className="text-[11px] text-gray-600">Fetching activity…</p>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
            >
              !
            </div>
            <p className="text-[11px] text-red-400/70 font-mono break-all leading-relaxed">
              {fetchError}
            </p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-2">
            <div className="text-xl opacity-10 select-none">◌</div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              {logs.length === 0
                ? `No activity found for "${agentId}"`
                : "No entries match this filter"}
            </p>
          </div>
        ) : (
          <div>
            {filteredLogs.map((log, i) => {
              const cfg = TYPE_CFG[log.type];
              const tool = isToolCall(log.message);
              const ts = new Date(log.timestamp);
              const timeStr = ts.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              const expandable = !!(log.fullMessage);
              return (
                <div
                  key={log.id}
                  onClick={() => expandable && setExpandedLog(log)}
                  className={`group relative border-l-2 px-3 pt-2 pb-2.5 transition-colors ${cfg.bar} ${expandable ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                  style={{
                    background:
                      i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)",
                    borderBottom: "1px solid #0f0f0f",
                  }}
                >
                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] tabular-nums select-none"
                      style={{ color: "#444" }}
                    >
                      {timeStr}
                    </span>
                    {log.model && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-px rounded border"
                        style={{
                          color: "#555",
                          background: "#111",
                          borderColor: "#1e1e1e",
                        }}
                      >
                        {log.model.split("/").pop()}
                      </span>
                    )}
                    {expandable && (
                      <span className="ml-auto text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#e85d27" }}>
                        expand ↗
                      </span>
                    )}
                    {!expandable && (
                      <span className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot2}`} />
                    )}
                  </div>
                  {/* Message */}
                  {tool ? (
                    <pre
                      className={`text-[10px] font-mono ${cfg.text} whitespace-pre-wrap break-all leading-relaxed rounded px-2 py-1.5`}
                      style={{
                        background: "#0d0d0d",
                        border: "1px solid #161616",
                      }}
                    >
                      {log.message}
                    </pre>
                  ) : (
                    <p className={`text-[11px] ${cfg.text} leading-relaxed break-words`}>
                      {log.message}
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-t"
        style={{ background: "#080808", borderColor: "#141414" }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "#22c55e" }}
          />
          <span className="text-[10px]" style={{ color: "#3a3a3a" }}>
            Live · {POLL_INTERVAL / 1000}s
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-[10px] font-medium transition-colors hover:opacity-80"
              style={{ color: "#e85d27" }}
            >
              ↓ Latest
            </button>
          )}
          {logs.length > 0 && (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "#333" }}
            >
              {logs.length.toLocaleString()} events
            </span>
          )}
        </div>
      </div>

      {/* ── Full message popup ── */}
      {expandedLog && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setExpandedLog(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[70vh] flex flex-col rounded-lg overflow-hidden"
            style={{ background: "#0f0f0f", border: "1px solid #222" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#1a1a1a" }}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${TYPE_CFG[expandedLog.type].dot}`} />
                <span className="text-[11px] tabular-nums" style={{ color: "#555" }}>
                  {new Date(expandedLog.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                {expandedLog.model && (
                  <span className="text-[9px] font-mono px-1.5 py-px rounded border" style={{ color: "#555", background: "#161616", borderColor: "#222" }}>
                    {expandedLog.model.split("/").pop()}
                  </span>
                )}
              </div>
              <button
                onClick={() => setExpandedLog(null)}
                className="text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            {/* Modal body */}
            <div className="overflow-y-auto p-4 custom-scrollbar">
              <p className={`text-xs ${TYPE_CFG[expandedLog.type].text} leading-relaxed whitespace-pre-wrap break-words`}>
                {expandedLog.fullMessage ?? expandedLog.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter tab sub-component ──
function FilterTab({
  active,
  onClick,
  label,
  count,
  dot,
  activeDot,
  activeClass,
  countClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
  activeDot?: string;
  activeClass: string;
  countClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
        active ? activeClass : "text-gray-600 hover:text-gray-300 hover:bg-[#111]"
      }`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            active ? activeDot ?? dot : "bg-gray-700"
          }`}
        />
      )}
      {label}
      {count > 0 && (
        <span
          className={`px-1.5 py-px rounded text-[10px] font-mono ${
            active ? countClass : "text-gray-700"
          }`}
          style={active ? {} : { background: "transparent" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
