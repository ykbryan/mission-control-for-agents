# ARCHITECTURE.md
## Mission Control for Agents — Retroactive Architecture Review

> **Author:** Omega 🏛️ — Technical Architect & Code Standards Enforcer  
> **Date:** 2025-03-21  
> **Repo:** https://github.com/ykbryan/mission-control-for-agents  
> **Live:** http://100.108.65.29:3000  
> **Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Framer Motion, react-markdown

---

## Section 1: Current State

### 1.1 Component Map & Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        lib/agents.ts                                │
│           STATIC DATA — 18 agents hardcoded at build time           │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ import (compile-time)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       app/page.tsx  ("use client")                  │
│   State: selectedAgent, searchQuery, openFiles, viewMode            │
│   ─────────────────────────────────────────────────────────────     │
│   Renders:                                                          │
│   ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│   │  AgentList   │  │   AgentGraph     │  │    AgentPanel       │  │
│   │  (sidebar)   │  │  (SVG/workflow)  │  │  (right detail)     │  │
│   └──────┬───────┘  └────────┬─────────┘  └──────────┬──────────┘  │
│          │ onSelect          │ viewMode               │ openFiles   │
│          └───────────────────┴────────────────────────┘            │
│   Header: SearchBar (with "/" keyboard shortcut)                    │
└─────────────────────────────────────────────────────────────────────┘

Data Flow:
  lib/agents.ts → page.tsx → filter by searchQuery → AgentList
                           → pass selectedAgent  → AgentGraph (SVG radial + workflow view)
                           → pass selectedAgent  → AgentPanel
                                                        └─→ MarkdownViewer (react-markdown)
                                                              (FILE_CONTENT = HARDCODED placeholder)
```

### 1.2 File Inventory

| File | Purpose | Size/Complexity |
|------|---------|----------------|
| `app/page.tsx` | Root SPA shell, all state | ~80 lines, "use client" |
| `app/layout.tsx` | HTML shell, metadata | Minimal |
| `app/globals.css` | Global styles, hex-bg pattern | Tailwind v4 |
| `components/AgentGraph.tsx` | SVG radial + workflow diagram | ~280 lines, ResizeObserver |
| `components/AgentPanel.tsx` | Right panel: skills, files, markdown | ~200 lines, hardcoded FILE_CONTENT |
| `components/AgentList.tsx` | Sidebar agent selector | Unknown (not reviewed) |
| `components/MarkdownViewer.tsx` | react-markdown wrapper | Thin wrapper |
| `components/SearchBar.tsx` | Search input, "/" shortcut | Thin component |
| `lib/agents.ts` | Agent data + type definitions | 18 agents, types inline |
| `Dockerfile` | Multi-stage Alpine build | 24 lines, PORT hardcoded |

### 1.3 Tech Choices Assessment

| Choice | Verdict | Notes |
|--------|---------|-------|
| Next.js App Router | ✅ Good | Correct for modern Next.js; enables RSC, layouts, file-based routing |
| TypeScript | ✅ Good | Consistent usage throughout |
| Tailwind CSS v4 | ✅ Good | Latest, but CSS custom properties + `hex-bg` done via raw CSS |
| Framer Motion | ✅ Good | Well-used for SVG node entrance animations and workflow transitions |
| react-markdown | ✅ Good | Appropriate for rendering markdown file previews |
| SVG radial graph | ✅ Good | Lightweight, no heavy graph library needed |
| "use client" on page.tsx | ⚠️ Suboptimal | Entire page client-rendered; loses SSR/RSC benefits |
| Hardcoded agent data | ❌ Bad | Not production-viable; should be API/filesystem-driven |
| Hardcoded FILE_CONTENT | ❌ Bad | Placeholder content doesn't reflect real agent files |
| Inline styles (not Tailwind) | ⚠️ Mixed | Most styling uses raw `style={}` objects — defeats Tailwind; inconsistent |
| PORT hardcoded in Dockerfile | ❌ Bad | Breaks Coolify dynamic port assignment |
| No `next.config.js` visible | ⚠️ Risk | Standalone output must be set for Dockerfile `server.js` to exist |

---

## Section 2: Gaps & Issues

### 2.1 Missing Error Boundaries

**Severity: P0**

There are no React Error Boundaries anywhere in the tree. A single unhandled exception in `AgentGraph.tsx` (e.g., during SVG measurement) will crash the entire dashboard with a white screen.

- No `app/error.tsx` (Next.js App Router root error boundary)
- No component-level `<ErrorBoundary>` wrappers
- `ResizeObserver` callback in `AgentGraph.tsx` has no try/catch

### 2.2 No Loading States

**Severity: P1**

- No `app/loading.tsx` skeleton
- If agent data were async, there's no Suspense boundary or spinner
- Initial page paint shows nothing until JS hydrates (client component)

### 2.3 Static / Hardcoded Data

**Severity: P0**

Two layers of fake data:

1. **`lib/agents.ts`** — 18 agents are hardcoded. Adding/removing an agent requires a code change + redeploy. In production, this should read from:
   - An API route that reads agent config files from the filesystem at runtime
   - Or an external CMS/database

2. **`FILE_CONTENT` in `AgentPanel.tsx`** — File contents (SOUL.md, TOOLS.md, etc.) are entirely fabricated placeholder strings. They don't reflect what's actually in each agent's workspace. Users see fake data.

### 2.4 Missing Agent Detail Page Routes

**Severity: P1**

There is no `/agent/[id]` route. The dashboard is a single SPA page. Consequences:
- No shareable deep links to a specific agent
- No URL state — refreshing resets to agent[0]
- SEO: every agent has the same URL
- Can't directly link Gorilla to "go fix the Evelyn agent config"

### 2.5 No Dark/Light Mode Toggle

**Severity: P2**

The UI is dark-only. Styles are hardcoded to dark palette (`rgba(10,10,10,...)`, `#f0f0f0` text). There's no `prefers-color-scheme` media query support and no toggle in the header. 

