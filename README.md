# Mission Control for Agents

> The spatial operating system for your OpenClaw agent swarms.

![Canvas](media/canvas.png)

Mission Control is a premium, high-performance Next.js dashboard engineered specifically to visualize, navigate, and manage massive swarms of autonomous [OpenClaw](https://github.com/openclaw/openclaw) agents. 

We built this out of necessity. When managing 20+ agents across multiple domains (coding, UX, deployment), a flat vertical list breaks down. You need a spatial map. You need live token telemetry. You need a centralized command center.

## 🌟 Core Features

### 🗺️ Scalable Agent Canvas (Powered by React Flow)
Navigate your swarm spatially. The center stage is an interactive, draggable node map built on Framer Motion physics. Zoom out to see the entire swarm hierarchy, pan to specific agent clusters, and visualize the architecture of your automation.

### 🧠 Agent Profile Drill-Down & Inspector
Double-click any node on the canvas to trigger an immersive, `framer-motion` animated profile takeover. Inspect their Skills Matrix and live terminal activity logs instantly. 

![Agent Profile Drill-down](media/profile.png)

### 📊 Token & Cost Analytics (Powered by Recharts)
Manage your API burn rate. The Analytics Stage features animated count-up metrics and interactive bar charts calculating live "Token Consumption & USD Cost per Agent, per Day." 

### 🔒 Remote-Ready (HTTP Gateway API)
Mission Control is completely decoupled from the local filesystem. It natively hooks into the OpenClaw HTTP Gateway. 

![Login Screen](media/login.png)

Spin up the dashboard on your laptop, hit the secure `/login` modal, plug in your `OPENCLAW_GATEWAY_URL` and Bearer token, and manage a swarm running on a remote VPS data center across the globe. No hardcoded `.env` files. Seamless authentication via secure, HTTP-only cookies.

---
*(See [SETUP.md](SETUP.md) for full deployment instructions and OpenClaw Gateway configuration).*

### 🛠️ Important: Linux Systemd Network Override

If you are running OpenClaw as a Linux `systemd` background service (via `openclaw service install`), OpenClaw defaults to a secure `loopback` binding (`127.0.0.1`). 

Even if you update `openclaw.json` to `"bind": "auto"` or `"0.0.0.0"`, the `systemd` daemon file may have `--bind loopback` explicitly hardcoded in the `ExecStart` arguments, which overrides the JSON config. 

**To fix this and allow Docker/Coolify containers to reach your host OpenClaw Gateway over a Tailnet:**
1. Open the service file: `nano ~/.config/systemd/user/openclaw-gateway.service`
2. Locate the `ExecStart=` line.
3. If `--bind loopback` or `--bind 127.0.0.1` is present, either remove the flag entirely (to defer to `openclaw.json`) or change it to `--bind 0.0.0.0`.
4. Reload the daemon: `systemctl --user daemon-reload`
5. Restart the service: `systemctl --user restart openclaw-gateway`

*Warning: This will reboot the OpenClaw service and briefly disconnect active agents.*

## 📚 Lessons Learned & Troubleshooting (Developer Log)

During the development of Mission Control, the Shelldon Swarm encountered several critical architectural and networking hurdles. If you are a developer extending this dashboard or a user deploying it to a remote VPS (like Coolify), please review these lessons learned to avoid the same pitfalls:

### 1. The Gateway Network Bridge (Tailscale Binding)
By default, the OpenClaw Gateway securely binds to `127.0.0.1` (`loopback`). This means that an isolated Docker container running Mission Control on the same host (or over a Tailnet) cannot reach the OpenClaw API, resulting in `ECONNREFUSED` crashes during Next.js SSR builds.

**The Fix:** You must explicitly tell the OpenClaw server to listen on the Tailscale network interface. 
- Do **not** use `0.0.0.0` or `auto` unless you are on a fully trusted LAN, as this exposes the Gateway to all interfaces.
- Instead, use `gateway.bind="tailnet"`. This strictly limits the exposure, completely ignoring traffic from your regular WiFi/LAN or the public internet, while safely allowing your Mission Control Docker container to tunnel in.

*(Note: Ensure your Linux `systemd` daemon file does not contain a hardcoded `--bind loopback` override in the `ExecStart` arguments, as it will silently ignore your `openclaw.json` config).*

### 2. The Next.js SSR Crash Loop
Next.js aggressively attempts Server-Side Rendering (SSR) or Static Site Generation (SSG) during the `npm run build` phase. If your API routes attempt to hit a live Gateway URL (like a Tailscale IP) during the Docker build sequence, the isolated Docker network will throw `ECONNREFUSED` and hard-crash the build.
**The Fix:** Inject `export const dynamic = 'force-dynamic';` into `app/layout.tsx` to force runtime rendering and bypass the static build-time fetches.

### 3. The API Hallucination Bug (`/api/v1/exec`)
When fetching remote agent files (like `USER.md`) or live session transcripts (`.jsonl`), our AI coding agents initially hallucinated the Gateway API endpoint as `POST /api/v1/exec`. **This endpoint does not exist** and will return a raw HTML `404 Not Found` response.
**The Fix:** Always use the actual OpenClaw API tool invocation endpoint: `POST /tools/invoke`. 
- **Request Schema:** `{"tool": "exec", "args": {"command": "YOUR_BASH_COMMAND"}}`
- **Response Parser:** The output is nested. You must extract the bash stdout from `jsonResp.result.output`, not `jsonResp.stdout`.
