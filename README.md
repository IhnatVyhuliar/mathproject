# Arcade Scoreboard

A gamified class points app for motivating students. The **teacher** awards weighted
points per category; the **students** watch a Kahoot-style leaderboard on the big screen.
All data lives in the browser via `localStorage` — no backend, works fully offline.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

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

React + Vite, `react-router-dom`, and a `zustand` store persisted to the
`arcade-scoreboard@v1` localStorage key (versioned with a migrate stub). All entities
(classes, students, categories, point entries) carry `crypto.randomUUID()` ids. Deleting a
class/student/category cascades to its dependent data.

## Project layout

```
src/
  store/useStore.js   zustand + persist, CRUD actions, cascade deletes
  lib/scoring.js      scoreOf / leaderboard / breakdown helpers
  styles/             tokens.css · global.css · app.css
  pages/              Home, ClassLayout, Players, Ranking, Edit
  components/         Modal, ConfirmDialog, AddPointsModal, StudentCard,
                      ScoreMeter, Confetti, EmptyState
```