### 2.6 Dockerfile Gaps

**Severity: P0 (for Coolify deployment)**

```dockerfile
EXPOSE 3000
ENV PORT 3000          # ← hardcoded, Coolify needs dynamic PORT
ENV HOSTNAME "0.0.0.0"
```

Issues:
- Coolify sets `PORT` dynamically at container start. The hardcoded `ENV PORT 3000` overrides it.
- `server.js` must exist in `.next/standalone/` — this requires `output: 'standalone'` in `next.config.js`. If that config is missing, the Docker build will silently fail to copy `server.js`.
- No `HEALTHCHECK` directive (Coolify uses this for zero-downtime deploys)
- No `.dockerignore` confirmed (could include `.git`, `node_modules` in build context)

### 2.7 Missing Tests

**Severity: P1**

Zero test files exist. No unit tests, no integration tests, no E2E. For a production dashboard:
- Agent data schema has no validation
- SVG layout math (radius, angle) has no tests
- Search filter logic has no tests

### 2.8 Accessibility Gaps

**Severity: P1**

- SVG skill nodes have no `aria-label` or `role` attributes — invisible to screen readers
- AgentPanel file buttons have no `aria-expanded` state
- Color contrast: `#555` text on dark backgrounds likely fails WCAG AA
- `<div>` used for the header logo area instead of `<header>` landmark
- Search input: unclear if `id="search-input"` has a proper `<label>`
- Keyboard navigation: Tab order through SVG skill nodes is undefined

### 2.9 Code Quality Issues

**Severity: P2**

- `SKILL_ICONS` map is **duplicated** verbatim in both `AgentGraph.tsx` and `AgentPanel.tsx` — should be in `lib/constants.ts`
- `Agent` type is defined and exported from `lib/agents.ts` — should be in `lib/types.ts`
- All styling uses raw `style={{}}` objects rather than Tailwind classes — defeats the purpose of including Tailwind; makes theming and dark mode harder
- `package.json` lists `next: "16.2.1"` — verify this is intentional (Next.js 16 vs 15 in project description)
- No `next.config.js` in reviewed files — standalone output mode configuration unknown

---

## Section 3: Recommended Improvements (Prioritized)

### P0 — Must Fix Before Production

