import { describe, it, expect } from "vitest";

/**
 * Unit tests for incident-detection logic extracted from app/api/incidents/route.ts.
 *
 * We test the pure detection functions in isolation by reproducing the
 * pattern-matching logic — avoiding Next.js Request/Response globals.
 */

// ---------------------------------------------------------------------------
// Reproduce incident-detection helpers (mirrors app/api/incidents/route.ts)
// ---------------------------------------------------------------------------

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  model?: string;
}

type IncidentType = "fallback" | "api_error" | "tool_error";
type Severity = "critical" | "warning" | "info";

interface Incident {
  type: IncidentType;
  severity: Severity;
  startedAt: string;
  resolvedAt: string | null;
  agentId: string;
  routerId: string;
  fromModel?: string;
  toModel?: string;
  errorMessage?: string;
}

const FALLBACK_RE = /🔄\s*Model:\s*(.+?)\s*→\s*(.+)/;
const API_ERROR_PATTERNS = [
  /\b503\b/,
  /\b429\b/,
  /overloaded/i,
  /rate.?limit/i,
  /quota.?exceeded/i,
  /api.?error/i,
  /service.?unavailable/i,
];

function detectIncidents(
  events: ActivityEvent[],
  agentId: string,
  routerId: string
): Incident[] {
  const incidents: Incident[] = [];

  for (const evt of events) {
    // Fallback detection
    const fm = evt.message.match(FALLBACK_RE);
    if (fm) {
      incidents.push({
        type: "fallback",
        severity: "warning",
        startedAt: evt.timestamp,
        resolvedAt: null,
        agentId,
        routerId,
        fromModel: fm[1].trim(),
        toModel: fm[2].trim(),
      });
      continue;
    }

    // API error detection
    if (evt.type === "error") {
      const isApiError = API_ERROR_PATTERNS.some((p) => p.test(evt.message));
      if (isApiError) {
        incidents.push({
          type: "api_error",
          severity: "critical",
          startedAt: evt.timestamp,
          resolvedAt: null,
          agentId,
          routerId,
          errorMessage: evt.message,
        });
        continue;
      }
      // Generic tool error
      incidents.push({
        type: "tool_error",
        severity: "warning",
        startedAt: evt.timestamp,
        resolvedAt: null,
        agentId,
        routerId,
        errorMessage: evt.message,
      });
    }
  }

  return incidents;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const TS = "2026-03-30T10:00:00.000Z";

describe("detectIncidents — model fallbacks", () => {
  it("detects a model fallback from a 🔄 event", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🔄 Model: claude-sonnet-4 → claude-haiku-3.5", timestamp: TS },
    ];
    const incidents = detectIncidents(events, "jasmine", "router-1");
    expect(incidents).toHaveLength(1);
    expect(incidents[0].type).toBe("fallback");
    expect(incidents[0].fromModel).toBe("claude-sonnet-4");
    expect(incidents[0].toModel).toBe("claude-haiku-3.5");
    expect(incidents[0].severity).toBe("warning");
  });

  it("captures fromModel and toModel correctly", () => {
    const events: ActivityEvent[] = [
      {
        id: "2",
        type: "info",
        message: "🔄 Model: gpt-4o → gpt-3.5-turbo",
        timestamp: TS,
      },
    ];
    const [incident] = detectIncidents(events, "angel", "router-2");
    expect(incident.fromModel).toBe("gpt-4o");
    expect(incident.toModel).toBe("gpt-3.5-turbo");
  });

  it("does not detect fallback for initial model assignment (🧠)", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🧠 Model: claude-sonnet-4", timestamp: TS },
    ];
    expect(detectIncidents(events, "a", "r")).toHaveLength(0);
  });

  it("detects multiple fallbacks in one session", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🔄 Model: claude-sonnet-4 → claude-haiku-3.5", timestamp: TS },
      { id: "2", type: "info", message: "🔄 Model: claude-haiku-3.5 → claude-sonnet-4", timestamp: TS },
    ];
    const incidents = detectIncidents(events, "agent", "router");
    expect(incidents).toHaveLength(2);
  });
});

describe("detectIncidents — API errors", () => {
  it("detects HTTP 503 error", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ exec failed: HTTP 503 Service Unavailable", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "jasmine", "clawbasehq");
    expect(incident.type).toBe("api_error");
    expect(incident.severity).toBe("critical");
  });

  it("detects HTTP 429 rate limit error", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ api call failed: 429 too many requests", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "agent", "router");
    expect(incident.type).toBe("api_error");
  });

  it("detects 'overloaded' keyword", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ Model is overloaded, please try again", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "agent", "router");
    expect(incident.type).toBe("api_error");
  });

  it("detects 'rate limit' keyword (with hyphen)", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ rate-limit exceeded", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "agent", "router");
    expect(incident.type).toBe("api_error");
  });

  it("detects 'quota exceeded'", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ quota_exceeded for this billing period", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "agent", "router");
    expect(incident.type).toBe("api_error");
  });

  it("classifies generic tool errors (not API patterns) as tool_error", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "error", message: "❌ file_read failed", timestamp: TS },
    ];
    const [incident] = detectIncidents(events, "agent", "router");
    expect(incident.type).toBe("tool_error");
    expect(incident.severity).toBe("warning");
  });

  it("ignores non-error events for API error detection", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "503 retries remaining", timestamp: TS },
    ];
    expect(detectIncidents(events, "agent", "router")).toHaveLength(0);
  });
});

describe("detectIncidents — edge cases", () => {
  it("returns [] for empty events", () => {
    expect(detectIncidents([], "agent", "router")).toHaveLength(0);
  });

  it("preserves agentId and routerId on all incidents", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🔄 Model: a → b", timestamp: TS },
      { id: "2", type: "error", message: "❌ exec failed: 503", timestamp: TS },
    ];
    const incidents = detectIncidents(events, "my-agent", "my-router");
    for (const inc of incidents) {
      expect(inc.agentId).toBe("my-agent");
      expect(inc.routerId).toBe("my-router");
    }
  });

  it("sets startedAt to the event timestamp", () => {
    const customTs = "2026-01-15T08:30:00.000Z";
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🔄 Model: a → b", timestamp: customTs },
    ];
    const [inc] = detectIncidents(events, "a", "r");
    expect(inc.startedAt).toBe(customTs);
  });

  it("sets resolvedAt to null (open incidents)", () => {
    const events: ActivityEvent[] = [
      { id: "1", type: "info", message: "🔄 Model: a → b", timestamp: TS },
    ];
    const [inc] = detectIncidents(events, "a", "r");
    expect(inc.resolvedAt).toBeNull();
  });
});
