# Coolify Deployment Guide

## Coolify URL
http://100.121.209.118:8000

## Setup Steps

### 1. Create New Resource
- Go to Projects → New Project or use existing
- Click **+ New Resource** → **Application**
- Choose **Public Repository** (GitHub PAT not needed — repo is public)

### 2. Repository Config
- **Repository URL:** `https://github.com/ykbryan/mission-control-for-agents`
- **Branch:** `main`
- **Build Pack:** `Dockerfile` (auto-detected)

### 3. Environment Variables
```
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
```
(Do NOT set PORT manually — Coolify injects it)

### 4. Volume Mount (CRITICAL)
The app reads agent markdown files from `/home/dave/.openclaw/agents` on the host.
You must add a volume mount in Coolify:

- **Host path:** `/home/dave/.openclaw/agents`
- **Container path:** `/home/dave/.openclaw/agents`
- **Read only:** Yes

Without this, MD file content will show "file does not exist" errors.

### 5. Network / Port
- **Port:** `3000` (or let Coolify assign)
- **Expose via Traefik:** Yes (if you want a domain/subdomain)

### 6. Deploy
- Click **Deploy**
- Coolify will build the Docker image and start the container
- Health check runs automatically every 30s

## Access
Once deployed:
- **Tailscale:** http://100.121.209.118:<assigned-port>
- Or set domain via Traefik reverse proxy in Coolify

## Dockerfile Location
`Dockerfile` is in root of the repo — Coolify will auto-detect it.
