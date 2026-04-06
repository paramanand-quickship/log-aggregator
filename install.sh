#!/usr/bin/env bash
# Blorq — One-command installer for macOS & Linux
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/your-org/blorq/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/your-org/blorq/main/install.sh | bash -s -- --port 9900 --dir ~/.blorq-data
#   wget -qO- https://raw.githubusercontent.com/your-org/blorq/main/install.sh | bash

set -e

# ── Colour helpers ────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
info() { echo -e "${CYAN}  →${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
fail() { echo -e "${RED}  ✗${RESET} $*"; exit 1; }

# ── Config ────────────────────────────────────────────────────────────────
BLORQ_VERSION="${BLORQ_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.blorq}"
DATA_DIR="${DATA_DIR:-$HOME/.blorq/data}"
PORT="${PORT:-9900}"
REPO="https://github.com/your-org/blorq"
TARBALL="$REPO/archive/refs/heads/main.tar.gz"   # swap for releases/download/$VERSION/blorq.tar.gz

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)  PORT="$2";        shift 2 ;;
    --dir)   INSTALL_DIR="$2"; shift 2 ;;
    --data)  DATA_DIR="$2";    shift 2 ;;
    *)       shift ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  ╔══════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}  ║    Blorq — Log Aggregator        ║${RESET}"
echo -e "${BOLD}${CYAN}  ╚══════════════════════════════════╝${RESET}"
echo ""

# ── Detect OS ─────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin*) PLATFORM="macOS" ;;
  Linux*)  PLATFORM="Linux"  ;;
  *)       fail "Unsupported OS: $OS" ;;
esac
info "Platform: $PLATFORM $(uname -m)"

# ── Check Node.js ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Installing via nvm…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
fi

NODE_VERSION=$(node --version 2>/dev/null || echo "none")
NODE_MAJOR=$(echo "$NODE_VERSION" | tr -d 'v' | cut -d. -f1)
if (( NODE_MAJOR < 18 )); then
  fail "Blorq requires Node.js ≥18. Found: $NODE_VERSION. Please upgrade: https://nodejs.org"
fi
ok "Node.js $NODE_VERSION"

# ── Check npm ─────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  fail "npm not found. Install Node.js from https://nodejs.org"
fi
ok "npm $(npm --version)"

# ── Download ──────────────────────────────────────────────────────────────
echo ""
info "Installing Blorq to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Check if already installed
if [ -f "$INSTALL_DIR/package.json" ]; then
  warn "Blorq already installed at $INSTALL_DIR"
  info "To update: cd $INSTALL_DIR && npm install"
  info "To reinstall: rm -rf $INSTALL_DIR && rerun this script"
  echo ""
else
  # Install from npm (preferred once published)
  # npm install -g blorq   ← once published
  #
  # For now: install from GitHub tarball
  TMP="$(mktemp -d)"
  info "Downloading Blorq…"

  if command -v curl &>/dev/null; then
    curl -fsSL "$TARBALL" -o "$TMP/blorq.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "$TARBALL" -O "$TMP/blorq.tar.gz"
  else
    fail "curl or wget required"
  fi

  info "Extracting…"
  tar -xzf "$TMP/blorq.tar.gz" -C "$TMP" 2>/dev/null || true
  # GitHub tarballs extract to blorq-main/
  SRC=$(find "$TMP" -maxdepth 1 -type d -name "blorq-*" | head -1)
  if [ -z "$SRC" ]; then SRC="$TMP"; fi
  cp -r "$SRC/." "$INSTALL_DIR/"
  rm -rf "$TMP"
  ok "Downloaded"
fi

# ── Install dependencies ──────────────────────────────────────────────────
info "Installing dependencies…"
cd "$INSTALL_DIR"
npm install --omit=dev --no-audit --no-fund --loglevel=error
ok "Dependencies installed"

# ── First-run setup ───────────────────────────────────────────────────────
echo ""
info "Running first-time setup…"
PORT="$PORT" DATA_DIR="$DATA_DIR" node setup.js
echo ""

# ── Create symlink → blorq command ────────────────────────────────────────
LINK_DIRS=("$HOME/.local/bin" "/usr/local/bin")
LINKED=false

for LINK_DIR in "${LINK_DIRS[@]}"; do
  if [ -d "$LINK_DIR" ] || mkdir -p "$LINK_DIR" 2>/dev/null; then
    if [ -w "$LINK_DIR" ]; then
      ln -sf "$INSTALL_DIR/bin/blorq" "$LINK_DIR/blorq"
      chmod +x "$INSTALL_DIR/bin/blorq"
      ok "blorq command → $LINK_DIR/blorq"
      LINKED=true
      break
    fi
  fi
done

if [ "$LINKED" = false ]; then
  # Try sudo for /usr/local/bin
  if sudo ln -sf "$INSTALL_DIR/bin/blorq" "/usr/local/bin/blorq" 2>/dev/null; then
    sudo chmod +x "$INSTALL_DIR/bin/blorq"
    ok "blorq command → /usr/local/bin/blorq  (sudo)"
    LINKED=true
  fi
fi

if [ "$LINKED" = false ]; then
  warn "Could not create global 'blorq' command."
  info "Add this to your shell profile (.bashrc / .zshrc):"
  echo ""
  echo "  export PATH=\"$INSTALL_DIR/bin:\$PATH\""
  echo ""
fi

# ── Ensure ~/.local/bin is in PATH (for new shells) ───────────────────────
SHELL_PROFILE=""
if [ -f "$HOME/.zshrc" ];  then SHELL_PROFILE="$HOME/.zshrc";
elif [ -f "$HOME/.bashrc" ]; then SHELL_PROFILE="$HOME/.bashrc"; fi

if [ -n "$SHELL_PROFILE" ]; then
  if ! grep -q 'HOME/.local/bin' "$SHELL_PROFILE" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_PROFILE"
    info "Added \$HOME/.local/bin to PATH in $SHELL_PROFILE"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✅  Blorq installed successfully!${RESET}"
echo ""
echo -e "  ${DIM}Start now:${RESET}         ${CYAN}blorq start${RESET}"
echo -e "  ${DIM}Start on boot:${RESET}     ${CYAN}blorq service install${RESET}"
echo -e "  ${DIM}Open dashboard:${RESET}    ${CYAN}http://localhost:${PORT}${RESET}"
echo -e "  ${DIM}Default login:${RESET}     admin / admin123"
echo ""
echo -e "  ${DIM}Install dir:${RESET}  $INSTALL_DIR"
echo -e "  ${DIM}Data dir:${RESET}     $DATA_DIR"
echo ""
warn "Change default passwords at http://localhost:${PORT}/settings"
echo ""

# Offer to start now
if [ -t 1 ]; then  # only prompt in interactive terminals
  read -rp "  Start Blorq now? [Y/n] " REPLY
  REPLY="${REPLY:-Y}"
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    exec "$INSTALL_DIR/bin/blorq" start
  fi
fi
