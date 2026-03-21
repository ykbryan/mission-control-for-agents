# Mission Control for Agents

A visually stunning dark-theme dashboard for the OpenClaw AI agent network. Visualize all agents, their skills, and operational files in a graph-based interface inspired by mission control aesthetics.

## Features

- **Agent Graph View** — SVG graph with the agent as a central glowing orange node, skills as satellite nodes with animated connections
- **Workflow View** — Linear step-by-step view of how an agent uses its skills
- **Agent Kit Panel** — Right sidebar showing soul/purpose, skill tags, and expandable markdown files
- **Search** — Filter agents by name, role, or skills (press `/` to focus)
- **18 Agents** — Full roster of the OpenClaw agent network

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Docker Build

```bash
docker build -t mission-control .
docker run -p 3000:3000 mission-control
```

## Environment Variables

See `.env.example`. No variables required for basic operation.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Framer Motion** (animations)
- **react-markdown** (markdown rendering)
- **SVG** (graph visualization)

## Deployment (Coolify)

1. Point Coolify to this repo
2. Set build pack to **Dockerfile** or **Nixpacks**
3. Set port to **3000**
4. Deploy