| # | Issue | Action |
|---|-------|--------|
| P0-1 | No error boundary | Add `app/error.tsx` + `app/global-error.tsx` |
| P0-2 | Hardcoded agent data | Move to `app/api/agents/route.ts`, read from filesystem at runtime |
| P0-3 | Fake file contents | API route reads actual agent `.md` files from `~/.openclaw/agents/` |
| P0-4 | Dockerfile PORT | Change `ENV PORT 3000` → `ARG PORT=3000` + `EXPOSE ${PORT}` |
| P0-5 | Missing `next.config.js` | Confirm `output: 'standalone'` exists; Dockerfile depends on it |

### P1 — Should Fix Soon

| # | Issue | Action |
|---|-------|--------|
| P1-1 | No loading state | Add `app/loading.tsx` with skeleton |
| P1-2 | No agent detail route | Add `app/agent/[id]/page.tsx` |
| P1-3 | Missing `/lib/types.ts` | Extract all interfaces/types into dedicated types file |
| P1-4 | No tests | Add Vitest unit tests for filter logic, data schema validation |
| P1-5 | Accessibility | Add `aria-label` to SVG nodes, `aria-expanded` to file buttons |
| P1-6 | Duplicate SKILL_ICONS | Move to `lib/constants.ts`, import in both components |
| P1-7 | URL state | Use `useRouter`/`useSearchParams` to persist `selectedAgent` in URL |

### P2 — Nice to Have

| # | Issue | Action |
|---|-------|--------|
| P2-1 | Dark/light mode | Add CSS variables + toggle button in header |
| P2-2 | Tailwind adoption | Replace inline `style={{}}` with Tailwind utility classes |
| P2-3 | Dockerfile HEALTHCHECK | Add `HEALTHCHECK CMD curl -f http://localhost:${PORT}/api/health` |
| P2-4 | Agent status indicators | Show online/offline/idle per agent (poll via API) |
| P2-5 | Storybook | Document components in isolation |
| P2-6 | E2E tests | Playwright test: select agent, verify graph renders |

---

## Section 4: Gorilla Handoff Instructions

> 🦍 **Hey Gorilla** — Here are the 5 concrete code changes to implement, in priority order. Each has the exact file path and a blueprint.

---

### Change 1: Add `/app/agent/[id]/page.tsx`

Create a shareable deep-link page for each agent.

```
app/
  agent/
    [id]/
      page.tsx      ← NEW
      loading.tsx   ← NEW (see Change 2)
      error.tsx     ← NEW (see Change 2)
```

**`app/agent/[id]/page.tsx` blueprint:**

```tsx
import { notFound } from "next/navigation";
import AgentGraph from "@/components/AgentGraph";
import AgentPanel from "@/components/AgentPanel";

interface Props {
  params: { id: string };
}

export default async function AgentDetailPage({ params }: Props) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/agents/${params.id}`, {
    cache: "no-store",
  });
  if (!res.ok) notFound();
  const agent = await res.json();

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <AgentGraph agent={agent} viewMode="graph" onViewModeChange={() => {}} />
      <AgentPanel agent={agent} openFiles={new Set()} onToggleFile={() => {}} />
    </div>
  );
}

export async function generateStaticParams() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/agents`);
  const agents = await res.json();
  return agents.map((a: { id: string }) => ({ id: a.id }));
}
```

---

### Change 2: Add `loading.tsx` and `error.tsx`

**`app/loading.tsx`:**
```tsx
export default function Loading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#0a0a0a", color: "#e85d27", fontSize: 14,
    }}>
      <span>⚡ Loading Mission Control…</span>
    </div>
  );
}
```

**`app/error.tsx`:**
```tsx
"use client";
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", background: "#0a0a0a", gap: 16,
    }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ color: "#f0f0f0", fontSize: 16, fontWeight: 700 }}>
        Something went wrong
      </div>
      <div style={{ color: "#666", fontSize: 13 }}>{error.message}</div>
      <button
        onClick={reset}
        style={{
          padding: "8px 20px", background: "#e85d27", border: "none",
          borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13,
        }}
      >
        Try again
      </button>
    </div>
  );
}
```

---

### Change 3: Move Agent Data to API Route

Create `app/api/agents/route.ts` that reads from filesystem at runtime.

