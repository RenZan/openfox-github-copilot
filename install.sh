#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="openfox-github-copilot"
OPENFOX_DIR="${OPENFOX_DEV:+openfox-dev}"
OPENFOX_DIR="${OPENFOX_DIR:-openfox}"

case "$(uname -s)" in
  Darwin)
    PLUGIN_DIR="$HOME/Library/Application Support/$OPENFOX_DIR/plugins/$PLUGIN_NAME"
    ;;
  Linux)
    PLUGIN_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/$OPENFOX_DIR/plugins/$PLUGIN_NAME"
    ;;
  *)
    echo "Unsupported OS. Please install manually." >&2
    exit 1
    ;;
esac

mkdir -p "$PLUGIN_DIR"
npx --yes pacote extract "$PLUGIN_NAME" "$PLUGIN_DIR"
npm install --omit=dev --prefix "$PLUGIN_DIR"

echo ""
echo "Plugin installed to: $PLUGIN_DIR"
echo "Restart OpenFox and connect via Settings → Manage Providers → GitHub Copilot."

