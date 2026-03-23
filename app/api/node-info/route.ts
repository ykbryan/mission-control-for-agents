import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

// Cache the local OpenClaw version so we only shell out once per process lifetime
let _localOpenClawVersion: string | null = null;
function localOpenClawVersion(): string {
  if (_localOpenClawVersion !== null) return _localOpenClawVersion;
  try {
    const out = execSync("openclaw --version 2>/dev/null", { timeout: 3000 }).toString().trim();
    // "OpenClaw 2026.3.13 (61d171a)"  →  "2026.3.13"
    const m = out.match(/(\d{4}\.\d+\.\d+)/);
    _localOpenClawVersion = m ? m[1] : (out.split(" ")[1] ?? "unknown");
  } catch {
    _localOpenClawVersion = "unknown";
  }
  return _localOpenClawVersion;
}

function isLocalRouter(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch { return false; }
}

export interface NodeInfo {
  routerId:      string;
  routerLabel:   string;
  hostname:      string;
  platform:      string;   // "darwin" | "linux" | "win32"
  arch:          string;   // "arm64" | "x64" | …
  osLabel:       string;   // "macOS 14.4.1" | "Ubuntu 22.04.3 LTS" | …
  cpuModel:      string;
  cpuCount:      number;
  totalMemGb:    number;
  uptimeSeconds: number;
  nodeVersion:      string;
  routerVersion:    string;
  openclawVersion:  string;
  // Derived
  platformIcon:  string;   // emoji for quick display
  machineLabel:  string;   // short friendly label, e.g. "MacBook Air" or "ubuntu-gorilla"
}

function platformIcon(platform: string): string {
  if (platform === "darwin")  return "🍎";
  if (platform === "linux")   return "🐧";
  if (platform === "win32")   return "🪟";
  return "💻";
}

function machineLabel(platform: string, hostname: string, osLabel: string): string {
  if (platform === "darwin") {
    // Strip .local / .lan suffixes and tidy dashes
    return hostname.replace(/\.(local|lan)$/i, "").replace(/-/g, " ");
  }
  // Linux: prefer hostname, strip .local/.lan if present
  return hostname.replace(/\.(local|lan)$/i, "");
}

export async function GET(req: NextRequest) {
  const routers = parseRouters(req.cookies.get("routers")?.value);
  if (routers.length === 0) {
    const url   = req.cookies.get("routerUrl")?.value;
    const token = req.cookies.get("routerToken")?.value;
    if (url && token) routers.push({ id: "legacy", label: "Router", url, token });
  }
  if (routers.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled(
    routers.map(r => routerGet<Omit<NodeInfo, "routerId"|"routerLabel"|"platformIcon"|"machineLabel">>(r.url, r.token, "/info"))
  );

  const nodes: NodeInfo[] = results.map((res, i) => {
    const r = routers[i];
    if (res.status === "fulfilled") {
      const raw = res.value;
      // If the router hasn't been updated yet to report openclawVersion,
      // and it's a local router, get it directly from the openclaw binary.
      const openclawVersion = raw.openclawVersion || (isLocalRouter(r.url) ? localOpenClawVersion() : "");
      return {
        ...raw,
        openclawVersion,
        routerId:     r.id,
        routerLabel:  r.label,
        platformIcon: platformIcon(raw.platform ?? ""),
        machineLabel: machineLabel(raw.platform ?? "", raw.hostname ?? r.label, raw.osLabel ?? ""),
      };
    }
    // Router didn't support /info yet — return a stub so the UI still shows it
    return {
      routerId:     r.id,
      routerLabel:  r.label,
      hostname:     r.label,
      platform:     "unknown",
      arch:         "unknown",
      osLabel:      "Router not updated",
      cpuModel:     "",
      cpuCount:     0,
      totalMemGb:   0,
      uptimeSeconds: 0,
      nodeVersion:     "",
      routerVersion:   "",
      openclawVersion: "",
      platformIcon: "💻",
      machineLabel: r.label,
    };
  });

  return NextResponse.json({ nodes });
}
