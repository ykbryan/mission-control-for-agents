"use client";

import { useEffect, useState, useRef } from "react";
import type { ActivitySession, ActivityEvent, SwarmChain, SwarmChainStep } from "@/app/activities/types";
import { timeAgo, fmtTokens } from "@/lib/formatters";
import { ACTIVE_MS, typeStyle } from "@/app/activities/components/shared";
import { SessionRow } from "@/app/activities/components/SessionRow";
import { Empty } from "@/app/activities/components/Empty";

// ── helpers ────────────────────────────────────────────────────────────────────

function extractSpawnedAgentIds(events: ActivityEvent[]): string[] {
  const seen = new Set<string>();
  const spawned: string[] = [];

  function add(id: string) {
    if (id && !seen.has(id)) { seen.add(id); spawned.push(id); }
  }

  for (const e of events) {
    const msg = e.fullMessage ?? e.message ?? '';

    // Pattern 1: sessions_spawn({"agentId": "xxx"})
    if (msg.includes('sessions_spawn')) {
      const match = msg.match(/sessions_spawn\((\{[\s\S]*?\})\)/);
      if (match) {
        try { const args = JSON.parse(match[1]); if (args.agentId) add(args.agentId); } catch { /* ignore */ }
      }
    }

    // Pattern 2: openclaw agent --agent <name> (covers exec calls)
    for (const m of msg.matchAll(/openclaw\s+agent\s+--agent\s+([\w-]+)/gi)) {
      add(m[1].toLowerCase());
    }

    // Pattern 3: --agent <name> anywhere (shorter variant)
    for (const m of msg.matchAll(/--agent\s+([\w-]+)/gi)) {
      add(m[1].toLowerCase());
    }
  }
  return spawned;
}

function isMetadataMsg(text: string): boolean {
  return (
    /^conversation info/i.test(text) ||
    /^untrusted metadata/i.test(text) ||
    text.includes('"message_id"') ||
    text.includes("'message_id'") ||
    /^```\s*json/i.test(text) ||
    /^\s*\{/.test(text)
  );
}

function extractLastActivity(events: ActivityEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const msg = e.message?.trim() ?? '';
    if (!msg || msg.length < 10) continue;
    // Prefer agent/user chat messages
    if (msg.startsWith('🤖') || msg.startsWith('💬')) {
      // Use fullMessage if available (untruncated, no prefix), else strip prefix
      const text = (e.fullMessage ?? msg.replace(/^[🤖💬]\s*/, '')).trim();
      if (isMetadataMsg(text)) continue;
      if (text.length < 2) continue;
      return text.slice(0, 120);
    }
    // Skip tool calls, model changes, system noise
    if (msg.startsWith('🛠️') || msg.startsWith('🔄') || msg.startsWith('🧠')) continue;
    if (msg.startsWith('[') || msg.startsWith('{') || msg.includes('tool_use')) continue;
    if (isMetadataMsg(msg)) continue;
    if (msg.length > 15) return msg.slice(0, 120);
  }
  return undefined;
}

// Boilerplate resume/system messages to skip
const SKIP_PATTERNS = [
  /^continue where you left off/i,
  /^the previous model attempt/i,
  /^resuming previous session/i,
  /^picking up where/i,
  /^your task is to continue/i,
  /^conversation info/i,
  /^untrusted metadata/i,
  /^\s*\{.*"message_id"/i,         // raw Telegram JSON starting with {
  /^[`'"]+\s*json\s*\{/i,          // ```json { ... } code block
  /^[`'"]+\s*\{.*"message_id"/i,   // quoted/backtick JSON with message_id
];

// Find the most recent substantive user (💬) message — the current task
function extractTaskMessage(events: ActivityEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    // Always check the message field for the 💬 prefix
    if (!e.message?.startsWith('💬')) continue;
    // Use fullMessage (untruncated, no prefix) if available; otherwise strip prefix from message
    const text = (e.fullMessage ?? e.message.replace(/^💬\s*/, '')).trim();
    if (text.length < 2) continue;

    // Telegram/JSON metadata wrapper — the message field is truncated JSON;
    // fullMessage (from updated router) stores the extracted real text after the block.
    // If fullMessage is itself the JSON (old session), skip this event.
    if (/^conversation info/i.test(text) || /^untrusted metadata/i.test(text) ||
        text.includes('"message_id"') || text.includes("'message_id'") ||
        /^```\s*json/i.test(text)) {
      continue; // skip, find earlier real message
    }

    if (SKIP_PATTERNS.some(p => p.test(text))) continue;
    return text.slice(0, 200);
  }
  return undefined;
}

