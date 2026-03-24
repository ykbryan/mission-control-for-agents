import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";
import { agents as registeredAgents } from "@/lib/agents";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AuditCategory = "access" | "cost" | "availability" | "integrity" | "data" | "behavior" | "compliance";

export interface AuditEvent {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  detail: string;
  agentId: string | null;
  routerId: string;
  routerLabel: string;
  detectedAt: number;
  evidence: Record<string, unknown>;
}

export interface RouterHealthSnapshot {
  routerId: string;
  routerLabel: string;
  reachable: boolean;
  uptimeSeconds: number;
  routerVersion: string;
  nodeVersion: string;
  osLabel: string;
  platform: string;
  hostname: string;
  agentCount: number;
  activeSessionCount: number;
  isStaleVersion: boolean;
  hasRecentRestart: boolean;
}

export interface AgentRiskEntry {
  agentId: string;
  agentName: string;
  routerId: string;
  routerLabel: string;
  tier: string;
  configured: boolean;
  lastActiveAt: number;
  activeSessions: number;
  totalTokens: number;
  estimatedCost: number;
  riskScore: number;
  riskFactors: string[];
  privilegedSkills: string[];
  model?: string;
  allSkills: string[];
}

export interface AuditSummary {
  totalEvents: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  routersChecked: number;
  routersFailed: number;
  agentsScanned: number;
  activeSessionCount: number;
  generatedAt: number;
}

export interface AuditEventsResponse {
  summary: AuditSummary;
  events: AuditEvent[];
  routers: RouterHealthSnapshot[];
  agentRisk: AgentRiskEntry[];
}

// ── Router data interfaces ────────────────────────────────────────────────────

interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  lastActiveAt?: number;
  tier?: string;
  nodeHostname?: string;
}

interface RouterCostEntry {
  agentId: string;
  totalTokens: number;
  estimatedCost: number;
  model?: string;
}

interface RouterDailyEntry {
  agentId: string;
  date: string;
  tokens: number;
  estimatedCost: number;
}

interface RouterCostsResponse {
  costs: RouterCostEntry[];
  daily?: RouterDailyEntry[];
  models?: { model: string; totalTokens: number; estimatedCost: number }[];
}

interface RouterSession {
  key: string;
  agentId: string;
  type: string;
  context: string | null;
  updatedAt: number;
  totalTokens: number;
  isActive: boolean;
}

interface RouterAllSessionsResponse {
  sessions: RouterSession[];
}

interface RouterInfoResponse {
  hostname: string;
  platform: string;
  osLabel: string;
  nodeVersion: string;
  routerVersion: string;
  uptimeSeconds: number;
  cpuCount: number;
  totalMemGb: number;
}

interface RouterAgentsResponse {
  agents: RouterAgent[];
}

// ── High-privilege skills ─────────────────────────────────────────────────────

const EXEC_SKILLS = new Set(["exec", "claude-code", "nodes"]);
const WRITE_SKILLS = new Set(["notion", "gog", "message", "github", "vercel-deploy"]);
const EXTERNAL_TRIGGER_TYPES = new Set(["telegram", "subagent"]);
// OpenClaw uses date-based versions: YYYY.M.D  (e.g. "2026.3.13")
// Convert to a comparable integer: YYYYMMDD
function versionToInt(version: string): number {
  if (!version || version === "unknown") return 0;
  const parts = version.replace(/^v/, "").split(".").map(Number);
  // Date format: year.month.day  →  year*10000 + month*100 + day
  if (parts[0] > 1000) return (parts[0] ?? 0) * 10000 + (parts[1] ?? 0) * 100 + (parts[2] ?? 0);
  // Legacy semver fallback: treat as plain numeric tuple
  return (parts[0] ?? 0) * 10000 + (parts[1] ?? 0) * 100 + (parts[2] ?? 0);
}

// Minimum acceptable version — 90 days before today
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
function isVersionStale(version: string): boolean {
  if (!version || version === "unknown") return true;
  const parts = version.replace(/^v/, "").split(".").map(Number);
  // Date-based version: check if older than 90 days
  if (parts[0] > 1000) {
    const vDate = new Date(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1).getTime();
    return Date.now() - vDate > NINETY_DAYS_MS;
  }
  // Legacy semver: flag anything below 1.0.0
  return versionToInt(version) < versionToInt("1.0.0");
}

function compareVersions(v1: string, v2: string): number {
  return versionToInt(v1) - versionToInt(v2);
}

