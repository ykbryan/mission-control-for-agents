// ── Shared types for the security audit ──────────────────────────────────────

export interface AuditFinding {
  agentId: string;
  agentName: string;
  detail: string;
  snippet?: string;
  file?: string;
}

export interface SecurityCheck {
  id: string;
  number: number;
  title: string;
  description: string;
  status: "pass" | "warn" | "fail";
  severity: "critical" | "high" | "medium" | "info";
  findings: AuditFinding[];
  recommendation: string;
  passLabel: string;
}

export interface SecurityAuditResponse {
  checks: SecurityCheck[];
  overallStatus: "pass" | "warn" | "fail";
  runAt: number;
  agentsScanned: number;
  filesScanned: number;
}

export interface RouterAgent {
  id: string;
  name: string;
  configured: boolean;
  files?: string[];
  skills?: string[];
  tier?: string;
  lastActiveAt?: number;
  routerId: string;
  routerLabel: string;
}

export interface PatternCheckDef {
  id: string;
  number: number;
  title: string;
  severity: "critical" | "high" | "medium" | "info";
  description: string;
  recommendation: string;
  passLabel: string;
  tag: string;
  vulnPatterns: Array<{ re: RegExp; label: string; severity: "critical" | "high" | "medium" }>;
  guardPatterns: RegExp[];
  noGuardMessage: (agentName: string) => string;
}
