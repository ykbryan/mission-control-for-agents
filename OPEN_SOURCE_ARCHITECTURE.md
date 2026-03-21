# Open-Source Architecture & Decoupling Strategy

## 1. Goal
Decouple `mission-control-for-agents` from the host's local filesystem and CLI environment so it can be packaged, distributed, and connected to any local or remote OpenClaw instance using the OpenClaw HTTP Gateway.

## 2. Environment Configuration
Instead of hardcoded paths (`/home/dave/.openclaw/agents`) and host-level Docker volume bindings (`:ro`), the application will rely exclusively on environment variables to authenticate with the OpenClaw Gateway:
- `OPENCLAW_GATEWAY_URL` (e.g., `http://localhost:8000` or `https://api.my-vps.com:8000`)
- `OPENCLAW_GATEWAY_TOKEN` (the bearer token generated via `openclaw gateway keys add`)

Users will define these in an `.env.local` file or pass them into the Docker container at runtime.

## 3. API Route Refactoring

### A. `app/api/agent-file/route.ts` (Filesystem Decoupling)
**Current State:** Uses Node.js `fs.readFileSync(path.join(AGENTS_BASE, ...))` reliant on a Docker volume.
**New Architecture:**
- The route will act as a proxy.
- It will read `agentId` and `file` from the request parameters.
- It will execute an HTTP `GET` request to the OpenClaw Gateway's file/memory retrieval endpoint (e.g., passing the query to the remote OpenClaw instance using the configured URL and Bearer token).
- If the OpenClaw Gateway API does not have a direct file-read endpoint, the backend will utilize the OpenClaw `exec` API endpoint to remotely execute `cat ~/.openclaw/agents/${agentId}/workspace/${file}` and return the `stdout` buffer.

### B. `app/api/telemetry/agent-costs/route.ts` (CLI Decoupling)
**Current State:** Uses `child_process.exec("openclaw status --usage --json")` requiring the OpenClaw binary to exist on the host OS.
**New Architecture:**
- The route will completely remove the `child_process` dependency.
- It will execute an HTTP `GET` request to the OpenClaw Gateway's status/telemetry endpoint (e.g., `/api/v1/status?usage=true`) passing the Bearer token.
- The returned JSON payload will be parsed and aggregated exactly as before, but the transport mechanism is now entirely network-based.

## 4. Implementation Checklist for Gorilla
- [ ] Read `.env` variables (`OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN`) into Next.js configuration.
- [ ] Refactor `/api/agent-file/route.ts` to replace `fs` with `fetch()` calls to the Gateway.
- [ ] Refactor `/api/telemetry/agent-costs/route.ts` to replace `child_process.exec` with `fetch()` calls to the Gateway.
- [ ] Implement graceful fallback/error handling (e.g., return `503 Service Unavailable` with a descriptive message if the Gateway is unreachable or the token is invalid).

## 5. Dynamic Authentication (Login/Logout)
Per Bryan's mandate, credentials will NOT be hardcoded in `.env.local`. 
- **Login Screen:** A dedicated `/login` page will capture `Gateway URL` and `Gateway Token`.
- **State Storage:** These credentials will be stored in secure HTTP-only cookies (or localStorage combined with API headers) so Next.js API routes can read them dynamically per user.
- **Logout:** A "Logout / Disconnect" button will be added to the `TopStatusStrip` to clear the cookies and redirect the user back to the Login screen.
- **API Routes:** `/api/agent-file/route.ts` and `/api/telemetry/agent-costs/route.ts` must extract the Gateway URL and Token from the incoming request cookies/headers to perform their remote fetches.
