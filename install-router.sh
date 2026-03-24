#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control Router — one-command installer
#  Supports: macOS · Linux (Ubuntu/Debian/RHEL) · WSL
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/install-router.sh | bash
# ─────────────────────────────────────────────────────────────

if [[ "${1}" == "--help" || "${1}" == "-h" ]]; then
  echo ""
  echo "  Mission Control Router — Installer"
  echo ""
  echo "  Usage: bash install-router.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --help, -h          Show this help message"
  echo ""
  echo "  Environment overrides (skip prompts):"
  echo "    OPENCLAW_URL        OpenClaw gateway URL  (default: http://127.0.0.1:18789)"
  echo "    OPENCLAW_TOKEN      OpenClaw bearer token (required)"
  echo "    ROUTER_PORT         Port for this router  (default: 3010)"
  echo "    ROUTER_INSTALL_DIR  Custom install directory"
  echo ""
  echo "  Example (non-interactive):"
  echo "    OPENCLAW_URL=http://127.0.0.1:18789 \\"
  echo "    OPENCLAW_TOKEN=mytoken \\"
  echo "    ROUTER_PORT=3010 \\"
  echo "    bash install-router.sh"
  echo ""
  exit 0
fi

REPO="https://github.com/ykbryan/mission-control-for-agents.git"

GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }

# ── Detect OS ────────────────────────────────────────────────
OS="linux"
case "$(uname -s)" in
  Darwin) OS="mac" ;;
  Linux)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      OS="wsl"
    else
      OS="linux"
    fi
    ;;
  MINGW*|CYGWIN*|MSYS*)
    echo ""
    echo -e "${YELLOW}  Windows detected.${RESET}"
    echo -e "  This script requires WSL (Windows Subsystem for Linux)."
    echo -e "  Open a WSL terminal and re-run this command."
    echo ""
    exit 1
    ;;
esac

# Default install dir per OS
if [ -z "$ROUTER_INSTALL_DIR" ]; then
  case "$OS" in
    mac)   INSTALL_DIR="$HOME/mission-control-router" ;;
    wsl)   INSTALL_DIR="$HOME/mission-control-router" ;;
    linux) INSTALL_DIR="/opt/mission-control-router"  ;;
  esac
else
  INSTALL_DIR="$ROUTER_INSTALL_DIR"
fi

clear
echo ""
echo -e "${BOLD}${CYAN}  Mission Control Router${RESET}  ${CYAN}(${OS})${RESET}"
echo -e "  ${CYAN}────────────────────────────────────────${RESET}"
echo ""

# ── Dependency checks ────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js not found. Install Node 18+: https://nodejs.org"
command -v npm  >/dev/null 2>&1 || error "npm not found."
command -v git  >/dev/null 2>&1 || error "git not found."
node -e "if(parseInt(process.versions.node)<18)process.exit(1)" 2>/dev/null \
  || error "Node.js 18+ required (current: $(node --version))"

info "Node $(node --version) · npm $(npm --version) · OS: $OS"
echo ""

# ── Interactive config ───────────────────────────────────────
echo -e "  ${BOLD}OpenClaw connection${RESET}"
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
  [ -z "$OPENCLAW_TOKEN" ] && echo -e "  ${YELLOW}Token cannot be empty, please try again.${RESET}"
done

if [ -z "$ROUTER_PORT" ]; then
  printf "  Router port    [3010]: "
  read -r INPUT_PORT
  ROUTER_PORT="${INPUT_PORT:-3010}"
fi

echo ""

# ── Create install directory ─────────────────────────────────
info "Installing to ${INSTALL_DIR} …"

if [ -d "$INSTALL_DIR" ]; then
  warn "Directory exists — updating in place."
else
  if [ "$OS" = "linux" ]; then
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown "$USER":"$USER" "$INSTALL_DIR"
  else
    mkdir -p "$INSTALL_DIR"
  fi
fi

# ── Clone router folder only ─────────────────────────────────
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR; stty echo 2>/dev/null || true" EXIT INT TERM

git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" -q
(cd "$TMP_DIR" && git sparse-checkout set router)
cp -r "$TMP_DIR/router/." "$INSTALL_DIR/"

# ── Install & build ──────────────────────────────────────────
info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install 2>&1 | tail -5)

info "Installing TypeScript globally …"
npm install -g typescript --silent