// Check if all routers have the same version; flag if they diverge
function detectVersionDrift(routers: RouterHealthSnapshot[]): AuditEvent[] {
  const versions = routers.map(r => r.routerVersion).filter(v => v && v !== "unknown");
  if (versions.length < 2) return [];
  const unique = new Set(versions);
  if (unique.size <= 1) return [];
  const sorted = [...unique].sort((a, b) => compareVersions(b, a));
  return [{
    id: `compliance-version-drift-${Date.now()}`,
    severity: "medium",
    category: "compliance",
    title: "Router version drift detected",
    detail: `Routers are running different versions: ${[...unique].join(", ")}. Inconsistent versions may indicate missed security patches.`,
    agentId: null,
    routerId: "all",
    routerLabel: "All Gateways",
    detectedAt: Date.now(),
    evidence: { versions: [...unique], latest: sorted[0], oldest: sorted[sorted.length - 1] },
  }];
}

// ── Detectors ─────────────────────────────────────────────────────────────────

function detectCostAnomalies(
  costs: RouterCostEntry[],
  daily: RouterDailyEntry[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();

  // Per-agent: compute average daily cost from history
  const agentDailyMap = new Map<string, number[]>();
  for (const d of daily) {
    const arr = agentDailyMap.get(d.agentId) ?? [];
    arr.push(d.estimatedCost);
    agentDailyMap.set(d.agentId, arr);
  }

  // Latest day per agent
  const latestDate = daily.reduce((max, d) => d.date > max ? d.date : max, "");
  const latestByAgent = new Map<string, number>();
  for (const d of daily.filter(d => d.date === latestDate)) {
    latestByAgent.set(d.agentId, (latestByAgent.get(d.agentId) ?? 0) + d.estimatedCost);
  }

  for (const [agentId, dayCosts] of agentDailyMap.entries()) {
    if (dayCosts.length < 2) continue;
    const avg = dayCosts.slice(0, -1).reduce((s, c) => s + c, 0) / (dayCosts.length - 1);
    const latest = latestByAgent.get(agentId) ?? dayCosts[dayCosts.length - 1];
    if (avg < 0.001) continue;
    const multiplier = latest / avg;
    if (multiplier >= 7) {
      events.push({
        id: `cost-spike-critical-${routerId}-${agentId}`,
        severity: "critical",
        category: "cost",
        title: "Critical cost spike detected",
        detail: `Agent "${agentId}" spent $${latest.toFixed(4)} today — ${multiplier.toFixed(1)}× its daily average of $${avg.toFixed(4)}. Possible runaway process or prompt injection.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { todayCost: latest, avgDailyCost: avg, multiplier: Math.round(multiplier * 10) / 10, date: latestDate },
      });
    } else if (multiplier >= 3) {
      events.push({
        id: `cost-spike-high-${routerId}-${agentId}`,
        severity: "high",
        category: "cost",
        title: "Unusual cost spike",
        detail: `Agent "${agentId}" spent $${latest.toFixed(4)} today — ${multiplier.toFixed(1)}× its daily average. Review session logs.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { todayCost: latest, avgDailyCost: avg, multiplier: Math.round(multiplier * 10) / 10, date: latestDate },
      });
    }
  }

  // Platform-level cost spike: sum last day vs avg of previous days
  const dateMap = new Map<string, number>();
  for (const d of daily) dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.estimatedCost);
  const sortedDates = [...dateMap.keys()].sort();
  if (sortedDates.length >= 3) {
    const lastDay = dateMap.get(sortedDates[sortedDates.length - 1]) ?? 0;
    const prevDays = sortedDates.slice(0, -1).map(d => dateMap.get(d) ?? 0);
    const prevAvg = prevDays.reduce((s, c) => s + c, 0) / prevDays.length;
    if (prevAvg > 0.001 && lastDay / prevAvg > 2) {
      events.push({
        id: `cost-platform-spike-${routerId}`,
        severity: "high",
        category: "cost",
        title: "Platform-wide cost surge",
        detail: `Total spend across all agents spiked to $${lastDay.toFixed(4)} on ${sortedDates[sortedDates.length - 1]} — ${(lastDay / prevAvg).toFixed(1)}× the ${prevDays.length}-day average.`,
        agentId: null,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { lastDayCost: lastDay, prevDayAvg: prevAvg, multiplier: Math.round((lastDay / prevAvg) * 10) / 10 },
      });
    }
  }

  return events;
}

