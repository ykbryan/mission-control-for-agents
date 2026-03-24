import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters, resolveRouter } from "@/lib/router-config";
import type { ActivityEvent } from "@/lib/parse-session";

// ── types ─────────────────────────────────────────────────────────────────────

// validity:
//   active       – running on schedule (last run within 1.5× interval)
//   overdue      – missed ≤2 expected runs (might just be delayed)
//   stale        – missed 3–10× expected runs (likely paused/stopped)
//   paused       – missed >10× expected runs (almost certainly removed from scheduler)
//   unconfirmed  – <3 runs, interval estimate is unreliable
export type JobValidity = "active" | "overdue" | "stale" | "paused" | "unconfirmed";

export interface ScheduledJob {
  id: string;                 // agentId::timeBucket
  agentId: string;
  routerId: string;
  routerLabel: string;
  name: string;               // from first-event prompt or HEARTBEAT
  description: string;        // full prompt text
  scheduleStr: string;        // human-readable: "Every 1h", "Daily 10:00 UTC"
  intervalMs: number | null;  // inferred interval
  nextRunAt: number | null;   // projected next run (ms)
  lastRunAt: number;
  runCount: number;
  avgTokens: number;
  totalTokens: number;
  isActive: boolean;
  validity: JobValidity;
  source: "heartbeat" | "inferred";
  sessionKeys: string[];      // all session keys in this job
}

interface RawSession {
  key: string;
  agentId: string;
  type: string;
  context: string | null;
  updatedAt: number;
  totalTokens: number;
  isActive: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

// Snap a raw interval to sensible schedule buckets
const KNOWN_INTERVALS_MS = [
  5 * 60_000,          // 5m
  10 * 60_000,         // 10m
  15 * 60_000,         // 15m
  30 * 60_000,         // 30m
  60 * 60_000,         // 1h
  2 * 3600_000,        // 2h
  3 * 3600_000,        // 3h
  4 * 3600_000,        // 4h
  6 * 3600_000,        // 6h
  8 * 3600_000,        // 8h
  12 * 3600_000,       // 12h
  24 * 3600_000,       // 24h
  48 * 3600_000,       // 48h
  7 * 86400_000,       // 7d
];

function snapInterval(ms: number): number {
  let best = KNOWN_INTERVALS_MS[0];
  let bestDiff = Math.abs(ms - best);
  for (const iv of KNOWN_INTERVALS_MS) {
    const d = Math.abs(ms - iv);
    if (d < bestDiff) { best = iv; bestDiff = d; }
  }
  return best;
}

function fmtInterval(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `Every ${m}m`;
  const h = Math.round(ms / 3600_000);
  if (h < 24) return `Every ${h}h`;
  const d = Math.round(ms / 86400_000);
  if (d === 1) return "Daily";
  if (d === 7) return "Weekly";
  return `Every ${d}d`;
}

function truncateName(text: string, max = 60): string {
  const clean = text.replace(/^💬\s*/, "").trim();
  return clean.length <= max ? clean : clean.slice(0, max) + "…";
}

// Parse HEARTBEAT.md for job entries: "- **Name (Schedule):** Description"
interface HeartbeatJob { name: string; schedule: string; description: string }
function parseHeartbeat(content: string): HeartbeatJob[] {
  const jobs: HeartbeatJob[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.trim().startsWith("#") || !line.trim()) continue;
    // Match: - **Name (Schedule):** Description
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*[:\s]/);
    if (!m) continue;
    const title = m[1];
    // Extract schedule from parentheses in title: "Name (Every 1h)"
    const schedM = title.match(/\(([^)]+)\)/);
    const schedule = schedM ? schedM[1] : "";
    const name = title.replace(/\s*\([^)]*\)/, "").trim();
    const description = line.replace(/^\s*[-*]\s+\*\*.+?\*\*[:\s]*/, "").trim();
    if (name) jobs.push({ name, schedule, description });
  }
  return jobs;
}

