#!/usr/bin/env bash
# Na serwerze: pobiera nowy kod, buduje wersję webową do dist/ (nginx serwuje ten katalog).
#   npm run deploy:web           – kod + strona (instalator z release/ albo public/, jeśli już jest)
#   npm run deploy:web -- --exe  – dodatkowo buduje ScoreboardSetup.exe (Docker)
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
# Do strony nie potrzeba binarki Electrona (instalator buduje się w Dockerze z własną).
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci

if [ "${1:-}" = "--exe" ]; then
  npm run dist:win
fi
if [ -f release/ScoreboardSetup.exe ]; then
  mkdir -p public
  cp release/ScoreboardSetup.exe public/
fi

npm run build # Vite kopiuje public/ do dist/

if grep -q "arcade-scoreboard@v1" dist/assets/*.js; then
  echo "OK: dist/ to wersja webowa (dane w przeglądarce)."
else
  echo "BŁĄD: dist/ nie zawiera wersji webowej. Czy to właściwa gałąź?" >&2
  exit 1
fi
if [ -f dist/ScoreboardSetup.exe ]; then
  echo "OK: instalator dostępny: dist/ScoreboardSetup.exe"
else
  echo "Uwaga: brak instalatora. Uruchom z --exe albo skopiuj ScoreboardSetup.exe do public/ i powtórz."
fi
