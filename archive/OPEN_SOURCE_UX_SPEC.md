# OPEN_SOURCE_UX_SPEC.md - First-Run Onboarding Design

## 1. Onboarding Strategy (First-Run Screen)
When a user launches `mission-control-for-agents` and the `OPENCLAW_GATEWAY_URL` or `OPENCLAW_GATEWAY_TOKEN` environment variables are missing, the `NavRail` and `CenterStage` will be disabled. Instead, the user will be presented with a premium, modal-style **"Connect Your Swarm"** landing page.

**UI Specifications:**
- **Background:** `bg-zinc-950` with a subtle radial gradient `from-zinc-900 to-black`.
- **Card Container:** `max-w-md mx-auto p-8 rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl`.
- **Typography:** Strict inter/sans layout. "Welcome to Mission Control" (text-xl font-medium text-zinc-100), with a brief, developer-focused description of the required setup parameters.
- **Inputs:** Two clean, zinc-styled inputs (`bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-500 focus:ring-0`).
   - *Gateway URL* (e.g., `http://100.x.y.z:8000`)
   - *Bearer Token* (Generated via `openclaw gateway keys add`)
- **Action:** A "Connect" button (`bg-zinc-100 text-zinc-950 font-medium px-4 py-2 hover:bg-white transition-all`).
- **State Storage:** When entered successfully, the UI will write these values to the Next.js API or store them securely in the browser's `localStorage` / `cookies` (if an API `.env` rewrite is not viable on Vercel/Docker containers without reboots). *Omega must decide if state is strictly `.env` or client-side storage.*

## 2. Connection State Indicators (`TopStatusStrip`)
- **Top Right Header:** Add a new status pill.
- **Connected:** A pulsing green dot (`w-2 h-2 rounded-full bg-emerald-500 animate-pulse`) next to text "Gateway Connected".
- **Disconnected/Error:** A solid red dot (`bg-rose-500`) with text "Gateway Offline" and a 'Reconnect' button linking back to the modal setup.

## 3. Open-Source `README.md` Value Proposition
The GitHub repository must include a premium, developer-focused README:
- **Hero Image:** A high-res, 16:9 screenshot of the `React Flow` canvas and `AnalyticsStage` with the dark zinc theme.
- **One-Liner:** "The spatial operating system for your OpenClaw agent swarms."
- **Features List:**
  - 🗺️ **Scalable Agent Canvas:** Pan, zoom, and navigate your swarm spatially via React Flow.
  - 🧠 **Contextual Inspector:** Stream live `MEMORY.md`, `IDENTITY.md`, and real-time logs instantly.
  - 📊 **Telemetry Dashboard:** Live token burn rates and estimated USD costs per agent, per day.
  - 🔒 **Remote-Ready:** Connect to any OpenClaw instance globally via the secure HTTP Gateway API.
- **Quickstart:** Simple 3-step setup (Clone, Install dependencies, Run `npm run dev` and enter your Gateway token).
