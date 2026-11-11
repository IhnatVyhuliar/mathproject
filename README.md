# Arcade Scoreboard

A gamified class points app for motivating students. The **teacher** awards weighted
points per category; the **students** watch a Kahoot-style leaderboard on the big screen.
It is a desktop app (Electron) that works fully offline.

## Dla nauczycielki (Windows)

1. Uruchom `ScoreboardSetup.exe`. Instalator jest niepodpisany, więc SmartScreen pokaże
   „System Windows ochronił ten komputer” → kliknij „Więcej informacji” → „Uruchom mimo to”.
2. Przy pierwszym starcie kliknij **⬆ Importuj z pliku…** i wskaż plik kopii z wersji
   przeglądarkowej (tag `v1.1-eksport`, ten sam adres co zwykle, przycisk „Pobierz kopię”).
   Awaryjnie: w konsoli DevTools starej wersji wpisz
   `copy(localStorage.getItem('arcade-scoreboard@v1'))`, wklej wynik do pliku `.json`
   i zaimportuj go.
3. Kopię na inny komputer przenosisz przez **⬇ Eksportuj do pliku…** → **⬆ Importuj z pliku…**.

### Gdzie są dane

Dane leżą w bazie SQLite: `%APPDATA%\Arcade Scoreboard\scoreboard.sqlite`, a automatyczne
kopie zapasowe (przed importem) w podkatalogu `kopie\`. Przycisk **📁 Pokaż plik bazy**
otwiera ten katalog. Odinstalowanie aplikacji nie usuwa danych.

## Development

```bash
npm install
npm run dev            # sam renderer w przeglądarce (http://localhost:5173), bez bazy
npm run app:dev        # aplikacja Electron z hot reloadem
npm test               # testy (node:test)
npm run app:smoke      # build + uruchomienie Electrona, zrzut rankingu (SMOKE OK)
npm run dist:linux-dir # spakowana aplikacja w release/linux-unpacked
npm run dist:win       # release/ScoreboardSetup.exe (Docker, obraz electronuserland/builder:22-wine)
```

Smoke test spakowanej aplikacji:
`node --disable-warning=ExperimentalWarning scripts/smoke.mjs --app release/linux-unpacked/arcade-scoreboard`.

## How it works

- **Home** — create classes; each class block has rename / delete.
- **Players** (default class view) — add students by Name · Surname · Number; each gets a
  unique id. Cards show the live score, a breakdown by category, and **＋ Points** opens a
  modal to award points per category on a date (with an optional note).
- **Ranking** — top-10 leaderboard with a 1·2·3 podium and a **Present** button that goes
  fullscreen for the projector. Confetti fires for the leader.
- **Edit** — create / rename / delete the class's point **categories** and their weights.

### Scoring

A student's score is the **weighted total** of every point they've earned:

```
score = Σ (points in a category × that category's weight)
```

Each award is stored as a dated entry tied to a category, so it's always clear *what* a
point was for.

## Stack

Electron 45 shell with a React + Vite renderer (`react-router-dom`, `zustand`). Data is stored
in SQLite (built-in `node:sqlite`, WAL, foreign keys) in the main process; the renderer talks
to it over IPC with optimistic updates and undo. Export/import use a versioned JSON format.
Installer: electron-builder (NSIS), built in Docker with Wine. All entities carry
`crypto.randomUUID()` ids; deleting a class/student/category cascades.

## Project layout

```
electron/           main process: main.js, preload.cjs, db.js (SQLite), repo.js, ipc.js, validate.js
scripts/            dev.mjs, smoke.mjs, build-win.sh (Docker Windows build)
test/fixtures/      sample export and old localStorage data
electron-builder.yml  packaging config
src/
  store/              useStore.js, createScoreboardStore.js, writeQueue.js
  lib/                scoring.js, api.js, exportFormat.js, steps.js, apiMethods.js
  styles/             tokens.css · global.css · app.css
  pages/              Home, ClassLayout, Players, Ranking, Edit
  components/         Modal, ConfirmDialog, AddPointsModal, StudentCard,
                      ScoreMeter, Confetti, EmptyState
```
