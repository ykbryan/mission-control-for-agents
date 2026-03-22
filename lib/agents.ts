export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  soul: string;
  skills: string[];
  files: string[];
  routerId?: string;
  routerLabel?: string;
  status?: "online" | "offline" | "idle";
  tier?: "orchestrator" | "specialist";
}

export const agents: Agent[] = [
  {"id":"angel","name":"Angel","emoji":"📈","role":"Portfolio Manager Analyst","soul":"A disciplined tech equity analyst focused on practical catalysts and risk-managed decision support.","skills":["web_search","notion"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"bob","name":"Bob","emoji":"🧮","role":"Meticulous Bookkeeper","soul":"Meticulous bookkeeper who never loses receipts.","skills":["notion","pdf"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"brainy","name":"Brainy","emoji":"🧠","role":"Idea Catcher & Synthesizer","soul":"Captures, structures, and saves all brainstorming ideas into Notion.","skills":["notion","web_search","web_fetch","image"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","MEMORY.md","USER.md"]},
  {"id":"charles","name":"Charles","emoji":"👔","role":"Work & Scheduling Agent","soul":"Makes meetings happen without conflicts, and keeps work moving.","skills":["gog","calendar","notion"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"evelyn","name":"Evelyn","emoji":"👔","role":"Executive Chief of Staff","soul":"Executive Chief of Staff for Bryan across GoPomelo + Digital China.","skills":["gog","notion","web_search","message","cron","firehose"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","MEMORY.md","USER.md","CHANGELOG.md"],"tier":"orchestrator"},
  {"id":"faith","name":"Faith","emoji":"🌻","role":"Family Planner & Memory-Keeper","soul":"Family planner and memory-keeper for Bryan household.","skills":["apple-reminders","nodes","cron"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"gorilla","name":"Gorilla","emoji":"🦍","role":"Senior Developer","soul":"Senior Developer. Super Geek. Measures twice, cuts once.","skills":["claude-code","exec","git","github"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"hex","name":"Hex","emoji":"⛓️","role":"Crypto & Blockchain Expert","soul":"Crypto and blockchain technical expert. Former Bitcoin whale.","skills":["web_search","web_fetch","exec"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"ivy","name":"Ivy","emoji":"📱","role":"Senior iOS Developer","soul":"Senior iOS Developer & Mobile UX Expert.","skills":["exec","nodes","xcode","git"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","MEMORY.md","USER.md"]},
  {"id":"kat","name":"Kat","emoji":"🎯","role":"Senior Product Manager","soul":"Senior Product Manager & Startup Founder. Obsessed with market fit, high standards, and perfect UX.","skills":["web_search","notion","image"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"looker","name":"Looker","emoji":"🔍","role":"Market Intelligence Researcher","soul":"Lead Growth Researcher & Opportunity Scout.","skills":["web_search","web_fetch","browser","image"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","MEMORY.md","USER.md"]},
  {"id":"mother","name":"Mother","emoji":"🛡️","role":"QA Gatekeeper & SRE","soul":"Senior SDET and Site Reliability Engineer.","skills":["exec","browser","nodes","github"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"norton","name":"Norton","emoji":"🔒","role":"Tech Lead & DevSecOps","soul":"Technical Authority, SRE, and DevSecOps Architect.","skills":["exec","github","vercel-deploy","healthcheck"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"omega","name":"Omega","emoji":"🏛️","role":"Technical Architect","soul":"Technical Architect & Code Standards Enforcer.","skills":["exec","github","web_search"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","ARCHITECTURE.md","USER.md"]},
  {"id":"pat","name":"Pat","emoji":"🏷️","role":"Price Tracking Agent","soul":"Price tracker, deal hunter, and web scraper.","skills":["web_search","web_fetch","exec"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"queen","name":"Queen","emoji":"👑","role":"Marketing SEO Specialist","soul":"Data-driven search strategist who builds sustainable organic visibility.","skills":["web_search","web_fetch","notion"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"roy","name":"Roy","emoji":"💼","role":"Founder / CEO / Business Strategist","soul":"Founder, CEO, businessman.","skills":["web_search","notion","exec"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]},
  {"id":"jelly","name":"Jelly","emoji":"✍️","role":"Blogging Developer & Writer","soul":"Blogging developer and writing partner for Bryan.","skills":["web_search","exec","github"],"files":["IDENTITY.md","SOUL.md","TOOLS.md","HEARTBEAT.md","AGENTS.md","USER.md"]}
];

export const skillDescriptions: Record<string, string> = {
  web_search: "Search the web for real-time information",
  notion: "Read and write Notion pages and databases",
  pdf: "Parse and extract data from PDF files",
  web_fetch: "Fetch and parse web pages",
  image: "Generate and analyze images",
  gog: "Google Workspace (Gmail, Drive, etc.)",
  calendar: "Manage calendar events and scheduling",
  "apple-reminders": "Create and manage Apple Reminders",
  nodes: "Execute Node.js scripts",
  cron: "Schedule recurring tasks",
  firehose: "Stream real-time data feeds",
  "claude-code": "Run Claude Code for AI-assisted development",
  exec: "Execute shell commands",
  git: "Git version control operations",
  github: "GitHub API and repository management",
  xcode: "Xcode and iOS build tools",
  browser: "Control a headless browser",
  "vercel-deploy": "Deploy to Vercel",
  healthcheck: "Monitor service health endpoints",
  message: "Send messages via Slack/email",
};
