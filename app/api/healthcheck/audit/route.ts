import { NextRequest, NextResponse } from "next/server";
import { parseRouters } from "@/lib/router-config";
import type { SecurityAuditResponse } from "./lib/types";
import { loadAgents, loadAgentFiles } from "./lib/loader";
import {
  checkTooManySkills,
  checkExecPrivilege,
  checkCredentials,
  checkSubagentCreation,
  checkSuspiciousContent,
  checkDirectAgentAttack,
  checkEncodingAttack,
  runPatternCheck,
  PATTERN_CHECK_DEFS,
} from "./lib/checks";

export { type AuditFinding, type SecurityCheck, type SecurityAuditResponse } from "./lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allAgents = await loadAgents(routers);
  const { fileMap, filesScanned } = await loadAgentFiles(allAgents, routers);

  const checks = [
    checkTooManySkills(allAgents),
    checkExecPrivilege(allAgents),
    checkCredentials(allAgents, fileMap),
    checkSubagentCreation(allAgents, fileMap),
    checkSuspiciousContent(allAgents, fileMap),
    checkDirectAgentAttack(allAgents, fileMap),
    checkEncodingAttack(allAgents, fileMap),
    ...PATTERN_CHECK_DEFS.map(def => runPatternCheck(def, allAgents, fileMap)),
  ];

  const overallStatus: "pass" | "warn" | "fail" =
    checks.some(c => c.status === "fail") ? "fail" :
    checks.some(c => c.status === "warn") ? "warn" : "pass";

  return NextResponse.json({
    checks,
    overallStatus,
    runAt: Date.now(),
    agentsScanned: allAgents.length,
    filesScanned,
  } satisfies SecurityAuditResponse);
}
