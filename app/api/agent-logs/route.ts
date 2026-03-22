import { NextRequest, NextResponse } from "next/server";
import { routerGet } from "@/lib/router-client";
import { parseRouters } from "@/lib/router-config";

interface RouterSession {
  key: string;
  displayName?: string;
  label?: string;
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agent");
  if (!agentId) return NextResponse.json({ error: "Missing agent" }, { status: 400 });

  // Get router config
  const routerId = searchParams.get("routerId") ?? "legacy";
  const routers = parseRouters(req.cookies.get("routers")?.value);
  let routerUrl: string | undefined;
  let routerToken: string | undefined;

  if (routers.length > 0) {
    const router = routers.find(r => r.id === routerId) ?? routers[0];
    routerUrl = router.url;
    routerToken = router.token;
  } else {
    // Legacy fallback
    routerUrl = req.cookies.get("routerUrl")?.value;
    routerToken = req.cookies.get("routerToken")?.value;
  }

  if (!routerUrl || !routerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await routerGet<{ sessions: RouterSession[] }>(
      routerUrl, routerToken, "/sessions", { agentId }
    );
    const logs = (data.sessions ?? []).slice(0, 10).map((s) => {
      const label = s.label ?? s.displayName ?? s.key;
      const tokens = s.totalTokens ? `${s.totalTokens.toLocaleString()} tokens` : "";
      const model = s.model ? `[${s.model.split("/").pop()}]` : "";
      return {
        timestamp: new Date(s.updatedAt ?? Date.now()).toISOString(),
        text: [model, label, tokens].filter(Boolean).join(" — "),
      };
    });
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json([]);
  }
}
