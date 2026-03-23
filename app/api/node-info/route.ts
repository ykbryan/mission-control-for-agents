import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

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
  nodeVersion:   string;
  routerVersion: string;
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
    // macOS hostname is often "Bryans-MacBook-Air.local" — strip .local and tidy
    return hostname.replace(/\.local$/i, "").replace(/-/g, " ");
  }
  // Linux: prefer hostname, strip .local if present
  return hostname.replace(/\.local$/i, "");
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

  const nodes: NodeInfo[] = results.flatMap((res, i) => {
    if (res.status !== "fulfilled") return [];
    const raw = res.value;
    const r   = routers[i];
    return [{
      ...raw,
      routerId:    r.id,
      routerLabel: r.label,
      platformIcon: platformIcon(raw.platform ?? ""),
      machineLabel: machineLabel(raw.platform ?? "", raw.hostname ?? r.label, raw.osLabel ?? ""),
    }];
  });

  return NextResponse.json({ nodes });
}
