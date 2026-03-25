#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control — full installer (Router + UI)
#  Supports: macOS · Linux (Ubuntu/Debian/RHEL) · WSL
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/install.sh | bash
# ─────────────────────────────────────────────────────────────

if [[ "${1}" == "--help" || "${1}" == "-h" ]]; then
  echo ""
  echo "  Mission Control — Full Installer (Router + UI)"
  echo ""
  echo "  Usage: bash install.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --help, -h          Show this help message"
  echo "    --router-only       Install only the router (same as install-router.sh)"
  echo "    --ui-only           Install only the UI    (same as install-missioncontrol.sh)"
  echo ""
  echo "  Environment overrides (skip prompts):"
  echo "    OPENCLAW_URL        OpenClaw gateway URL  (default: http://127.0.0.1:18789)"
  echo "    OPENCLAW_TOKEN      OpenClaw bearer token (required)"
  echo "    ROUTER_PORT         Router port           (default: 3010)"
  echo "    MC_PORT             Mission Control port  (default: 3000)"
  echo "    ROUTER_INSTALL_DIR  Custom router install directory"
  echo "    MC_INSTALL_DIR      Custom UI install directory"
  echo ""
  exit 0
fi

REPO="https://github.com/ykbryan/mission-control-for-agents.git"

GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}  $*${RESET}\n  ${CYAN}────────────────────────────────────────${RESET}\n"; }

# ── Detect OS ────────────────────────────────────────────────
OS="linux"
case "$(uname -s)" in
  Darwin) OS="mac" ;;
  Linux)
    if grep -qi microsoft /proc/version 2>/dev/null; then OS="wsl"
    else OS="linux"; fi
    ;;
  MINGW*|CYGWIN*|MSYS*)
    echo -e "${YELLOW}  Windows detected. Use WSL and re-run this command.${RESET}"
    exit 1 ;;
esac

INSTALL_ROUTER=true
INSTALL_UI=true
[[ "${1}" == "--router-only" ]] && INSTALL_UI=false
[[ "${1}" == "--ui-only" ]]     && INSTALL_ROUTER=false

# Default install dirs
ROUTER_INSTALL_DIR="${ROUTER_INSTALL_DIR:-}"
MC_INSTALL_DIR="${MC_INSTALL_DIR:-}"

if [ -z "$ROUTER_INSTALL_DIR" ]; then
  case "$OS" in
    mac|wsl) ROUTER_INSTALL_DIR="$HOME/mission-control-router" ;;
    linux)   ROUTER_INSTALL_DIR="/opt/mission-control-router"  ;;
  esac
fi

if [ -z "$MC_INSTALL_DIR" ]; then
  case "$OS" in
    mac|wsl) MC_INSTALL_DIR="$HOME/mission-control-ui" ;;
    linux)   MC_INSTALL_DIR="/opt/mission-control-ui"  ;;
  esac
fi

clear
echo ""
echo -e "${BOLD}${CYAN}  Mission Control — Full Installer${RESET}  ${CYAN}(${OS})${RESET}"
echo -e "  ${CYAN}════════════════════════════════════════${RESET}"
echo ""

# ── Dependency checks ────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js not found. Install Node 18+: https://nodejs.org"
command -v npm  >/dev/null 2>&1 || error "npm not found."
command -v git  >/dev/null 2>&1 || error "git not found."
node -e "if(parseInt(process.versions.node)<18)process.exit(1)" 2>/dev/null \
  || error "Node.js 18+ required (current: $(node --version))"

info "Node $(node --version) · npm $(npm --version) · OS: $OS"
echo ""

# ── Collect all config upfront ───────────────────────────────
if $INSTALL_ROUTER; then
  echo -e "  ${BOLD}Step 1 of 2 — Router config${RESET}"
  echo ""

  if [ -z "$OPENCLAW_URL" ]; then
    printf "  OpenClaw URL   [http://127.0.0.1:18789]: "
    read -r INPUT_URL
    OPENCLAW_URL="${INPUT_URL:-http://127.0.0.1:18789}"
  fi

  while [ -z "$OPENCLAW_TOKEN" ]; do
    printf "  OpenClaw Token (input hidden): "
    read -rs OPENCLAW_TOKEN
    echo ""
    [ -z "$OPENCLAW_TOKEN" ] && echo -e "  ${YELLOW}Token cannot be empty.${RESET}"
  done

  if [ -z "$ROUTER_PORT" ]; then
    printf "  Router port    [3010]: "
    read -r INPUT_PORT
    ROUTER_PORT="${INPUT_PORT:-3010}"
  fi
  echo ""
fi

if $INSTALL_UI; then
  echo -e "  ${BOLD}Step 2 of 2 — Mission Control config${RESET}"
  echo ""

  if [ -z "$MC_PORT" ]; then
    printf "  Mission Control port [3000]: "
    read -r INPUT_MC_PORT
    MC_PORT="${INPUT_MC_PORT:-3000}"
  fi
  echo ""
