#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control UI — one-command updater
#  Run this on the machine where Mission Control is installed.
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/update-missioncontrol.sh | bash
# ─────────────────────────────────────────────────────────────

if [[ "${1}" == "--help" || "${1}" == "-h" ]]; then
  echo ""
  echo "  Mission Control UI — Updater"
  echo ""
  echo "  Usage: bash update-missioncontrol.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --help, -h          Show this help message"
  echo ""
  echo "  Environment overrides:"
  echo "    MC_INSTALL_DIR      Custom install directory"
  echo ""
  exit 0
fi

REPO="https://github.com/ykbryan/mission-control-for-agents.git"
GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }

# ── Detect install dir ────────────────────────────────────────
if [ -n "$MC_INSTALL_DIR" ]; then
  INSTALL_DIR="$MC_INSTALL_DIR"
elif [ -d "$HOME/mission-control-ui" ]; then
  INSTALL_DIR="$HOME/mission-control-ui"
elif [ -d "/opt/mission-control-ui" ]; then
  INSTALL_DIR="/opt/mission-control-ui"
else
  error "Mission Control install directory not found. Set MC_INSTALL_DIR or reinstall with install-missioncontrol.sh"
fi

echo ""
echo -e "${BOLD}${CYAN}  Mission Control UI — Update${RESET}"
echo -e "  ${CYAN}────────────────────────────────────────${RESET}"
echo ""
info "Install dir: $INSTALL_DIR"

# ── Read current port from ecosystem config ───────────────────
MC_PORT=$(node -e "const c=require('${INSTALL_DIR}/ecosystem.config.cjs'); console.log(c.apps[0].env.PORT||3000)" 2>/dev/null || echo "3000")

# ── Pull latest source ────────────────────────────────────────
info "Fetching latest source …"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT INT TERM

git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" -q
(cd "$TMP_DIR" && git sparse-checkout set \
  app components lib public \
  next.config.ts tsconfig.json package.json \
  tailwind.config.ts postcss.config.mjs)

# Sync source files, preserve ecosystem config and .env.local
rsync -a --exclude='.next' --exclude='node_modules' \
  --exclude='ecosystem.config.cjs' --exclude='.env.local' \
  "$TMP_DIR/" "$INSTALL_DIR/" 2>/dev/null \
  || cp -r "$TMP_DIR/." "$INSTALL_DIR/"

success "Source updated."

# ── Install dependencies ──────────────────────────────────────
info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install 2>&1 | tail -3)

# ── Build ─────────────────────────────────────────────────────
info "Building … (this may take a minute)"
(cd "$INSTALL_DIR" && npm run build 2>&1 | tail -5)
success "Build complete."

# ── Update standalone static assets ──────────────────────────
info "Preparing standalone build …"
cp -r "$INSTALL_DIR/.next/static" "$INSTALL_DIR/.next/standalone/.next/static"
cp -r "$INSTALL_DIR/public"       "$INSTALL_DIR/.next/standalone/public" 2>/dev/null || true

# ── Restart ───────────────────────────────────────────────────
info "Restarting Mission Control …"
pm2 restart mission-control-ui --silent
pm2 save --force >/dev/null
success "Mission Control restarted."

# ── Health check ─────────────────────────────────────────────
info "Checking Mission Control health on port ${MC_PORT} …"
HEALTHY=0
for i in $(seq 1 15); do
  sleep 1
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${MC_PORT}" 2>/dev/null || true)
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "307" ]; then
    HEALTHY=1; break
  fi
  printf "."
done
echo ""
[ "$HEALTHY" = "0" ] && warn "Health check timed out — check 'pm2 logs mission-control-ui'"
[ "$HEALTHY" = "1" ] && success "Mission Control is healthy."

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}✓ Mission Control updated!${RESET}             ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠══════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 logs mission-control-ui           ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚══════════════════════════════════════════╝${RESET}"
echo ""
