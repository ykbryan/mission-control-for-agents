#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control Router — installer
#  Run this on the same machine as your OpenClaw gateway.
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/install-router.sh | bash
#  or:
#    bash install-router.sh
# ─────────────────────────────────────────────────────────────

INSTALL_DIR="${ROUTER_INSTALL_DIR:-/opt/mission-control-router}"
REPO="https://github.com/ykbryan/mission-control-for-agents.git"
PM2_ENABLED=true

GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${CYAN}[router]${RESET} $*"; }
success() { echo -e "${GREEN}[router]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[router]${RESET} $*"; }
error()   { echo -e "${RED}[router]${RESET} $*"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║       Mission Control Router — Installer             ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Check dependencies ───────────────────────────────────────
command -v node  >/dev/null 2>&1 || error "Node.js is not installed. Install it first: https://nodejs.org"
command -v npm   >/dev/null 2>&1 || error "npm is not installed."
command -v git   >/dev/null 2>&1 || error "git is not installed."

NODE_VER=$(node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>&1) \
  || error "Node.js 18+ is required. Current: $(node --version)"

info "Node $(node --version) / npm $(npm --version) detected."

# ── Create install directory ─────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  warn "Directory $INSTALL_DIR already exists — updating in place."
else
  info "Creating $INSTALL_DIR …"
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$USER":"$USER" "$INSTALL_DIR"
fi

# ── Clone or update repo ─────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

info "Fetching latest router from GitHub …"
git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" 2>/dev/null
(cd "$TMP_DIR" && git sparse-checkout set router)

info "Copying router files to $INSTALL_DIR …"
cp -r "$TMP_DIR/router/." "$INSTALL_DIR/"

# ── Install npm dependencies ─────────────────────────────────
info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install --omit=dev 2>&1 | tail -3)

# ── Build ────────────────────────────────────────────────────
info "Building …"
(cd "$INSTALL_DIR" && npm run build 2>&1 | tail -5)

# ── Create .env if missing ───────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Creating .env from template …"
  cp "$INSTALL_DIR/.env.example" "$ENV_FILE"
  warn "Edit $ENV_FILE and set OPENCLAW_URL and OPENCLAW_TOKEN before starting."
else
  info ".env already exists — skipping (not overwritten)."
fi

# ── pm2 setup ────────────────────────────────────────────────
if $PM2_ENABLED; then
  if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing pm2 globally …"
    npm install -g pm2 2>&1 | tail -2
  fi

  # Stop existing instance if running
  pm2 stop mission-control-router 2>/dev/null || true
  pm2 delete mission-control-router 2>/dev/null || true

  info "Registering mission-control-router with pm2 …"
  pm2 start "$INSTALL_DIR/dist/server.js" \
    --name mission-control-router \
    --cwd "$INSTALL_DIR" \
    --restart-delay 3000

  pm2 save
  pm2 startup 2>/dev/null | grep -v "^\[PM2\]" || true
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║   Router installed successfully!                     ║${RESET}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}║${RESET}  Install dir : $INSTALL_DIR"
echo -e "${GREEN}║${RESET}  Config file : $ENV_FILE"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}║${RESET}  Next steps:"
echo -e "${GREEN}║${RESET}    1. Edit $ENV_FILE"
echo -e "${GREEN}║${RESET}       Set OPENCLAW_URL and OPENCLAW_TOKEN"
echo -e "${GREEN}║${RESET}    2. Restart the router:"
echo -e "${GREEN}║${RESET}       pm2 restart mission-control-router"
echo -e "${GREEN}║${RESET}    3. Check logs:"
echo -e "${GREEN}║${RESET}       pm2 logs mission-control-router"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
