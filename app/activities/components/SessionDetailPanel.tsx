"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ActivitySession } from "@/app/activities/types";
import type { LogEntry, LogFilter, LogType } from "@/app/activities/types";
import { fmtTokens } from "@/lib/formatters";
import { fmtTs, ACTIVE_MS, LOG_CFG, typeStyle } from "@/app/activities/components/shared";

interface DetailPanelProps {
  session: ActivitySession;
  onClose: () => void;
}

export function SessionDetailPanel({ session, onClose }: DetailPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expandedLog, setExpandedLog] = useState<LogEntry | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function normaliseLogs(data: unknown): LogEntry[] {
    return (Array.isArray(data) ? data : []).map((e: LogEntry) => {
      if (e.type !== "info") return e;
      // User messages (💬) and agent replies (🤖) both belong in the Chats tab
      if (e.message.startsWith("💬") || e.message.startsWith("🤖")) {
        return { ...e, type: "chat" as LogType };
      }
      return e;
    });
  }

  // fetch logs on session change
  useEffect(() => {
    setLoadingLogs(true);
    setLogs([]);
    setFilter("all");

    const params = new URLSearchParams({ agent: session.agentId, routerId: session.routerId });
    params.set("sessionKey", session.key);

    fetch(`/api/agent-session?${params}`)
      .then(r => r.json())
      .then(data => setLogs(normaliseLogs(data)))
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, [session.key, session.agentId, session.routerId]);

  // live polling when session is active
  const isActive = Date.now() - session.updatedAt < ACTIVE_MS;
  useEffect(() => {
    if (!isActive) return;
    const poll = () => {
      const params = new URLSearchParams({ agent: session.agentId, routerId: session.routerId });
      params.set("sessionKey", session.key);
      fetch(`/api/agent-session?${params}`)
        .then(r => r.json())
        .then(data => {
          const next = normaliseLogs(data);
          setLogs(prev => next.length !== prev.length ? next : prev);
        })
        .catch(() => {});
    };
    const iv = setInterval(poll, 3_000);
    return () => clearInterval(iv);
  }, [isActive, session.key, session.agentId, session.routerId]);

  // auto-scroll
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }, []);

  const visible = filter === "all" ? logs : logs.filter(l => l.type === filter);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length };
    for (const l of logs) c[l.type] = (c[l.type] ?? 0) + 1;
    return c;
  }, [logs]);

  const ts = typeStyle(session.type);

  const panel = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} onClick={onClose} />

      {/* Panel */}
      <div
        style={{
          position: "relative", zIndex: 1, width: "min(680px, 90vw)", height: "100%",
          background: "#0a0a0c", borderLeft: "1px solid #1e1e24",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1a1a1f", padding: "12px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>{session.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f0f0" }}>{session.agentId}</span>
                <span style={{ fontSize: "11px", color: "#444" }}>·</span>
                <span style={{ fontSize: "12px", color: "#888" }}>{session.label}</span>
                {isActive && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#4ade80", background: "rgba(74,222,128,0.08)", padding: "1px 8px 1px 6px", borderRadius: "3px" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" }} />
                    Live
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "3px" }}>
                <span style={{ fontSize: "10px", color: "#444", fontFamily: "monospace" }}>{session.key}</span>
              </div>
            </div>
            {/* Meta pills */}
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}>
                {fmtTs(session.updatedAt)}
              </span>
              {session.totalTokens > 0 && (
                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "#111", color: "#555", fontFamily: "monospace" }}>
                  {fmtTokens(session.totalTokens)} tok
                </span>
              )}
              <button
                onClick={onClose}
                style={{ marginLeft: "4px", fontSize: "16px", color: "#444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ borderBottom: "1px solid #111", padding: "8px 12px", display: "flex", gap: "4px", flexShrink: 0, background: "#08080a" }}>
          {(["all", "chat", "info", "memory", "error"] as LogFilter[]).map(f => {
            const active = filter === f;
            const count = counts[f] ?? 0;
            const cfg = f === "all" ? null : LOG_CFG[f as LogType];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: "11px", padding: "3px 10px", borderRadius: "5px", border: "1px solid transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s",
                  background: active ? "#1a1a1a" : "transparent",
                  color: active ? "#e0e0e0" : "#555",
                  borderColor: active ? "#2a2a2a" : "transparent",
                }}
              >
                {cfg && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.dot.replace("bg-", "").includes("-") ? undefined : cfg.dot, flexShrink: 0 }} className={cfg.dot} />}
                {f === "all" ? "All" : cfg?.label}
                <span style={{ fontSize: "10px", fontFamily: "monospace", color: active ? "#666" : "#333" }}>{count}</span>
              </button>
            );
          })}
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              style={{ marginLeft: "auto", fontSize: "10px", padding: "3px 8px", borderRadius: "4px", background: "#1a1a1a", color: "#e85d27", border: "1px solid #2a2a2a", cursor: "pointer" }}
            >
              ↓ Latest
            </button>
          )}
        </div>

        {/* Log list */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
        >
          {loadingLogs ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "48px 0" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid #222", borderTopColor: "#e85d27", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "11px", color: "#444" }}>Loading logs…</span>
            </div>
          ) : visible.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: "8px" }}>
              <span style={{ fontSize: "20px", opacity: 0.1 }}>◌</span>
              <span style={{ fontSize: "11px", color: "#333" }}>No {filter === "all" ? "" : filter + " "}logs</span>
            </div>
          ) : (
            visible.map((log, i) => {
              const cfg = LOG_CFG[log.type] ?? LOG_CFG.info;
              const expandable = !!log.fullMessage;
              return (
                <div
                  key={i}
                  onClick={() => expandable && setExpandedLog(log)}
                  className={`border-l-2 ${cfg.bar}`}
                  style={{
                    padding: "6px 14px 6px 12px", borderBottom: "1px solid #0e0e0e",
                    cursor: expandable ? "pointer" : "default",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.015)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${cfg.dot}`} style={{ minWidth: "6px" }} />
                    <span className={`text-[11px] leading-relaxed break-words flex-1 ${cfg.text}`} style={{ wordBreak: "break-word" }}>
                      {log.message}
                    </span>
                    {expandable && (
                      <span style={{ fontSize: "9px", color: "#444", flexShrink: 0, marginTop: "2px", opacity: 0 }}
                        className="group-hover:opacity-100 transition-opacity"
                      >
                        expand ↗
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer status */}
        <div style={{ borderTop: "1px solid #111", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, background: "#08080a" }}>
          {isActive && (
            <>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: "#22c55e" }}>Live</span>
            </>
          )}
          <span style={{ fontSize: "10px", color: "#333", marginLeft: "auto" }}>{logs.length} events</span>
          <span style={{ fontSize: "10px", color: "#2a2a2a" }}>·</span>
          <span style={{ fontSize: "10px", color: "#333" }}>{session.routerLabel}</span>
        </div>
      </div>

      {/* Expanded log modal */}
      {expandedLog && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExpandedLog(null)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
          <div
            style={{
              position: "relative", zIndex: 1, width: "min(700px, 90vw)", maxHeight: "70vh",
              background: "#0e0e12", border: "1px solid #222", borderRadius: "8px",
              padding: "20px", overflow: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full message</span>
              <button onClick={() => setExpandedLog(null)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
            <p style={{ fontSize: "12px", color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
              {expandedLog.fullMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
