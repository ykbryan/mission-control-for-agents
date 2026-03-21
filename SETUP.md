## 🚀 Quickstart & Deployment

Mission Control is designed to connect to any OpenClaw instance via the official HTTP Gateway API. You can run the dashboard locally on your laptop while monitoring agents on a remote VPS.

### 1. Start the OpenClaw Gateway
On the machine running your agents (e.g., your remote server or local machine), ensure the OpenClaw Gateway is running and accessible:
```bash
openclaw gateway start
```
*(Note: If running remotely, ensure port `8000` is exposed or routed via Tailscale/Cloudflare Tunnels).*

### 2. Generate a Secure Token
Generate a Bearer token so the dashboard can authenticate with your Gateway:
```bash
openclaw gateway keys add
```
Copy the output token. You will need this for the login screen.

### 3. Boot the Dashboard
Clone this repository and start the Next.js application:
```bash
git clone https://github.com/ykbryan/mission-control-for-agents.git
cd mission-control-for-agents
npm install
npm run dev
```
*(Docker deployment via `Dockerfile` is also fully supported).*

### 4. Connect Your Swarm
Navigate to `http://localhost:3000`. You will be automatically redirected to the `/login` setup screen. 
Enter your **Gateway URL** (e.g., `http://127.0.0.1:8000` or `https://api.your-vps.com`) and your **Gateway Token**.

**Security Note:** Your credentials are never hardcoded. Mission Control securely caches your Gateway URL and Bearer token in HTTP-only browser cookies. All dashboard telemetry and file inspector requests act as a secure proxy, executing `fetch()` calls directly to your configured OpenClaw instance.