// ── component ─────────────────────────────────────────────────────────────────

export function SwarmTraceView({
  activeSessions,
  allSessions,
  onOpen,
}: {
  activeSessions: ActivitySession[];
  allSessions: ActivitySession[];
  onOpen: (s: ActivitySession) => void;
}) {
  const [chains, setChains] = useState<SwarmChain[]>([]);
  const [orphans, setOrphans] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionSummaries, setSessionSummaries] = useState<Map<string, string>>(new Map());
  const [taskMessages, setTaskMessages] = useState<Map<string, string>>(new Map());
  const hasLoadedRef = useRef(false);
  // Preserve display order after first load so chains don't jump around on re-polls
  const stableOrderRef = useRef<string[]>([]);

  useEffect(() => {
    // Prefer telegram sessions as roots (triggered by external message);
    // fall back to any active main sessions if no telegram roots found
    const telegramRoots = activeSessions.filter(s => s.type === "telegram");
    const roots = telegramRoots.length > 0
      ? telegramRoots
      : activeSessions.filter(s => s.type === "main");

    if (roots.length === 0) {
      setChains([]);
      setOrphans(activeSessions);
      setLoading(false);
      return;
    }

    // Only show spinner on first load; subsequent rebuilds (every 5s poll) are silent.
    if (!hasLoadedRef.current) setLoading(true);

    async function buildChains() {
      const builtChains: SwarmChain[] = [];
      const claimedKeys = new Set<string>();
      const summaries = new Map<string, string>();
      const tasks = new Map<string, string>();

      for (const root of roots) {
        claimedKeys.add(root.key);
        try {
          const params = new URLSearchParams({
            agent: root.agentId,
            routerId: root.routerId,
            sessionKey: root.key,
          });
          const res = await fetch(`/api/agent-session?${params}`);
          const events: ActivityEvent[] = await res.json();

          // Show the latest chat message as the task banner
          const latestChat = extractLastActivity(events);
          if (latestChat) tasks.set(root.key, latestChat);
          if (latestChat) summaries.set(root.key, latestChat);

          const spawnedIds = extractSpawnedAgentIds(events);

          // Deduplicate spawned agent IDs (preserve order)
          const seenIds = new Set<string>();
          const uniqueSpawnedIds: string[] = [];
          for (const id of spawnedIds) {
            if (!seenIds.has(id)) {
              seenIds.add(id);
              uniqueSpawnedIds.push(id);
            }
          }

          // Time window: root.updatedAt - 2h to now
          const windowStart = root.updatedAt - 2 * 60 * 60 * 1000;
          const windowEnd = Date.now();

          // Group spawned sessions by agentId in order
          const stepMap = new Map<string, ActivitySession[]>();
          for (const agentId of uniqueSpawnedIds) {
            const matched = allSessions.filter(
              s =>
                s.agentId === agentId &&
                s.updatedAt >= windowStart &&
                s.updatedAt <= windowEnd
            ).sort((a, b) => a.updatedAt - b.updatedAt);
            if (matched.length > 0) {
              stepMap.set(agentId, matched);
              for (const m of matched) claimedKeys.add(m.key);
            }
          }

          // Timing-based fallback: only when there is a single root to avoid wrongly
          // pulling agents from a different concurrent task into this chain.
          if (roots.length === 1) {
            const candidates = activeSessions.filter(s =>
              !claimedKeys.has(s.key) &&
              !stepMap.has(s.agentId) &&
              Math.abs(s.updatedAt - root.updatedAt) < 15 * 60 * 1000
            );
            for (const c of candidates) {
              stepMap.set(c.agentId, [c]);
              claimedKeys.add(c.key);
            }
          }

          const steps: SwarmChainStep[] = uniqueSpawnedIds.length > 0
            ? Array.from(stepMap.entries()).map(([id, sessions]) => ({
                sessions, timestamp: sessions[0].updatedAt, label: id,
              }))
            : Array.from(stepMap.entries()).map(([id, sessions]) => ({
                sessions, timestamp: sessions[0].updatedAt, label: id,
              }));

          builtChains.push({ root, steps });
        } catch {
          builtChains.push({ root, steps: [] });
        }
      }

      // Fetch summaries for all delegate sessions in parallel
      const allDelegateSessions = builtChains.flatMap(c =>
        c.steps.flatMap(s => s.sessions)
      );
      await Promise.all(allDelegateSessions.map(async s => {
        try {
          const p = new URLSearchParams({ agent: s.agentId, routerId: s.routerId, sessionKey: s.key });
          const r = await fetch(`/api/agent-session?${p}`);
          const ev: ActivityEvent[] = await r.json();
          const sum = extractLastActivity(ev);
          if (sum) summaries.set(s.key, sum);
        } catch { /* ignore */ }
      }));

      setSessionSummaries(summaries);

      // Sessions not part of any chain
      const remainingOrphans = activeSessions.filter(s => !claimedKeys.has(s.key));

      // Stabilise display order: active chains first, stable within each group
      const now = Date.now();
      builtChains.sort((a, b) => {
        const aActive = now - a.root.updatedAt < ACTIVE_MS;
        const bActive = now - b.root.updatedAt < ACTIVE_MS;
        // Active group always above inactive group
        if (aActive !== bActive) return aActive ? -1 : 1;
        // Within the same group, preserve seen order (no jumping)
        const ai = stableOrderRef.current.indexOf(a.root.key);
        const bi = stableOrderRef.current.indexOf(b.root.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      // Update stable order so newly seen keys get a locked position next poll
      stableOrderRef.current = builtChains.map(c => c.root.key);

      hasLoadedRef.current = true;
      setTaskMessages(tasks);
      setChains(builtChains);
      setOrphans(remainingOrphans);
      setLoading(false);
    }

    buildChains();
  }, [activeSessions, allSessions]);

  // Poll summaries + task messages every 5s for active sessions
  useEffect(() => {
    const liveRoots = chains.filter(c => Date.now() - c.root.updatedAt < ACTIVE_MS).map(c => c.root);
    const liveDelegates = chains.flatMap(c => c.steps.flatMap(s => s.sessions)).filter(s => Date.now() - s.updatedAt < ACTIVE_MS);
    if (liveRoots.length === 0 && liveDelegates.length === 0) return;
    const poll = async () => {
      const summaryUpdates = new Map<string, string>();
      const taskUpdates = new Map<string, string>();
      await Promise.all([
        ...liveRoots.map(async s => {
          try {
            const p = new URLSearchParams({ agent: s.agentId, routerId: s.routerId, sessionKey: s.key });
            const ev: ActivityEvent[] = await fetch(`/api/agent-session?${p}`).then(r => r.json());
            const sum = extractLastActivity(ev);
            if (sum) summaryUpdates.set(s.key, sum);
            if (sum) taskUpdates.set(s.key, sum);
          } catch { /* ignore */ }
        }),
        ...liveDelegates.map(async s => {
          try {
            const p = new URLSearchParams({ agent: s.agentId, routerId: s.routerId, sessionKey: s.key });
            const ev: ActivityEvent[] = await fetch(`/api/agent-session?${p}`).then(r => r.json());
            const sum = extractLastActivity(ev);
            if (sum) summaryUpdates.set(s.key, sum);
          } catch { /* ignore */ }
        }),
      ]);
      if (summaryUpdates.size > 0) setSessionSummaries(prev => new Map([...prev, ...summaryUpdates]));
      if (taskUpdates.size > 0) setTaskMessages(prev => new Map([...prev, ...taskUpdates]));
    };
    const iv = setInterval(poll, 5_000);
    return () => clearInterval(iv);
  }, [chains]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div
          className="w-4 h-4 rounded-full border-2 animate-spin"
          style={{ borderColor: "#222", borderTopColor: "#e85d27" }}
        />
        <span className="text-xs text-zinc-600">Building swarm traces…</span>
      </div>
    );
  }

  if (chains.length === 0 && orphans.length === 0) {
    return <Empty label="No active sessions to trace" />;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {chains.map(chain => {
        const rootActive = Date.now() - chain.root.updatedAt < ACTIVE_MS;
        const ts = typeStyle(chain.root.type);
        const allDelegates = chain.steps.flatMap(s => s.sessions);
        const taskMsg = taskMessages.get(chain.root.key);
        const activeCount = allDelegates.filter(s => Date.now() - s.updatedAt < ACTIVE_MS).length;
        const doneCount = allDelegates.length - activeCount;
        return (
          <div
            key={chain.root.key}
            className="rounded-lg border overflow-hidden"
            style={{ background: "#0c0c0e", borderColor: "#1e1e28" }}
          >
            {/* Task banner */}
            {taskMsg && (
              <div className="px-4 pt-3 pb-2" style={{ borderBottom: "1px solid #111", background: "#09090d" }}>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-0.5 flex-shrink-0" style={{ color: "#e85d2760" }}>Last Response</span>
                  <p className="text-sm leading-relaxed" style={{ color: "#c0b0a0" }}>
                    {taskMsg.length > 180 ? taskMsg.slice(0, 180) + "…" : taskMsg}
                  </p>
                </div>
              </div>
            )}

            {/* Root agent row */}
            <button
              onClick={() => onOpen(chain.root)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: "1px solid #1a1a22" }}
            >
              <span className="text-base flex-shrink-0">{chain.root.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "#e85d27" }}>
                    {chain.root.agentId}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-px rounded ${ts.bg} ${ts.text}`}>
                    {chain.root.label}
                  </span>
                  {rootActive ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-px rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Done</span>
                  )}
                  <span className="text-xs text-zinc-700">{timeAgo(chain.root.updatedAt)}</span>
                </div>
              </div>
              {allDelegates.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-3 text-right">
                  {activeCount > 0 && (
                    <span className="text-xs text-emerald-500">{activeCount} working</span>
                  )}
                  {doneCount > 0 && (
                    <span className="text-xs text-zinc-600">{doneCount} done</span>
                  )}
                  <span className="text-xs text-zinc-700">↗</span>
                </div>
              )}
            </button>

            {/* Team status bar */}
            {allDelegates.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#080810", borderBottom: "1px solid #111" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#e85d2750" }}>Team</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {allDelegates.map(s => {
                    const sActive = Date.now() - s.updatedAt < ACTIVE_MS;
                    return (
                      <span
                        key={s.key}
                        className="flex items-center gap-1 text-xs px-1.5 py-px rounded"
                        style={{ background: sActive ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)", color: sActive ? "#4ade8099" : "#444" }}
                      >
                        {s.icon} {s.agentId}
                        {sActive && <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delegate grid */}
            {allDelegates.length > 0 && (
              <div className="p-3 grid grid-cols-2 gap-2">
                {allDelegates.map(s => {
                  const sActive = Date.now() - s.updatedAt < ACTIVE_MS;
                  const summary = sessionSummaries.get(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => onOpen(s)}
                      className="group text-left rounded-md p-3 hover:bg-white/[0.04] transition-colors"
                      style={{ background: "#0f0f14", border: "1px solid #1a1a22" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base flex-shrink-0">{s.icon}</span>
                        <span className="text-sm font-semibold text-zinc-200">{s.agentId}</span>
                        {sActive ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-600">✓ Done</span>
                        )}
                        <span className="ml-auto text-[10px] text-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </div>
                      {summary ? (
                        <div className="text-xs leading-relaxed line-clamp-2" style={{ color: "#6a6a8a" }}>
                          {summary}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-800 italic">
                          {sActive ? "Working…" : timeAgo(s.updatedAt)}
                        </div>
                      )}
                      {s.totalTokens > 0 && (
                        <div className="text-[10px] font-mono text-zinc-800 mt-1.5">{fmtTokens(s.totalTokens)} tok</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {allDelegates.length === 0 && (
              <div className="px-4 py-2 text-[10px] text-zinc-800 italic">
                No delegates detected yet
              </div>
            )}
          </div>
        );
      })}

      {/* Orphan sessions not part of any chain */}
      {orphans.length > 0 && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700 px-1 mt-2">
            Other active sessions
          </div>
          {orphans.map(s => (
            <SessionRow key={s.key} s={s} onClick={() => onOpen(s)} />
          ))}
        </>
      )}
    </div>
  );
}
