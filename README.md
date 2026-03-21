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