// Compute validity based on run count, interval, and overdue amount
function computeValidity(
  runCount: number,
  intervalMs: number | null,
  nextRunAt: number | null,
  now: number
): JobValidity {
  if (runCount < 3) return "unconfirmed";
  if (!intervalMs || !nextRunAt) return "unconfirmed";
  const overdueMs = now - nextRunAt;
  if (overdueMs <= 0) return "active";           // not yet due
  const missedRuns = overdueMs / intervalMs;
  if (missedRuns <= 1.5) return "active";        // within grace period
  if (missedRuns <= 2)   return "overdue";       // missed 1-2 runs
  if (missedRuns <= 10)  return "stale";         // missed 3-10 runs
  return "paused";                               // missed >10 runs → removed
}

// Convert a heartbeat schedule string to ms (approximate)
function heartbeatScheduleToMs(s: string): number | null {
  const lower = s.toLowerCase();
  const everyM = lower.match(/every\s+(\d+)\s*min/);
  if (everyM) return parseInt(everyM[1]) * 60_000;
  const everyH = lower.match(/every\s+(\d+)\s*h/);
  if (everyH) return parseInt(everyH[1]) * 3600_000;
  if (/every\s+hour/i.test(s)) return 3600_000;
  if (/daily|every\s+day/i.test(s)) return 86400_000;
  if (/weekly|every\s+week/i.test(s)) return 7 * 86400_000;
  if (/morning|evening|night/i.test(s)) return 86400_000;
  return null;
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();

  // 1. Fetch all sessions AND native cron list from all routers ───────────────
  interface RouterAllSessions { sessions: RawSession[] }
  interface NativeCronJob {
    id: string; name?: string; agentId?: string; scheduleExpression?: string;
    intervalMs?: number; nextRunAt?: number; lastRunAt?: number; enabled?: boolean;
    description?: string; [k: string]: unknown;
  }
  interface RouterNativeCrons { jobs: NativeCronJob[] }

  const [sessionResults, nativeCronResults] = await Promise.all([
    Promise.allSettled(routers.map(r => routerGet<RouterAllSessions>(r.url, r.token, "/all-sessions"))),
    Promise.allSettled(routers.map(r => routerGet<RouterNativeCrons>(r.url, r.token, "/crons-native"))),
  ]);

  // Collect cron sessions per (routerId)
  interface SessionWithRouter extends RawSession { routerId: string; routerLabel: string }
  const allCrons: SessionWithRouter[] = [];
  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const result = sessionResults[i];
    if (result.status !== "fulfilled") continue;
    for (const s of result.value.sessions ?? []) {
      if (s.type === "cron") allCrons.push({ ...s, routerId: r.id, routerLabel: r.label });
    }
  }

  // ── Parse OpenClaw cron jobs.json format ─────────────────────────────────
  // Real format (from ~/.openclaw/cron/jobs.json):
  //   { id, agentId, name, enabled, schedule: { kind, tz, expr }, payload: { message },
  //     state: { nextRunAtMs, lastRunAtMs, lastRunStatus, consecutiveErrors } }
  interface OpenClawSchedule { kind: string; tz?: string; expr?: string; intervalMs?: number }
  interface OpenClawState { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string; consecutiveErrors?: number }
  interface OpenClawPayload { message?: string }
  interface OpenClawCronJob {
    id: string; agentId?: string; name?: string; enabled?: boolean;
    schedule?: OpenClawSchedule; payload?: OpenClawPayload; state?: OpenClawState;
    [k: string]: unknown;
  }

  function cronExprToStr(expr: string, tz?: string): string {
    // Convert common cron expressions to human-readable strings
    const tzLabel = tz && tz !== "UTC" ? ` ${tz.split("/").pop()}` : " UTC";
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return expr;
    const [min, hour, dom, , dow] = parts;
    if (expr === "* * * * *") return "Every minute";
    if (min.startsWith("*/")) return `Every ${min.slice(2)}m`;
    if (expr === `0 * * * *`) return "Hourly";
    if (dom === "*" && dow === "*") return `Daily ${hour.padStart(2,"0")}:${min.padStart(2,"0")}${tzLabel}`;
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    if (dow !== "*" && dom === "*") {
      const day = days[parseInt(dow)] ?? `Day${dow}`;
      return `Weekly ${day} ${hour.padStart(2,"0")}:${min.padStart(2,"0")}${tzLabel}`;
    }
    return expr;
  }

  function intervalMsFromExpr(expr: string): number | null {
    const parts = expr.trim().split(/\s+/);
    if (parts[0].startsWith("*/")) return parseInt(parts[0].slice(2)) * 60_000;
    if (expr === "0 * * * *") return 60 * 60_000;
    if (expr === "* * * * *") return 60_000;
    // Daily
    if (parts[1] !== "*" && parts[2] === "*" && parts[4] === "*") return 24 * 60 * 60_000;
    // Weekly
    if (parts[4] !== "*") return 7 * 24 * 60 * 60_000;
    return null;
  }

  const nativeOnlyJobs: ScheduledJob[] = [];

  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const result = nativeCronResults[i];
    if (result.status !== "fulfilled") continue;
    const rawJobs = (result.value.jobs ?? []) as OpenClawCronJob[];

    for (const nj of rawJobs) {
      if (nj.enabled === false) continue; // skip explicitly disabled jobs

      const agentId = nj.agentId ?? "main";
      const syntheticId = `${agentId}::native::${nj.id}`;

      const expr = nj.schedule?.expr ?? "";
      const tz   = nj.schedule?.tz;
      const scheduleStr = expr ? cronExprToStr(expr, tz) : (nj.schedule?.kind ?? "Scheduled");
      const intervalMs  = expr ? intervalMsFromExpr(expr) : (nj.schedule?.intervalMs ?? null);

      const lastRunAt  = nj.state?.lastRunAtMs  ?? 0;
      const nextRunAt  = nj.state?.nextRunAtMs  ?? null;
      const errCount   = nj.state?.consecutiveErrors ?? 0;

      let validity: JobValidity = "unconfirmed";
      if (lastRunAt > 0 && intervalMs) {
        const missedRuns = Math.floor((now - lastRunAt) / intervalMs);
        if (missedRuns <= 1) validity = errCount > 3 ? "overdue" : "active";
        else if (missedRuns <= 2) validity = "overdue";
        else if (missedRuns <= 10) validity = "stale";
        else validity = "paused";
      } else if (nextRunAt && nextRunAt > now) {
        validity = "active"; // scheduled but hasn't run yet
      }

      nativeOnlyJobs.push({
        id: syntheticId,
        agentId,
        routerId: r.id,
        routerLabel: r.label,
        name: nj.name ?? nj.id,
        description: nj.payload?.message ?? "",
        scheduleStr,
        intervalMs,
        nextRunAt: nextRunAt ?? null,
        lastRunAt,
        runCount: 0,
        avgTokens: 0,
        totalTokens: 0,
        isActive: validity === "active",
        validity,
        source: "heartbeat",
        sessionKeys: [],
      });
    }
  }

  // 2. Fetch HEARTBEAT.md for unique agents that have cron sessions ──────────
  //    Also include agents that appear only in native cron jobs (no sessions yet)
  const sessionAgentPairs = allCrons.map(s => `${s.agentId}::${s.routerId}`);
  const nativeAgentPairs  = nativeOnlyJobs.map(n => `${n.agentId}::${n.routerId}`);
  const agentRouterPairs = [...new Map(
    [...sessionAgentPairs, ...nativeAgentPairs].map(key => {
      const [agentId, routerId] = key.split("::");
      return [key, { agentId, routerId }];
    })
  ).values()];

  const heartbeatMap = new Map<string, HeartbeatJob[]>(); // agentId::routerId → jobs
  await Promise.allSettled(
    agentRouterPairs.map(async ({ agentId, routerId }) => {
      const r = routers.find(x => x.id === routerId);
      if (!r) return;
      try {
        const data = await routerGet<{ content: string }>(r.url, r.token, "/file", { agentId, name: "HEARTBEAT.md" });
        const jobs = parseHeartbeat(data.content ?? "");
        heartbeatMap.set(`${agentId}::${routerId}`, jobs);
      } catch { /* file may not exist */ }
    })
  );

  // 3. Fetch first-event prompt for sample sessions (1 per unique job) ───────
  //    We cluster first by agentId+routerId and group sessions into time-buckets
  //    (sessions within 10 min of each other at the same time-of-day = same job)

  // Global job counter for stable unique IDs
  let jobSeq = 0;

  // Group cron sessions by agent+router, sorted newest-first
  const byAgent = new Map<string, SessionWithRouter[]>();
  for (const s of allCrons) {
    const k = `${s.agentId}::${s.routerId}`;
    const arr = byAgent.get(k) ?? [];
    arr.push(s);
    byAgent.set(k, arr);
  }

  // For each agent, cluster sessions into distinct jobs by sampling first-event prompt
  const jobs: ScheduledJob[] = [];

  for (const [agentKey, sessions] of byAgent.entries()) {
    const [agentId, routerId] = agentKey.split("::");
    const r = routers.find(x => x.id === routerId);
    if (!r) continue;

    // Sort sessions oldest→newest for interval analysis
    const sorted = [...sessions].sort((a, b) => a.updatedAt - b.updatedAt);
    const hbJobs = heartbeatMap.get(agentKey) ?? [];

    // Cluster sessions by fetching prompt from a sample of unique sessions
    // Group sessions by hour-of-day bucket (2h buckets) to identify distinct jobs
    // But the REAL identifier is the prompt text — fetch for up to 8 most recent unique
    const sampleSessions = sessions.slice(0, 8); // newest first
    const promptMap = new Map<string, string>(); // sessionKey → prompt

    await Promise.allSettled(
      sampleSessions.map(async (s) => {
        try {
          const data = await routerGet<{ key: string; events: ActivityEvent[] }>(
            r.url, r.token, "/session", { agentId, sessionKey: s.key }
          );
          const firstChat = (data.events ?? []).find(e => e.type === "chat" || e.message?.startsWith("💬"));
          if (firstChat) promptMap.set(s.key, firstChat.message ?? "");
        } catch { /* ignore */ }
      })
    );

    // Cluster all sessions by prompt prefix (first 80 chars).
    // For sessions whose prompt couldn't be fetched, cluster by time-of-day
    // (minute-of-day rounded to 30-min buckets) so same-time recurring jobs group together.
    const jobClusters = new Map<string, SessionWithRouter[]>(); // cluster-key → sessions

    // Build a time-of-day bucket key: "HH:mm" rounded to 30min
    function timeBucket(ms: number): string {
      const d = new Date(ms);
      const h = d.getUTCHours();
      const m = d.getUTCMinutes() < 30 ? 0 : 30;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    for (const s of sorted) {
      const prompt = promptMap.get(s.key) ?? "";
      // Only use prompt if it has real content (not empty after trimming)
      const cleanedPrompt = prompt.replace(/^💬\s*/, "").trim();
      const key = cleanedPrompt.length > 5
        ? cleanedPrompt.slice(0, 80)
        : `__time__${timeBucket(s.updatedAt)}`; // group by time-of-day
      const arr = jobClusters.get(key) ?? [];
      arr.push(s);
      jobClusters.set(key, arr);
    }

    // Build a ScheduledJob for each cluster
    for (const [promptPrefix, clusterSessions] of jobClusters.entries()) {
      const clusterSorted = [...clusterSessions].sort((a, b) => a.updatedAt - b.updatedAt);
      const lastSession = clusterSorted[clusterSorted.length - 1];
      const totalTokens = clusterSessions.reduce((s, c) => s + c.totalTokens, 0);
      const avgTokens = clusterSessions.length ? Math.round(totalTokens / clusterSessions.length) : 0;

      // Infer interval from consecutive timestamps
      let inferredInterval: number | null = null;
      if (clusterSorted.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < clusterSorted.length; i++) {
          intervals.push(clusterSorted[i].updatedAt - clusterSorted[i - 1].updatedAt);
        }
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        if (medianInterval > 60_000) { // ignore sub-1-min noise
          inferredInterval = snapInterval(medianInterval);
        }
      }

      // Try to find matching HEARTBEAT job
      const cleanPrompt = promptPrefix.replace(/^💬\s*/, "").trim().toLowerCase();
      let matchedHb: HeartbeatJob | null = null;
      let hbInterval: number | null = null;
      for (const hb of hbJobs) {
        const hbLower = (hb.name + " " + hb.description).toLowerCase();
        const promptWords = cleanPrompt.split(/\s+/).slice(0, 5);
        const matchScore = promptWords.filter(w => w.length > 3 && hbLower.includes(w)).length;
        if (matchScore >= 2) {
          matchedHb = hb;
          hbInterval = heartbeatScheduleToMs(hb.schedule);
          break;
        }
      }

      const interval = hbInterval ?? inferredInterval;
      const nextRunAt = interval ? lastSession.updatedAt + interval : null;

      const isTimeCluster = promptPrefix.startsWith("__time__");
      const timeLabel = isTimeCluster ? promptPrefix.replace("__time__", "") : null;

      let name: string;
      if (matchedHb) {
        name = matchedHb.name;
      } else if (isTimeCluster) {
        // Use schedule + time-of-day for unnamed jobs
        const schedLabel = interval ? fmtInterval(interval) : "Recurring";
        name = `${schedLabel} job @ ${timeLabel} UTC`;
      } else {
        name = truncateName(promptPrefix, 55);
      }

      const scheduleStr = matchedHb?.schedule
        ? matchedHb.schedule
        : interval ? fmtInterval(interval) : "Ad-hoc";

      const description = isTimeCluster
        ? `Recurring job running around ${timeLabel} UTC. Prompt not available for older sessions.`
        : promptPrefix.replace(/^💬\s*/, "").trim();

      const validity = computeValidity(clusterSessions.length, interval, nextRunAt, now);

      jobs.push({
        id: `${agentId}::job::${jobSeq++}`,
        agentId,
        routerId,
        routerLabel: r.label,
        name,
        description,
        scheduleStr,
        intervalMs: interval,
        nextRunAt,
        lastRunAt: lastSession.updatedAt,
        runCount: clusterSessions.length,
        avgTokens,
        totalTokens,
        isActive: lastSession.isActive || (now - lastSession.updatedAt < ACTIVE_WINDOW_MS),
        validity,
        source: matchedHb ? "heartbeat" : "inferred",
        sessionKeys: clusterSessions.map(s => s.key),
      });
    }

    // Also add HEARTBEAT jobs with no matching session (never-run jobs)
    for (const hb of hbJobs) {
      const alreadyMatched = jobs.some(j => j.agentId === agentId && j.routerId === routerId && j.name === hb.name);
      if (!alreadyMatched) {
        const hbInterval = heartbeatScheduleToMs(hb.schedule);
        jobs.push({
          id: `${agentId}::hb::${jobSeq++}`,
          agentId,
          routerId,
          routerLabel: r.label,
          name: hb.name,
          description: hb.description,
          scheduleStr: hb.schedule || "Scheduled",
          intervalMs: hbInterval,
          nextRunAt: null,
          lastRunAt: 0,
          runCount: 0,
          avgTokens: 0,
          totalTokens: 0,
          isActive: false,
          validity: "unconfirmed",
          source: "heartbeat",
          sessionKeys: [],
        });
      }
    }
  }

  // Also add HEARTBEAT jobs for agents with NO cron sessions yet
  for (const r of routers) {
    const agentsWithCrons = new Set(allCrons.filter(s => s.routerId === r.id).map(s => s.agentId));
    // We'd need to fetch all agents to check — skip for now to avoid N+1 on all agents
    // This is handled by the HEARTBEAT fetch above
  }

  // Merge native cron jobs (only those not already represented by a session-inferred job).
  // If the native job has no description, try to match it against HEARTBEAT.md entries by name.
  const sessionJobAgentKeys = new Set(jobs.map(j => `${j.agentId}::${j.routerId}::${j.name}`));
  for (const nj of nativeOnlyJobs) {
    const key = `${nj.agentId}::${nj.routerId}::${nj.name}`;
    if (sessionJobAgentKeys.has(key)) continue;

    let enriched = nj;
    if (!nj.description) {
      const hbJobs = heartbeatMap.get(`${nj.agentId}::${nj.routerId}`) ?? [];
      const nameLower = nj.name.toLowerCase();
      const matched = hbJobs.find(hb => {
        const hbLower = (hb.name + " " + hb.description).toLowerCase();
        const nameWords = nameLower.split(/[\s_\-]+/).filter(w => w.length > 3);
        return nameWords.some(w => hbLower.includes(w)) || hbLower.includes(nameLower);
      });
      if (matched?.description) enriched = { ...nj, description: matched.description };
    }
    jobs.push(enriched);
  }

  // Sort: active first, then by nextRunAt ascending (soonest next), then last run desc
  jobs.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.nextRunAt && b.nextRunAt) return a.nextRunAt - b.nextRunAt;
    if (a.nextRunAt) return -1;
    if (b.nextRunAt) return 1;
    return b.lastRunAt - a.lastRunAt;
  });

  return NextResponse.json({ jobs });
}