function detectRouterHealth(
  info: RouterInfoResponse | null,
  reachable: boolean,
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();

  if (!reachable) {
    events.push({
      id: `availability-router-down-${routerId}`,
      severity: "critical",
      category: "availability",
      title: "Gateway unreachable",
      detail: `Router "${routerLabel}" is not responding. Agents on this gateway may be running unsupervised.`,
      agentId: null,
      routerId,
      routerLabel,
      detectedAt: now,
      evidence: { routerId, routerLabel },
    });
    return events;
  }

  if (!info) return events;

  if (info.uptimeSeconds < 300) {
    events.push({
      id: `availability-restart-critical-${routerId}`,
      severity: "critical",
      category: "availability",
      title: "Router restarted in last 5 minutes",
      detail: `"${routerLabel}" restarted very recently (uptime: ${Math.round(info.uptimeSeconds)}s). May indicate a crash loop or unauthorized restart.`,
      agentId: null,
      routerId,
      routerLabel,
      detectedAt: now,
      evidence: { uptimeSeconds: info.uptimeSeconds, hostname: info.hostname },
    });
  } else if (info.uptimeSeconds < 3600) {
    events.push({
      id: `availability-restart-high-${routerId}`,
      severity: "high",
      category: "availability",
      title: "Router restarted recently",
      detail: `"${routerLabel}" was restarted within the last hour (uptime: ${Math.round(info.uptimeSeconds / 60)}m). Review system logs for unexpected termination.`,
      agentId: null,
      routerId,
      routerLabel,
      detectedAt: now,
      evidence: { uptimeSeconds: info.uptimeSeconds, hostname: info.hostname },
    });
  }

  if (!info.routerVersion || info.routerVersion === "unknown") {
    events.push({
      id: `compliance-version-unknown-${routerId}`,
      severity: "medium",
      category: "compliance",
      title: "Router version unknown",
      detail: `"${routerLabel}" did not report its version. Run update-router.sh to upgrade to the latest release.`,
      agentId: null,
      routerId,
      routerLabel,
      detectedAt: now,
      evidence: { routerVersion: info.routerVersion, hostname: info.hostname },
    });
  }

  return events;
}

