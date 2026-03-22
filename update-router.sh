#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control Router — one-command updater
#  Run this on the machine where the router is installed.
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/update-router.sh -o /tmp/update-router.sh && bash /tmp/update-router.sh
# ─────────────────────────────────────────────────────────────

REPO="https://github.com/ykbryan/mission-control-for-agents.git"
GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }

# ── Detect install dir ────────────────────────────────────────
if [ -n "$ROUTER_INSTALL_DIR" ]; then
  INSTALL_DIR="$ROUTER_INSTALL_DIR"
elif [ -d "$HOME/mission-control-router" ]; then
  INSTALL_DIR="$HOME/mission-control-router"
elif [ -d "/opt/mission-control-router" ]; then
  INSTALL_DIR="/opt/mission-control-router"
else
  error "Router install directory not found. Set ROUTER_INSTALL_DIR or reinstall."
fi

echo ""
echo -e "${BOLD}${CYAN}  Mission Control Router — Update${RESET}"
echo -e "  ${CYAN}────────────────────────────────────────${RESET}"
echo ""
info "Install dir: $INSTALL_DIR"

# ── Pull latest router source ────────────────────────────────
info "Fetching latest source …"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT INT TERM

git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP_DIR" -q
(cd "$TMP_DIR" && git sparse-checkout set router)

# Preserve .env and token
cp "$TMP_DIR/router/." "$INSTALL_DIR/" -r --no-clobber 2>/dev/null || true
# Force-copy source files only
cp -r "$TMP_DIR/router/src" "$INSTALL_DIR/"
cp    "$TMP_DIR/router/tsconfig.json" "$INSTALL_DIR/"
cp    "$TMP_DIR/router/package.json"  "$INSTALL_DIR/"
success "Source updated."

# ── Install deps (including dev for build) ────────────────────
info "Installing dependencies …"
(cd "$INSTALL_DIR" && npm install 2>&1 | tail -3)

# ── Build ─────────────────────────────────────────────────────
info "Building …"
(cd "$INSTALL_DIR" && ./node_modules/.bin/tsc || tsc)
success "Build complete."

# ── Prune dev deps ────────────────────────────────────────────
info "Pruning dev dependencies …"
(cd "$INSTALL_DIR" && npm prune --omit=dev --silent 2>/dev/null || true)

# ── Restart ───────────────────────────────────────────────────
info "Restarting router …"
pm2 restart mission-control-router --silent
pm2 save --force >/dev/null
success "Router restarted."

echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}Router updated successfully!${RESET}        ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 logs mission-control-router    ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚═══════════════════════════════════════╝${RESET}"
echo ""
