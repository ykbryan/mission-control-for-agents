# Coolify Deployment Guide

## Coolify URL
http://100.121.209.118:8000

## Setup Steps

### 1. Create New Resource
- Go to Projects → New Project or use existing
- Click **+ New Resource** → **Application**
- Choose **Public Repository** (or Private with GitHub token)

### 2. Repository Config
- **Repository URL:** `https://github.com/ykbryan/mission-control-for-agents`
- **Branch:** `main`
- **Build Pack:** `Dockerfile` (auto-detected)

### 3. Environment Variables
```
NODE_ENV=production
PORT=3000
NEXT_TELEMETRY_DISABLED=1
```

### 4. Network / Port
- **Port:** `3000`
- **Expose via Traefik:** Yes (if you want a domain)
- Or expose directly on Tailscale IP via port mapping

### 5. Deploy
- Click **Deploy**
- Coolify will build the Docker image and start the container

## Access
Once deployed:
- **Tailscale:** http://100.121.209.118:<assigned-port>
- Or set domain via Traefik reverse proxy in Coolify

## Dockerfile Location
`Dockerfile` is in root of the repo — Coolify will auto-detect it.
