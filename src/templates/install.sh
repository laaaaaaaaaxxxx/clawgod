#!/usr/bin/env bash
set -euo pipefail
# Manual offline copy installer. No PATH mutation or Claude discovery.
# Required: --target /absolute/bridge-copy --output-dir /absolute/new-output
node - "$@" <<'CLAWGOD_MANUAL_INSTALLER'
{{CLAWGOD:INSTALLER}}
CLAWGOD_MANUAL_INSTALLER