fi

# ─────────────────────────────────────────────────────────────
#  PART 1: ROUTER
# ─────────────────────────────────────────────────────────────
if $INSTALL_ROUTER; then
  header "Installing Router"

  info "Installing to ${ROUTER_INSTALL_DIR} …"
  if [ -d "$ROUTER_INSTALL_DIR" ]; then
    warn "Directory exists — updating in place."
  else
    if [ "$OS" = "linux" ]; then
      sudo mkdir -p "$ROUTER_INSTALL_DIR"
      sudo chown "$USER":"$USER" "$ROUTER_INSTALL_DIR"
    else
      mkdir -p "$ROUTER_INSTALL_DIR"
    fi
  fi

  TMP_ROUTER=$(mktemp -d)
  trap "rm -rf $TMP_ROUTER; stty echo 2>/dev/null || true" EXIT INT TERM

  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_ROUTER" -q
  (cd "$TMP_ROUTER" && git sparse-checkout set router)
  cp -r "$TMP_ROUTER/router/." "$ROUTER_INSTALL_DIR/"
  rm -rf "$TMP_ROUTER"
  trap "" EXIT INT TERM

  info "Installing router dependencies …"
  (cd "$ROUTER_INSTALL_DIR" && npm install 2>&1 | tail -3)

  info "Installing TypeScript globally …"
  npm install -g typescript --silent

  info "Building router …"
  (cd "$ROUTER_INSTALL_DIR" && ./node_modules/.bin/tsc || tsc)

  info "Pruning dev dependencies …"
  (cd "$ROUTER_INSTALL_DIR" && npm prune --omit=dev --silent 2>/dev/null || true)

  cat > "$ROUTER_INSTALL_DIR/.env" <<EOF
OPENCLAW_URL=${OPENCLAW_URL}
OPENCLAW_TOKEN=${OPENCLAW_TOKEN}
ROUTER_PORT=${ROUTER_PORT}
EOF
  success "Router config written."

  if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing pm2 …"
    npm install -g pm2 --silent
  fi

  pm2 stop  mission-control-router 2>/dev/null || true
  pm2 delete mission-control-router 2>/dev/null || true
  pm2 start "$ROUTER_INSTALL_DIR/dist/server.js" \
    --name mission-control-router \
    --cwd  "$ROUTER_INSTALL_DIR" \
    --restart-delay 3000 \
    --silent
  pm2 save --force >/dev/null

  # Auto-start
  if [ "$OS" = "mac" ]; then
    pm2 startup launchd 2>/dev/null | grep -E "^sudo" | bash 2>/dev/null || true
  elif [ "$OS" != "wsl" ]; then
    PM2_STARTUP=$(pm2 startup 2>/dev/null | grep "^sudo" || true)
    [ -n "$PM2_STARTUP" ] && eval "$PM2_STARTUP" >/dev/null 2>&1 || true
  fi

  success "Router started."

  # Health check
  info "Waiting for router to come online …"
  for i in $(seq 1 12); do
    sleep 1
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ROUTER_PORT}/health" 2>/dev/null || true)
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then break; fi
    printf "."
  done
  echo ""

  # Wait for token
  info "Waiting for router token …"
  TOKEN_FILE="$ROUTER_INSTALL_DIR/.router-token"
  ROUTER_TOKEN=""
  for i in $(seq 1 10); do
    sleep 1
    if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
      ROUTER_TOKEN=$(cat "$TOKEN_FILE")
      break
    fi
  done

  # Detect IP
  ROUTER_IP=""
  case "$OS" in
    mac)
      for iface in en0 en1 en2; do
        ROUTER_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
        [ -n "$ROUTER_IP" ] && break
      done ;;
    wsl)
      ROUTER_IP=$(ip route show | grep -i default | awk '{print $3}' 2>/dev/null || true)
      [ -z "$ROUTER_IP" ] && ROUTER_IP=$(hostname -I 2>/dev/null | awk '{print $1}') ;;
    linux)
      ROUTER_IP=$(hostname -I 2>/dev/null | awk '{print $1}') ;;
  esac
  [ -z "$ROUTER_IP" ] && ROUTER_IP="<your-ip>"
  ROUTER_URL="http://${ROUTER_IP}:${ROUTER_PORT}"

  cat > "$ROUTER_INSTALL_DIR/.env.local" <<EOF
ROUTER_URL=${ROUTER_URL}
ROUTER_TOKEN=${ROUTER_TOKEN}
EOF
  success "Router installed at ${ROUTER_URL}"
fi