info "Building …"
(cd "$INSTALL_DIR" && ./node_modules/.bin/tsc || tsc)

info "Pruning dev dependencies …"
(cd "$INSTALL_DIR" && npm prune --omit=dev --silent 2>/dev/null || true)

# ── Write .env ───────────────────────────────────────────────
cat > "$INSTALL_DIR/.env" <<EOF
OPENCLAW_URL=${OPENCLAW_URL}
OPENCLAW_TOKEN=${OPENCLAW_TOKEN}
ROUTER_PORT=${ROUTER_PORT}
EOF
success "Config written."

# ── pm2 ─────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  info "Installing pm2 …"
  npm install -g pm2 --silent
fi

pm2 stop  mission-control-router 2>/dev/null || true
pm2 delete mission-control-router 2>/dev/null || true

pm2 start "$INSTALL_DIR/dist/server.js" \
  --name mission-control-router \
  --cwd  "$INSTALL_DIR" \
  --restart-delay 3000 \
  --silent

pm2 save --force >/dev/null

# Auto-start on reboot (best-effort, OS-aware)
if [ "$OS" = "mac" ]; then
  pm2 startup launchd 2>/dev/null | grep -E "^sudo" | bash 2>/dev/null \
    || warn "To enable auto-start on Mac: run 'pm2 startup' and follow its instructions."
elif [ "$OS" = "wsl" ]; then
  warn "WSL: pm2 auto-start not supported. Start manually with: pm2 start mission-control-router"
else
  PM2_STARTUP=$(pm2 startup 2>/dev/null | grep "^sudo" || true)
  if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP" >/dev/null 2>&1 \
      || warn "Auto-start not set. Run manually: $PM2_STARTUP"
  fi
fi

success "Router is running."

# ── Health check ─────────────────────────────────────────────
info "Waiting for router to come online …"
HEALTHY=0
for i in $(seq 1 12); do
  sleep 1
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ROUTER_PORT}/health" 2>/dev/null || true)
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then
    HEALTHY=1
    break
  fi
  printf "."
done
echo ""
[ "$HEALTHY" = "0" ] && warn "Router health check timed out — check 'pm2 logs mission-control-router'"

# ── Wait for token ───────────────────────────────────────────
info "Waiting for router to generate token …"
TOKEN_FILE="$INSTALL_DIR/.router-token"
ROUTER_TOKEN=""
for i in $(seq 1 10); do
  sleep 1
  if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
    ROUTER_TOKEN=$(cat "$TOKEN_FILE")
    break
  fi
done

# ── Detect local IP (OS-aware) ───────────────────────────────
ROUTER_IP=""
case "$OS" in
  mac)
    for iface in en0 en1 en2; do
      ROUTER_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      [ -n "$ROUTER_IP" ] && break
    done
    ;;
  wsl)
    ROUTER_IP=$(ip route show | grep -i default | awk '{print $3}' 2>/dev/null || true)
    [ -z "$ROUTER_IP" ] && ROUTER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    ;;
  linux)
    ROUTER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    ;;
esac
[ -z "$ROUTER_IP" ] && ROUTER_IP="<your-ip>"

ROUTER_URL="http://${ROUTER_IP}:${ROUTER_PORT}"

# ── Write .env.local with connection details ──────────────────
cat > "$INSTALL_DIR/.env.local" <<EOF
# Mission Control Router — connection details
# Paste these into Mission Control > + Router

ROUTER_URL=${ROUTER_URL}
ROUTER_TOKEN=${ROUTER_TOKEN}
EOF
success "Connection details saved to ${INSTALL_DIR}/.env.local"

# ── Final output ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}✓ Router installed and running!${RESET}                    ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  Paste into Mission Control  →  ${BOLD}+ Router${RESET}            ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}Router URL${RESET}                                         ${GREEN}║${RESET}"
echo -e "${GREEN}  ║${RESET}  ${CYAN}${ROUTER_URL}${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}Router Token${RESET}                                       ${GREEN}║${RESET}"
echo -e "${GREEN}  ║${RESET}  ${CYAN}${ROUTER_TOKEN:-"(run: cat ${INSTALL_DIR}/.router-token)"}${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  Saved to: ${CYAN}${INSTALL_DIR}/.env.local${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 logs    mission-control-router               ${GREEN}║${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 restart mission-control-router               ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
