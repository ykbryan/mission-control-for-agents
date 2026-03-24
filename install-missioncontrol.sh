#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control UI — one-command installer
#  Supports: macOS · Linux (Ubuntu/Debian/RHEL) · WSL
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/install-missioncontrol.sh | bash
# ─────────────────────────────────────────────────────────────

if [[ "${1}" == "--help" || "${1}" == "-h" ]]; then
  echo ""
  echo "  Mission Control UI — Installer"
  echo ""
  echo "  Usage: bash install-missioncontrol.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --help, -h          Show this help message"
  echo ""
  echo "  Environment overrides (skip prompts):"
  echo "    MC_PORT             Port for Mission Control  (default: 3000)"
  echo "    MC_INSTALL_DIR      Custom install directory"
  echo ""
  echo "  Example (non-interactive):"
  echo "    MC_PORT=3000 bash install-missioncontrol.sh"
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
    echo -e "${YELLOW}  Windows detected. Use WSL and re-run this command.${RESET}"
    exit 1
    ;;
esac

# Default install dir per OS
if [ -z "$MC_INSTALL_DIR" ]; then
  case "$OS" in
    mac)   INSTALL_DIR="$HOME/mission-control-ui" ;;
    wsl)   INSTALL_DIR="$HOME/mission-control-ui" ;;
    linux) INSTALL_DIR="/opt/mission-control-ui"  ;;
  esac
else
  INSTALL_DIR="$MC_INSTALL_DIR"
fi

clear
echo ""
echo -e "${BOLD}${CYAN}  Mission Control UI${RESET}  ${CYAN}(${OS})${RESET}"
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
if [ -z "$MC_PORT" ]; then
  printf "  Mission Control port [3000]: "
  read -r INPUT_PORT
  MC_PORT="${INPUT_PORT:-3000}"
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

# ── Clone (exclude router to save space) ─────────────────────
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT INT TERM

info "Cloning repository …"
git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" -q
(cd "$TMP_DIR" && git sparse-checkout set \
  app components lib public \
  next.config.ts tsconfig.json package.json \
  tailwind.config.ts postcss.config.mjs)
cp -r "$TMP_DIR/." "$INSTALL_DIR/"

# ── Install & build ──────────────────────────────────────────
info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install 2>&1 | tail -5)

info "Building … (this may take a minute)"
(cd "$INSTALL_DIR" && npm run build 2>&1 | tail -10)

# Copy static assets into standalone output (required for Next.js standalone)
info "Preparing standalone build …"
cp -r "$INSTALL_DIR/.next/static"  "$INSTALL_DIR/.next/standalone/.next/static"
cp -r "$INSTALL_DIR/public"        "$INSTALL_DIR/.next/standalone/public" 2>/dev/null || true

# ── Write pm2 ecosystem config ───────────────────────────────
cat > "$INSTALL_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: 'mission-control-ui',
    script: '.next/standalone/server.js',
    cwd: '${INSTALL_DIR}',
    env: {
      PORT: ${MC_PORT},
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
    },
    restart_delay: 3000,
  }]
};
EOF
success "pm2 ecosystem config written."

# ── pm2 ─────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  info "Installing pm2 …"
  npm install -g pm2 --silent
fi

pm2 stop  mission-control-ui 2>/dev/null || true
pm2 delete mission-control-ui 2>/dev/null || true

pm2 start "$INSTALL_DIR/ecosystem.config.cjs" --silent
pm2 save --force >/dev/null

# Auto-start on reboot
if [ "$OS" = "mac" ]; then
  pm2 startup launchd 2>/dev/null | grep -E "^sudo" | bash 2>/dev/null \
    || warn "To enable auto-start on Mac: run 'pm2 startup' and follow instructions."
elif [ "$OS" = "wsl" ]; then
  warn "WSL: pm2 auto-start not supported. Start manually: pm2 start mission-control-ui"
else
  PM2_STARTUP=$(pm2 startup 2>/dev/null | grep "^sudo" || true)
  if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP" >/dev/null 2>&1 \
      || warn "Auto-start not set. Run manually: $PM2_STARTUP"
  fi
fi

success "Mission Control is running."

# ── Health check ─────────────────────────────────────────────
info "Waiting for Mission Control to come online …"
HEALTHY=0
for i in $(seq 1 15); do
  sleep 1
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${MC_PORT}" 2>/dev/null || true)
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "307" ]; then
    HEALTHY=1
    break
  fi
  printf "."
done
echo ""
[ "$HEALTHY" = "0" ] && warn "Health check timed out — check 'pm2 logs mission-control-ui'"

# ── Detect local IP ──────────────────────────────────────────
MC_IP=""
case "$OS" in
  mac)
    for iface in en0 en1 en2; do
      MC_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      [ -n "$MC_IP" ] && break
    done
    ;;
  wsl)
    MC_IP=$(ip route show | grep -i default | awk '{print $3}' 2>/dev/null || true)
    [ -z "$MC_IP" ] && MC_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    ;;
  linux)
    MC_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    ;;
esac
[ -z "$MC_IP" ] && MC_IP="<your-ip>"

MC_URL="http://${MC_IP}:${MC_PORT}"

# ── Final output ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}✓ Mission Control installed and running!${RESET}           ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  Open in your browser:                              ${GREEN}║${RESET}"
echo -e "${GREEN}  ║${RESET}  ${CYAN}${MC_URL}${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  Then click ${BOLD}+ Router${RESET} to connect your router.          ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 logs    mission-control-ui                    ${GREEN}║${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 restart mission-control-ui                    ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