function detectAgentAnomalies(
  liveAgents: RouterAgent[],
  sessions: RouterSession[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();
  const registeredIds = new Set(registeredAgents.map(a => a.id));

  // Unconfigured agents that are active
  for (const agent of liveAgents) {
    if (!agent.configured && agent.lastActiveAt && agent.lastActiveAt > 0) {
      events.push({
        id: `integrity-unconfigured-active-${routerId}-${agent.id}`,
        severity: "high",
        category: "integrity",
        title: "Unconfigured agent is active",
        detail: `Agent "${agent.id}" has active sessions but lacks a SOUL/IDENTITY configuration. It is operating outside governance boundaries.`,
        agentId: agent.id,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { agentId: agent.id, configured: false, lastActiveAt: agent.lastActiveAt },
      });
    }
  }

  // Unregistered agents in sessions
  const liveIds = new Set(liveAgents.map(a => a.id));
  const sessionAgentIds = new Set(sessions.map(s => s.agentId));
  for (const agentId of sessionAgentIds) {
    if (!liveIds.has(agentId) && !registeredIds.has(agentId)) {
      events.push({
        id: `integrity-unregistered-sessions-${routerId}-${agentId}`,
        severity: "medium",
        category: "integrity",
        title: "Unregistered agent has sessions",
        detail: `Agent "${agentId}" appears in session data but is not registered in the agent registry. Verify this is not a rogue or orphan process.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { agentId, inRegistry: false, sessionCount: sessions.filter(s => s.agentId === agentId).length },
      });
    }
  }

  return events;
}

function detectSessionAnomalies(
  sessions: RouterSession[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();

  // Count concurrent active sessions per agent
  const activeSessions = sessions.filter(s => s.isActive);
  const activeByAgent = new Map<string, RouterSession[]>();
  for (const s of activeSessions) {
    const arr = activeByAgent.get(s.agentId) ?? [];
    arr.push(s);
    activeByAgent.set(s.agentId, arr);
  }

  for (const [agentId, agentSessions] of activeByAgent.entries()) {
    if (agentSessions.length >= 5) {
      events.push({
        id: `behavior-session-storm-${routerId}-${agentId}`,
        severity: "high",
        category: "behavior",
        title: "Session storm detected",
        detail: `Agent "${agentId}" has ${agentSessions.length} concurrent active sessions. This may indicate a cron loop, stuck trigger, or denial-of-service condition.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { agentId, activeCount: agentSessions.length, types: [...new Set(agentSessions.map(s => s.type))] },
      });
    }
  }

  // Large individual sessions (data exfiltration surface)
  for (const s of sessions) {
    if (s.totalTokens > 200_000) {
      events.push({
        id: `data-large-session-critical-${s.key}`,
        severity: "high",
        category: "data",
        title: "Very large session detected",
        detail: `Session "${s.key}" for agent "${s.agentId}" consumed ${(s.totalTokens / 1000).toFixed(0)}K tokens. Unusually large sessions may indicate data gathering or context stuffing.`,
        agentId: s.agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { sessionKey: s.key, totalTokens: s.totalTokens, type: s.type },
      });
    } else if (s.totalTokens > 50_000) {
      events.push({
        id: `data-large-session-medium-${s.key}`,
        severity: "medium",
        category: "data",
        title: "Large session flagged for review",
        detail: `Session "${s.key}" for agent "${s.agentId}" used ${(s.totalTokens / 1000).toFixed(0)}K tokens. Review for unexpected data processing.`,
        agentId: s.agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { sessionKey: s.key, totalTokens: s.totalTokens, type: s.type },
      });
    }
  }

  // External-trigger exec agents
  const EXEC_SKILL_AGENT_IDS = new Set(
    registeredAgents.filter(a => a.skills.some(s => EXEC_SKILLS.has(s))).map(a => a.id)
  );
  for (const s of activeSessions) {
    if (EXEC_SKILL_AGENT_IDS.has(s.agentId) && EXTERNAL_TRIGGER_TYPES.has(s.type)) {
      events.push({
        id: `behavior-exec-external-${s.key}`,
        severity: "high",
        category: "behavior",
        title: "Exec-capable agent active via external trigger",
        detail: `Agent "${s.agentId}" has code execution capabilities and is currently active via a ${s.type} trigger. External code execution is a high-risk pattern.`,
        agentId: s.agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { sessionKey: s.key, sessionType: s.type, context: s.context, execSkills: registeredAgents.find(a => a.id === s.agentId)?.skills.filter(sk => EXEC_SKILLS.has(sk)) },
      });
    }
  }

  return events;
}

function detectPrivilegeSurface(
  sessions: RouterSession[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();

  // Agents with both exec and external write skills — highest risk combination
  const dualRiskAgents = registeredAgents.filter(a => {
    const hasExec = a.skills.some(s => EXEC_SKILLS.has(s));
    const hasWrite = a.skills.some(s => WRITE_SKILLS.has(s));
    return hasExec && hasWrite;
  });

  const activeSessions = sessions.filter(s => s.isActive);
  const activeAgentIds = new Set(activeSessions.map(s => s.agentId));

  for (const agent of dualRiskAgents) {
    if (activeAgentIds.has(agent.id)) {
      const execSkills = agent.skills.filter(s => EXEC_SKILLS.has(s));
      const writeSkills = agent.skills.filter(s => WRITE_SKILLS.has(s));
      events.push({
        id: `behavior-dual-risk-active-${routerId}-${agent.id}`,
        severity: "medium",
        category: "behavior",
        title: "High-privilege agent active",
        detail: `Agent "${agent.name}" has both code execution (${execSkills.join(", ")}) and external write (${writeSkills.join(", ")}) capabilities and is currently running.`,
        agentId: agent.id,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { agentId: agent.id, execSkills, writeSkills, sessionCount: activeSessions.filter(s => s.agentId === agent.id).length },
      });
    }
  }

  return events;
}

function detectRunawayTokens(
  costs: RouterCostEntry[],
  daily: RouterDailyEntry[],
  sessions: RouterSession[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();

  // ── 1. Per-agent daily token velocity ─────────────────────────────────────
  // Compare today's token count to the rolling daily average (same logic as
  // cost spike detection, but purely on token volume — catches cheap models
  // burning huge context windows without a matching cost signal).

  const agentDailyTokens = new Map<string, number[]>();
  for (const d of daily) {
    const arr = agentDailyTokens.get(d.agentId) ?? [];
    arr.push(d.tokens);
    agentDailyTokens.set(d.agentId, arr);
  }

  const latestDate = daily.reduce((max, d) => (d.date > max ? d.date : max), "");
  const todayTokensByAgent = new Map<string, number>();
  for (const d of daily.filter(d => d.date === latestDate)) {
    todayTokensByAgent.set(d.agentId, (todayTokensByAgent.get(d.agentId) ?? 0) + d.tokens);
  }

  for (const [agentId, dayTokens] of agentDailyTokens.entries()) {
    if (dayTokens.length < 2) continue;
    const prevAvg = dayTokens.slice(0, -1).reduce((s, t) => s + t, 0) / (dayTokens.length - 1);
    if (prevAvg < 1_000) continue; // skip agents with negligible baseline
    const today = todayTokensByAgent.get(agentId) ?? dayTokens[dayTokens.length - 1];
    const mult = today / prevAvg;

    if (mult >= 10) {
      events.push({
        id: `behavior-runaway-tokens-critical-${routerId}-${agentId}`,
        severity: "critical",
        category: "behavior",
        title: "Runaway token consumption",
        detail: `Agent "${agentId}" consumed ${(today / 1000).toFixed(0)}K tokens today — ${mult.toFixed(1)}× its daily average of ${(prevAvg / 1000).toFixed(0)}K. Possible infinite loop, recursive prompt, or context stuffing attack.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { todayTokens: today, avgDailyTokens: Math.round(prevAvg), multiplier: Math.round(mult * 10) / 10, date: latestDate },
      });
    } else if (mult >= 5) {
      events.push({
        id: `behavior-runaway-tokens-high-${routerId}-${agentId}`,
        severity: "high",
        category: "behavior",
        title: "Token velocity spike",
        detail: `Agent "${agentId}" used ${(today / 1000).toFixed(0)}K tokens today — ${mult.toFixed(1)}× its daily average. Review recent sessions for unexpected loops or oversized prompts.`,
        agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { todayTokens: today, avgDailyTokens: Math.round(prevAvg), multiplier: Math.round(mult * 10) / 10, date: latestDate },
      });
    }
  }

  // ── 2. Absolute lifetime token ceiling ────────────────────────────────────
  // Flag agents that have accumulated an extremely high total — useful for
  // spotting agents that have been silently churning for a long time.

  for (const c of costs) {
    if (c.totalTokens > 5_000_000) {
      events.push({
        id: `behavior-runaway-tokens-lifetime-${routerId}-${c.agentId}`,
        severity: "medium",
        category: "behavior",
        title: "Lifetime token ceiling exceeded",
        detail: `Agent "${c.agentId}" has consumed ${(c.totalTokens / 1_000_000).toFixed(2)}M tokens in total. Verify this volume is expected for its role.`,
        agentId: c.agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { totalTokens: c.totalTokens, estimatedCost: c.estimatedCost, model: c.model },
      });
    }
  }

  // ── 3. Active sessions with runaway token counts ───────────────────────────
  // A currently-running session with > 300K tokens is a strong runaway signal
  // (distinct from the "large session" data check which targets completed ones).

  for (const s of sessions.filter(s => s.isActive)) {
    if (s.totalTokens > 300_000) {
      events.push({
        id: `behavior-runaway-tokens-active-session-${s.key}`,
        severity: "critical",
        category: "behavior",
        title: "Active runaway session",
        detail: `Agent "${s.agentId}" has an active session with ${(s.totalTokens / 1000).toFixed(0)}K tokens and is still running. This strongly suggests a loop or out-of-control process.`,
        agentId: s.agentId,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { sessionKey: s.key, totalTokens: s.totalTokens, sessionType: s.type },
      });
    }
  }

  return events;
}

function detectDormantHighPrivilegeAgents(
  liveAgents: RouterAgent[],
  routerId: string,
  routerLabel: string
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  for (const agent of liveAgents) {
    const registered = registeredAgents.find(a => a.id === agent.id);
    if (!registered) continue;
    const hasHighPrivilege = registered.skills.some(s => EXEC_SKILLS.has(s));
    if (!hasHighPrivilege) continue;
    const lastActive = agent.lastActiveAt ?? 0;
    if (lastActive > 0 && lastActive < thirtyDaysAgo) {
      events.push({
        id: `compliance-dormant-exec-${routerId}-${agent.id}`,
        severity: "low",
        category: "compliance",
        title: "Dormant high-privilege agent",
        detail: `Agent "${agent.id}" has code execution capabilities but has not been active for over 30 days. Consider decommissioning or restricting access.`,
        agentId: agent.id,
        routerId,
        routerLabel,
        detectedAt: now,
        evidence: { agentId: agent.id, lastActiveAt: lastActive, daysSinceActive: Math.round((now - lastActive) / (24 * 60 * 60 * 1000)), execSkills: registered.skills.filter(s => EXEC_SKILLS.has(s)) },
      });
    }
  }

  return events;
}

// ── Risk Score ────────────────────────────────────────────────────────────────

function computeRiskScore(
  agentId: string,
  tier: string,
  configured: boolean,
  activeSessions: number,
  totalTokens: number,
  estimatedCost: number,
  sessions: RouterSession[],
  events: AuditEvent[]
): { score: number; factors: string[]; privilegedSkills: string[] } {
  let score = 0;
  const factors: string[] = [];
  const registered = registeredAgents.find(a => a.id === agentId);

  if (!configured) { score += 30; factors.push("unconfigured"); }

  const execSkills = registered?.skills.filter(s => EXEC_SKILLS.has(s)) ?? [];
  const writeSkills = registered?.skills.filter(s => WRITE_SKILLS.has(s)) ?? [];
  const privilegedSkills = [...execSkills, ...writeSkills];

  if (execSkills.length > 0) { score += 15; factors.push(`exec: ${execSkills.join(", ")}`); }
  if (writeSkills.length > 0) { score += 10; factors.push(`write access: ${writeSkills.join(", ")}`); }

  const externalSessions = sessions.filter(s => s.agentId === agentId && s.isActive && EXTERNAL_TRIGGER_TYPES.has(s.type));
  if (externalSessions.length > 0) { score += 20; factors.push("external trigger active"); }

  const agentEvents = events.filter(e => e.agentId === agentId);
  const hasCostSpike = agentEvents.some(e => e.category === "cost");
  if (hasCostSpike) { score += 15; factors.push("cost spike"); }

  const hasRunawayTokens = agentEvents.some(e => e.id.startsWith("behavior-runaway-tokens"));
  if (hasRunawayTokens) { score += 20; factors.push("runaway tokens"); }

  const hasLargeSession = agentEvents.some(e => e.category === "data");
  if (hasLargeSession) { score += 10; factors.push("large session"); }

  if (activeSessions >= 5) { score += 15; factors.push("session storm"); }
  else if (activeSessions >= 3) { score += 5; factors.push("concurrent sessions"); }

  return { score: Math.min(score, 100), factors, privilegedSkills };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all data in parallel
  const [agentsResults, costsResults, sessionsResults, infoResults] = await Promise.all([
    Promise.allSettled(routers.map(r => routerGet<RouterAgentsResponse>(r.url, r.token, "/agents"))),
    Promise.allSettled(routers.map(r => routerGet<RouterCostsResponse>(r.url, r.token, "/costs"))),
    Promise.allSettled(routers.map(r => routerGet<RouterAllSessionsResponse>(r.url, r.token, "/all-sessions"))),
    Promise.allSettled(routers.map(r => routerGet<RouterInfoResponse>(r.url, r.token, "/info"))),
  ]);

  const allEvents: AuditEvent[] = [];
  const routerSnapshots: RouterHealthSnapshot[] = [];
  const agentRiskEntries: AgentRiskEntry[] = [];

  let totalAgentsScanned = 0;
  let totalActiveSessionCount = 0;
  let routersFailed = 0;

  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const agentsResult = agentsResults[i];
    const costsResult = costsResults[i];
    const sessionsResult = sessionsResults[i];
    const infoResult = infoResults[i];

    const reachable = agentsResult.status === "fulfilled" || sessionsResult.status === "fulfilled";
    if (!reachable) routersFailed++;

    const liveAgents = agentsResult.status === "fulfilled" ? (agentsResult.value.agents ?? []) : [];
    const costs = costsResult.status === "fulfilled" ? (costsResult.value.costs ?? []) : [];
    const daily = costsResult.status === "fulfilled" ? (costsResult.value.daily ?? []) : [];
    const sessions = sessionsResult.status === "fulfilled" ? (sessionsResult.value.sessions ?? []) : [];
    const info = infoResult.status === "fulfilled" ? infoResult.value : null;

    totalAgentsScanned += liveAgents.length;
    const activeSessions = sessions.filter(s => s.isActive);
    totalActiveSessionCount += activeSessions.length;

    // Build router health snapshot
    const snapshot: RouterHealthSnapshot = {
      routerId: r.id,
      routerLabel: r.label,
      reachable,
      uptimeSeconds: info?.uptimeSeconds ?? 0,
      routerVersion: info?.routerVersion ?? "unknown",
      nodeVersion: info?.nodeVersion ?? "unknown",
      osLabel: info?.osLabel ?? "unknown",
      platform: info?.platform ?? "unknown",
      hostname: info?.hostname ?? r.label,
      agentCount: liveAgents.length,
      activeSessionCount: activeSessions.length,
      isStaleVersion: isVersionStale(info?.routerVersion ?? ""),
      hasRecentRestart: (info?.uptimeSeconds ?? 0) < 3600,
    };
    routerSnapshots.push(snapshot);

    // Run detectors
    allEvents.push(
      ...detectCostAnomalies(costs, daily, r.id, r.label),
      ...detectRunawayTokens(costs, daily, sessions, r.id, r.label),
      ...detectRouterHealth(info, reachable, r.id, r.label),
      ...detectAgentAnomalies(liveAgents, sessions, r.id, r.label),
      ...detectSessionAnomalies(sessions, r.id, r.label),
      ...detectPrivilegeSurface(sessions, r.id, r.label),
      ...detectDormantHighPrivilegeAgents(liveAgents, r.id, r.label),
    );

    // Build per-agent risk entries
    const costByAgent = new Map(costs.map(c => [c.agentId, c]));
    const sessionsByAgent = new Map<string, RouterSession[]>();
    for (const s of sessions) {
      const arr = sessionsByAgent.get(s.agentId) ?? [];
      arr.push(s);
      sessionsByAgent.set(s.agentId, arr);
    }

    const allAgentIds = new Set([
      ...liveAgents.map(a => a.id),
      ...costs.map(c => c.agentId),
    ]);

    for (const agentId of allAgentIds) {
      const liveAgent = liveAgents.find(a => a.id === agentId);
      const costEntry = costByAgent.get(agentId);
      const agentSessions = sessionsByAgent.get(agentId) ?? [];
      const activeSessionCount = agentSessions.filter(s => s.isActive).length;
      const registered = registeredAgents.find(a => a.id === agentId);

      const { score, factors, privilegedSkills } = computeRiskScore(
        agentId,
        liveAgent?.tier ?? "unknown",
        liveAgent?.configured ?? false,
        activeSessionCount,
        costEntry?.totalTokens ?? 0,
        costEntry?.estimatedCost ?? 0,
        sessions,
        allEvents,
      );

      agentRiskEntries.push({
        agentId,
        agentName: registered?.name ?? agentId,
        routerId: r.id,
        routerLabel: r.label,
        tier: liveAgent?.tier ?? "unknown",
        configured: liveAgent?.configured ?? false,
        lastActiveAt: liveAgent?.lastActiveAt ?? 0,
        activeSessions: activeSessionCount,
        totalTokens: costEntry?.totalTokens ?? 0,
        estimatedCost: costEntry?.estimatedCost ?? 0,
        riskScore: score,
        riskFactors: factors,
        privilegedSkills,
        model: costEntry?.model,
        allSkills: registered?.skills ?? [],
      });
    }
  }

  // Cross-router detectors
  allEvents.push(...detectVersionDrift(routerSnapshots));

  // Sort events: critical → high → medium → low → info, then by detectedAt desc
  const severityOrder: Record<AuditSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allEvents.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    return sd !== 0 ? sd : b.detectedAt - a.detectedAt;
  });

  // Sort agent risk by score desc
  agentRiskEntries.sort((a, b) => b.riskScore - a.riskScore);

  const summary: AuditSummary = {
    totalEvents: allEvents.length,
    critical: allEvents.filter(e => e.severity === "critical").length,
    high: allEvents.filter(e => e.severity === "high").length,
    medium: allEvents.filter(e => e.severity === "medium").length,
    low: allEvents.filter(e => e.severity === "low").length,
    info: allEvents.filter(e => e.severity === "info").length,
    routersChecked: routers.length,
    routersFailed,
    agentsScanned: totalAgentsScanned,
    activeSessionCount: totalActiveSessionCount,
    generatedAt: Date.now(),
  };

  return NextResponse.json({ summary, events: allEvents, routers: routerSnapshots, agentRisk: agentRiskEntries } satisfies AuditEventsResponse);
}
