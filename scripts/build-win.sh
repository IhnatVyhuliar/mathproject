#!/usr/bin/env bash
# Buduje ScoreboardSetup.exe w kontenerze Docker (Wine) i zapisuje go w release/.
set -euo pipefail
cd "$(dirname "$0")/.."

UID_GID="$(id -u):$(id -g)"
CACHE="$HOME/.cache/arcade-scoreboard-build"
# Tworzymy katalogi jako zwykły użytkownik, żeby Docker nie założył ich jako root.
mkdir -p release "$CACHE/electron" "$CACHE/electron-builder"

docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/release":/out \
  -v "$CACHE/electron":/root/.cache/electron \
  -v "$CACHE/electron-builder":/root/.cache/electron-builder \
  electronuserland/builder:22-wine bash -c '
    set -euo pipefail
    mkdir -p /work
    tar -C /src --exclude=node_modules --exclude=dist --exclude=release -cf - . | tar -C /work -xf -
    cd /work
    npm ci && npm run build && npx electron-builder --win nsis
    cp release/ScoreboardSetup.exe /out/
    chown '"$UID_GID"' /out/ScoreboardSetup.exe
    chown -R '"$UID_GID"' /root/.cache/electron /root/.cache/electron-builder'
echo "Gotowe: release/ScoreboardSetup.exe"
