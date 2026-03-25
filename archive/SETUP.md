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

## ⚠️ Critical: OpenClaw Gateway Network Configuration

If you are deploying Mission Control via Docker (e.g., Coolify, Portainer) or on a remote VPS, the OpenClaw Gateway must be configured to accept connections from outside `localhost`. 

By default, OpenClaw binds to `loopback` (`127.0.0.1`). This will cause Next.js SSR fetches to fail with `ECONNREFUSED` during the build phase and at runtime, as the isolated Docker container cannot reach the host's loopback interface.

**To fix this, update your OpenClaw configuration to bind to `0.0.0.0`:**
1. Open your OpenClaw config (or run `openclaw config edit`).
2. Change `gateway.bind` from `"loopback"` to `"auto"` (which safely binds to `0.0.0.0` to cover Tailscale/LAN interfaces).
3. Restart the gateway service: `openclaw gateway restart`.

*Security Note: If you expose the OpenClaw API to `0.0.0.0`, ensure the host machine is secured behind a VPN like Tailscale or a strict firewall, and that your `gateway.auth` token is strong.*