**`app/api/agents/route.ts`:**
```ts
import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";

const AGENTS_BASE = process.env.AGENTS_BASE_PATH ?? "/home/dave/.openclaw/agents";

export async function GET() {
  try {
    const agentDirs = await readdir(AGENTS_BASE, { withFileTypes: true });
    const agents = await Promise.all(
      agentDirs
        .filter((d) => d.isDirectory())
        .map(async (dir) => {
          const agentPath = path.join(AGENTS_BASE, dir.name, "workspace");
          try {
            const identityRaw = await readFile(
              path.join(agentPath, "IDENTITY.md"), "utf-8"
            );
            const soulRaw = await readFile(
              path.join(agentPath, "SOUL.md"), "utf-8"
            ).catch(() => "");
            const files = await readdir(agentPath).catch(() => []);
            // Parse basic fields from IDENTITY.md (or use a JSON sidecar)
            return {
              id: dir.name,
              name: dir.name.charAt(0).toUpperCase() + dir.name.slice(1),
              soul: soulRaw.split("\n").find((l) => l.startsWith('"'))?.replace(/"/g, "") ?? "",
              files: files.filter((f) => f.endsWith(".md")),
            };
          } catch {
            return null;
          }
        })
    );
    return NextResponse.json(agents.filter(Boolean));
  } catch (err) {
    return NextResponse.json({ error: "Failed to load agents" }, { status: 500 });
  }
}
```

**`app/api/agents/[id]/route.ts`** — for single agent + file content:
```ts
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const AGENTS_BASE = process.env.AGENTS_BASE_PATH ?? "/home/dave/.openclaw/agents";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const filePath = path.join(AGENTS_BASE, params.id, "workspace", `${params.id}.md`);
  // Use params.id as file key; expand as needed
  try {
    const content = await readFile(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
```

Add to `.env.local`:
```
AGENTS_BASE_PATH=/home/dave/.openclaw/agents
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

### Change 4: Add `/lib/types.ts`

Extract all shared types to a single source of truth:

**`lib/types.ts`:**
```ts
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  soul: string;
  skills: string[];
  files: string[];
}

export type ViewMode = "graph" | "workflow";

export interface SkillNode {
  skill: string;
  x: number;
  y: number;
  angle: number;
}

export interface AgentGraphProps {
  agent: Agent;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export interface AgentPanelProps {
  agent: Agent;
  openFiles: Set<string>;
  onToggleFile: (fileName: string) => void;
}
```

Then update imports in all components:
```ts
// Before:
import { Agent } from "@/lib/agents";

// After:
import type { Agent } from "@/lib/types";
```

Also create **`lib/constants.ts`** to eliminate the duplicated `SKILL_ICONS`:
```ts
export const SKILL_ICONS: Record<string, string> = {
  web_search: "🔍",
  notion: "📝",
  // ... all entries
};

export const FILE_ICONS: Record<string, string> = {
  "IDENTITY.md": "🪪",
  // ... all entries
};
```

---

### Change 5: Fix Dockerfile for Coolify with PORT Env Var

**Current (broken for Coolify):**
```dockerfile
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
```

**Fixed:**
```dockerfile
# Add to next.config.js (REQUIRED for standalone server.js):
# output: 'standalone'

# In Dockerfile, replace the runner section tail:
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
# PORT is intentionally NOT hardcoded — Coolify injects it at runtime
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.js"]
```

**Add `next.config.js`** (if missing):
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};
module.exports = nextConfig;
```

**Add `app/api/health/route.ts`** for the HEALTHCHECK:
```ts
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}
```

**Add `.dockerignore`** (if missing):
```
.git
node_modules
.next
.env*.local
*.md
!README.md
```

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| P0 (production blockers) | 5 | 🔴 Must fix |
| P1 (should fix soon) | 7 | 🟡 Important |
| P2 (nice to have) | 6 | 🟢 Later |

The MVP is solid — the UI looks great, the component decomposition is clean, and the tech stack choices are sound. The main gaps are **data architecture** (hardcoded static data) and **production readiness** (error handling, Dockerfile PORT, standalone config). With the 5 changes above, this dashboard is production-ready.

---

*Architecture review complete. Ready for Gorilla to implement. 🏛️→🦍*
