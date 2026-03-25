#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
#  Mission Control — full updater (Router + UI)
#  Run this on the machine where Mission Control is installed.
#
#  curl -fsSL https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main/update.sh | bash
# ─────────────────────────────────────────────────────────────

if [[ "${1}" == "--help" || "${1}" == "-h" ]]; then
  echo ""
  echo "  Mission Control — Full Updater (Router + UI)"
  echo ""
  echo "  Usage: bash update.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --help, -h          Show this help message"
  echo "    --router-only       Update only the router"
  echo "    --ui-only           Update only the Mission Control UI"
  echo ""
  echo "  Environment overrides:"
  echo "    ROUTER_INSTALL_DIR  Custom router install directory"
  echo "    MC_INSTALL_DIR      Custom UI install directory"
  echo ""
  exit 0
fi

GREEN="\033[0;32m"; CYAN="\033[0;36m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}  ›${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  !${RESET} $*"; }
error()   { echo -e "${RED}  ✗ $*${RESET}"; exit 1; }

UPDATE_ROUTER=true
UPDATE_UI=true
[[ "${1}" == "--router-only" ]] && UPDATE_UI=false
[[ "${1}" == "--ui-only" ]]     && UPDATE_ROUTER=false

SCRIPT_BASE="https://raw.githubusercontent.com/ykbryan/mission-control-for-agents/main"

clear
echo ""
echo -e "${BOLD}${CYAN}  Mission Control — Full Update${RESET}"
echo -e "  ${CYAN}════════════════════════════════════════${RESET}"
echo ""

ROUTER_OK=false
UI_OK=false

# ── Update Router ────────────────────────────────────────────
if $UPDATE_ROUTER; then
  echo -e "${BOLD}${CYAN}  [1/2] Updating Router …${RESET}"
  echo ""
  if curl -fsSL "${SCRIPT_BASE}/update-router.sh" -o /tmp/update-router.sh 2>/dev/null; then
    if bash /tmp/update-router.sh; then
      ROUTER_OK=true
    else
      warn "Router update encountered an issue. Check logs above."
    fi
    rm -f /tmp/update-router.sh
  else
    warn "Could not download update-router.sh — skipping."
  fi
fi

# ── Update Mission Control UI ─────────────────────────────────
if $UPDATE_UI; then
  echo -e "${BOLD}${CYAN}  [2/2] Updating Mission Control UI …${RESET}"
  echo ""
  if curl -fsSL "${SCRIPT_BASE}/update-missioncontrol.sh" -o /tmp/update-missioncontrol.sh 2>/dev/null; then
    if bash /tmp/update-missioncontrol.sh; then
      UI_OK=true
    else
      warn "UI update encountered an issue. Check logs above."
    fi
    rm -f /tmp/update-missioncontrol.sh
  else
    warn "Could not download update-missioncontrol.sh — skipping."
  fi
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}  ║${RESET}  ${BOLD}Update complete${RESET}                                    ${GREEN}║${RESET}"
echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"

if $UPDATE_ROUTER; then
  STATUS=$( $ROUTER_OK && echo "${GREEN}✓ Router updated${RESET}" || echo "${YELLOW}! Router — check logs${RESET}" )
  echo -e "${GREEN}  ║${RESET}  $(eval echo $STATUS)$(printf '%0.s ' {1..30})"
fi

if $UPDATE_UI; then
  STATUS=$( $UI_OK && echo "${GREEN}✓ Mission Control updated${RESET}" || echo "${YELLOW}! Mission Control — check logs${RESET}" )
  echo -e "${GREEN}  ║${RESET}  $(eval echo $STATUS)$(printf '%0.s ' {1..22})"
fi

echo -e "${GREEN}  ╠═══════════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}  ║${RESET}  pm2 list                                           ${GREEN}║${RESET}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
