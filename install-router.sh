#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control Router — one-command installer
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/install-router.sh | bash
# ─────────────────────────────────────────────────────────────

INSTALL_DIR="${ROUTER_INSTALL_DIR:-/opt/mission-control-router}"
REPO="https://github.com/ykbryan/mission-control-for-agents.git"

GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }

clear
echo ""
echo -e "${BOLD}${CYAN}  Mission Control Router${RESET}"
echo -e "  ${CYAN}────────────────────────────────────────${RESET}"
echo ""

# ── Dependency checks ────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js not found. Install Node 18+ first: https://nodejs.org"
command -v npm  >/dev/null 2>&1 || error "npm not found."
command -v git  >/dev/null 2>&1 || error "git not found."
node -e "if(parseInt(process.versions.node)<18)process.exit(1)" 2>/dev/null \
  || error "Node.js 18+ required (current: $(node --version))"

# ── Interactive config ───────────────────────────────────────
echo -e "  ${BOLD}OpenClaw connection${RESET}"
echo ""

# OPENCLAW_URL
if [ -z "$OPENCLAW_URL" ]; then
  read -rp "  OpenClaw URL   [http://127.0.0.1:18789]: " INPUT_URL
  OPENCLAW_URL="${INPUT_URL:-http://127.0.0.1:18789}"
fi

# OPENCLAW_TOKEN
if [ -z "$OPENCLAW_TOKEN" ]; then
  read -rsp "  OpenClaw Token: " OPENCLAW_TOKEN
  echo ""
fi

[ -z "$OPENCLAW_TOKEN" ] && error "OpenClaw token is required."

# ROUTER_PORT
if [ -z "$ROUTER_PORT" ]; then
  read -rp "  Router port    [3010]: " INPUT_PORT
  ROUTER_PORT="${INPUT_PORT:-3010}"
fi

echo ""

# ── Install ──────────────────────────────────────────────────
info "Installing to ${INSTALL_DIR} …"

if [ -d "$INSTALL_DIR" ]; then
  warn "Directory exists — updating in place."
else
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$USER":"$USER" "$INSTALL_DIR"
fi

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" -q
(cd "$TMP_DIR" && git sparse-checkout set router -q)
cp -r "$TMP_DIR/router/." "$INSTALL_DIR/"

info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install --omit=dev --silent)

info "Building …"
(cd "$INSTALL_DIR" && npm run build --silent)

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
# Register startup script (non-fatal)
PM2_STARTUP=$(pm2 startup 2>/dev/null | grep "sudo" || true)
if [ -n "$PM2_STARTUP" ]; then
  info "Enabling auto-start on reboot …"
  eval "$PM2_STARTUP" >/dev/null 2>&1 || warn "Run manually: $PM2_STARTUP"
fi

success "Router is running."

# ── Print token ──────────────────────────────────────────────
sleep 1   # let the process write the token file
TOKEN_FILE="$INSTALL_DIR/.router-token"
ROUTER_TOKEN=""
if [ -f "$TOKEN_FILE" ]; then
  ROUTER_TOKEN=$(cat "$TOKEN_FILE")
fi

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║   Router installed and running!                     ║${RESET}"
echo -e "${GREEN}  ╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  URL:    http://$(hostname -I | awk '{print $1}'):${ROUTER_PORT}"
echo -e "${GREEN}  ║${RESET}  Token:  ${BOLD}${ROUTER_TOKEN:-"(check: pm2 logs mission-control-router)"}${RESET}"
echo -e "${GREEN}  ╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  In Mission Control click ${BOLD}+ Router${RESET} and enter the"
echo -e "${GREEN}  ║${RESET}  URL and Token above."
echo -e "${GREEN}  ╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  Useful commands:"
echo -e "${GREEN}  ║${RESET}    pm2 logs mission-control-router"
echo -e "${GREEN}  ║${RESET}    pm2 restart mission-control-router"
echo -e "${GREEN}  ║${RESET}    pm2 stop mission-control-router"
echo -e "${GREEN}  ╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