# ─────────────────────────────────────────────────────────────
#  PART 2: MISSION CONTROL UI
# ─────────────────────────────────────────────────────────────
if $INSTALL_UI; then
  header "Installing Mission Control UI"

  info "Installing to ${MC_INSTALL_DIR} …"
  if [ -d "$MC_INSTALL_DIR" ]; then
    warn "Directory exists — updating in place."
  else
    if [ "$OS" = "linux" ]; then
      sudo mkdir -p "$MC_INSTALL_DIR"
      sudo chown "$USER":"$USER" "$MC_INSTALL_DIR"
    else
      mkdir -p "$MC_INSTALL_DIR"
    fi
  fi

  TMP_UI=$(mktemp -d)
  trap "rm -rf $TMP_UI" EXIT INT TERM

  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_UI" -q
  (cd "$TMP_UI" && git sparse-checkout set \
    app components lib public \
    next.config.ts tsconfig.json package.json \
    tailwind.config.ts postcss.config.mjs)
  cp -r "$TMP_UI/." "$MC_INSTALL_DIR/"
  rm -rf "$TMP_UI"
  trap "" EXIT INT TERM

  info "Installing UI dependencies …"
  (cd "$MC_INSTALL_DIR" && npm install 2>&1 | tail -3)

  info "Building UI … (this may take a minute)"
  (cd "$MC_INSTALL_DIR" && npm run build 2>&1 | tail -5)

  info "Preparing standalone build …"
  cp -r "$MC_INSTALL_DIR/.next/static" "$MC_INSTALL_DIR/.next/standalone/.next/static"
  cp -r "$MC_INSTALL_DIR/public"       "$MC_INSTALL_DIR/.next/standalone/public" 2>/dev/null || true

  cat > "$MC_INSTALL_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: 'mission-control-ui',
    script: '.next/standalone/server.js',
    cwd: '${MC_INSTALL_DIR}',
    env: { PORT: ${MC_PORT}, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' },
    restart_delay: 3000,
  }]
};
EOF

  pm2 stop  mission-control-ui 2>/dev/null || true
  pm2 delete mission-control-ui 2>/dev/null || true
  pm2 start "$MC_INSTALL_DIR/ecosystem.config.cjs" --silent
  pm2 save --force >/dev/null

  # Auto-start
  if [ "$OS" = "mac" ]; then
    pm2 startup launchd 2>/dev/null | grep -E "^sudo" | bash 2>/dev/null || true
  elif [ "$OS" != "wsl" ]; then
    PM2_STARTUP=$(pm2 startup 2>/dev/null | grep "^sudo" || true)
    [ -n "$PM2_STARTUP" ] && eval "$PM2_STARTUP" >/dev/null 2>&1 || true
  fi

  success "Mission Control UI started."

  # Health check
  info "Waiting for Mission Control to come online …"
  MC_HEALTHY=0
  for i in $(seq 1 15); do
    sleep 1
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${MC_PORT}" 2>/dev/null || true)
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "307" ]; then MC_HEALTHY=1; break; fi
    printf "."
  done
  echo ""
  [ "$MC_HEALTHY" = "0" ] && warn "UI health check timed out — check 'pm2 logs mission-control-ui'"

  # Detect IP
  MC_IP=""
  case "$OS" in
    mac)
      for iface in en0 en1 en2; do
        MC_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
        [ -n "$MC_IP" ] && break
      done ;;
    wsl)
      MC_IP=$(ip route show | grep -i default | awk '{print $3}' 2>/dev/null || true)
      [ -z "$MC_IP" ] && MC_IP=$(hostname -I 2>/dev/null | awk '{print $1}') ;;
    linux)
      MC_IP=$(hostname -I 2>/dev/null | awk '{print $1}') ;;
  esac
  [ -z "$MC_IP" ] && MC_IP="<your-ip>"
  MC_URL="http://${MC_IP}:${MC_PORT}"
fi

# ─────────────────────────────────────────────────────────────
#  FINAL SUMMARY
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}✓ Mission Control is ready!${RESET}                        ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"

if $INSTALL_UI; then
  echo -e "${GREEN}  ║${RESET}  ${BOLD}Open Mission Control:${RESET}                              ${GREEN}║${RESET}"
  echo -e "${GREEN}  ║${RESET}  ${CYAN}${MC_URL}${RESET}"
  echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
fi

if $INSTALL_ROUTER; then
  echo -e "${GREEN}  ║${RESET}  ${BOLD}Then click + Router and enter:${RESET}                     ${GREEN}║${RESET}"
  echo -e "${GREEN}  ║${RESET}  URL:   ${CYAN}${ROUTER_URL}${RESET}"
  echo -e "${GREEN}  ║${RESET}  Token: ${CYAN}${ROUTER_TOKEN:-"(cat ${ROUTER_INSTALL_DIR}/.router-token)"}${RESET}"
  echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
fi

echo -e "${GREEN}  ║${RESET}  ${BOLD}Manage processes:${RESET}                                  ${GREEN}║${RESET}"
[ "$INSTALL_ROUTER" = "true" ] && \
  echo -e "${GREEN}  ║${RESET}  pm2 logs mission-control-router                    ${GREEN}║${RESET}"
[ "$INSTALL_UI" = "true" ] && \
  echo -e "${GREEN}  ║${RESET}  pm2 logs mission-control-ui                        ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
