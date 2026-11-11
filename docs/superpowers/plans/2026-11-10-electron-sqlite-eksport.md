# Arcade Scoreboard: eksport danych + aplikacja desktopowa (Electron + SQLite) — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nauczycielka pobiera pełną kopię swoich danych z obecnej wersji przeglądarkowej do pliku, instaluje `ScoreboardSetup.exe` i importuje plik w aplikacji. Od tej pory dane siedzą w bazie SQLite na jej komputerze, a między komputerami przenosi je przyciskami Eksport/Import.

**Architecture:** Electron 45. Proces główny (Node 24.22) trzyma bazę `node:sqlite` w `userData` i obsługuje jeden kanał IPC `scoreboard` z białą listą metod. Okno ładuje build Reacta; preload (sandbox, contextIsolation) wystawia tylko `window.scoreboard.invoke`. Store zustand bez `persist` zmienia stan od razu, a zapisy wysyła szeregowo przez IPC i przy błędzie cofa zmianę. **Nic nie nasłuchuje na żadnym porcie**, więc wymóg „nie bindować na 0.0.0.0” jest spełniony z definicji.

**Tech Stack:** React 18 + Vite 7 + zustand 4.5.7, Electron `45.2.3`, `node:sqlite`, electron-builder `26.18.0` (NSIS), Docker `electronuserland/builder:22-wine`, testy `node --test`.

**Spec:** wiadomości użytkownika z 2026-11-10: eksport z localStorage → baza SQLite; aplikacja „plug & play” w Electron z jednym instalatorem `ScoreboardSetup.exe`. Decyzje: **jeden komputer + przenoszenie plikiem** (bez serwera i Nginx), **build `.exe` przez Docker na tym komputerze**. Przy starcie wykonania skopiuj plan do `docs/superpowers/plans/2026-11-10-electron-sqlite-eksport.md`.

## Kontekst

Dane żyją dziś tylko w localStorage przeglądarki (klucz `arcade-scoreboard@v1`, `src/store/useStore.js:245`), więc nie da się ich przenieść. Plan ma dwie części:

1. **Teraz:** przycisk eksportu w obecnej wersji przeglądarkowej (Task 1, tag `v1.1-eksport`). Tylko ta wersja widzi localStorage nauczycielki, i to wyłącznie **pod tym samym adresem (host + port), pod którym zwykle z niej korzysta**. Pod innym adresem zobaczy demo „Klasa 7B”, dlatego panel w takim wypadku blokuje przycisk i ostrzega.
2. **Potem:** aplikacja Electron z bazą SQLite (Taski 2–6). Przy pierwszym uruchomieniu nauczycielka klika „Importuj z pliku…” i wskazuje plik z punktu 1.

Względem pierwotnego planu odpadają Nginx, serwer HTTP i polling: jest jeden komputer i jeden proces. Z wklejonego planu zostają: SQLite z WAL, tabele `classes`/`students`/`categories`/`points` z kluczami `TEXT` (UUID z klienta), eksport JSON → import do bazy, optymistyczny UI z cofaniem. Dokładam `PRAGMA foreign_keys = ON` (bez tego kaskady po cichu nie działają) i tabelę `settings` na globalne kroki.

## Global Constraints

- Baza tylko przez `node:sqlite` (`DatabaseSync`). **Żadnego serwera sieciowego** w aplikacji. Renderer nie ma dostępu do Node: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Wersje przypięte dokładnie: `electron@45.2.3`, `electron-builder@26.18.0` (devDependencies). Poza nimi zero nowych zależności, także testowych (`node --test` + `node:assert/strict`).
- Zaraz po otwarciu bazy: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;`
- Tabele: `classes`, `students` (FK `class_id`), `categories` (FK `class_id`), `points` (FK `student_id`, `category_id`), `settings`. PK encji to `TEXT`. FK z `ON DELETE CASCADE`, czyli ta sama semantyka kaskad co dzisiejszy store.
- W JSON i w store wpisy punktowe nazywają się `entries` i mają pola camelCase jak dziś. snake_case występuje tylko w SQL.
- Baza: `<userData>/scoreboard.sqlite` (na Windowsie `%APPDATA%\Arcade Scoreboard\`). Kopie przed importem: `<userData>/kopie/`. Zmienna `SCOREBOARD_DATA_DIR` nadpisuje `userData` (testy, smoke).
- Teksty UI i komunikaty błędów po polsku. Liczebniki przez `plural()` z `src/lib/steps.js`.
- Dane uczniów nie trafiają do gita: `.gitignore` dostaje `arcade-scoreboard-*.json`, `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`, `release/`. Fixtures są syntetyczne.
- Praca na gałęzi `feature/electron-sqlite`. Commity po polsku, zakończone linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `"test": "node --test \"src/**/*.test.js\" \"electron/**/*.test.js\""` (sprawdzone: globy bez dopasowań dają exit 0).

## Review Focus

1. **Eksport z przeglądarki pod innym adresem niż zwykle** (pusty localStorage). Oczekiwane: zablokowany przycisk i komunikat, nigdy cichy eksport demo. → Task 1.
2. **Import do bazy, w której są już dane.** Najpierw potwierdzenie i automatyczna kopia obecnych danych; „Anuluj” nie zmienia niczego. → Task 3.
3. **Dwa uruchomienia aplikacji** (podwójny klik dwa razy). Drugie ma tylko pokazać pierwsze okno, a nie otwierać drugiego połączenia do tej samej bazy z rozjeżdżającym się stanem. → Task 5.
4. **Spakowana aplikacja bez plików, które proces główny importuje spoza `electron/`** (`src/lib/exportFormat.js`, `src/lib/steps.js`). W dev działa, z instalatora daje biały ekran. → Task 6 (smoke na spakowanej wersji Linux).
5. **Zapis na każde naciśnięcie klawisza** w polach kroków (kontrolowane inputy, `src/pages/EditPage.jsx:165,182`). Stan lokalny musi się zmieniać synchronicznie (inaczej skacze kursor), zapisy muszą iść w kolejności, a w bazie ma zostać ostatnia wartość. → Task 4.

---

### Task 1: Eksport z przeglądarki (wydanie dla nauczycielki)

**Files:**
- Create: `src/lib/exportFormat.js`, `src/lib/exportFormat.test.js`, `src/lib/download.js`, `src/components/BackupPanel.jsx`, `test/fixtures/demo-export.json`, `test/fixtures/local-v1.json`
- Modify: `src/pages/HomePage.jsx` (`<BackupPanel />` pod siatką klas), `src/store/useStore.js:250-265` (`migrate` deleguje do `normalizeData`), `src/styles/app.css` (`.backup-panel`, reużywa `.card`, `.btn`, `.muted-line`), `package.json` (`test`), `.gitignore` (`arcade-scoreboard-*.json`)

**Interfaces:**
- Consumes: `normalizeStep`, `DEFAULT_POINT_STEP`, `DEFAULT_WEIGHT_STEP`, `plural` z `src/lib/steps.js`
- Produces, `src/lib/exportFormat.js` (czysty ESM bez zależności od DOM, bo importuje go też proces główny Electron):
  - `STORAGE_KEY = 'arcade-scoreboard@v1'`, `EXPORT_FORMAT = 'arcade-scoreboard-export'`, `EXPORT_VERSION = 1`
  - typ `Data = { pointStep, weightStep, classes, students, categories, entries }`. Pola encji jak dziś w store: Class `{id,name,icon,color,pointStep|null,weightStep|null,createdAt}`, Student `{id,classId,firstName,lastName,number,createdAt}`, Category `{id,classId,name,weight,color,createdAt}`, Entry `{id,studentId,categoryId,points,note,date,createdAt}`
  - `normalizeData(raw: object, fromVersion = 2): Data` — uzupełnia braki: kroki przez `normalizeStep`; `pointStep`/`weightStep` klasy → `null`; brakujące stringi → `''`; pola liczbowe przez `Number`. Pomija elementy tablic, które nie są obiektami. Niczego innego nie usuwa, więc działa bezstratnie.
  - `cleanData(data): { data, warnings: string[] }` — usuwa: elementy bez stringowego `id`; duplikaty `id` (zostaje pierwszy); uczniów i kategorie bez istniejącej klasy; wpisy bez istniejącego ucznia lub kategorii albo z nieskończonymi `points`. Waga kategorii nieskończona lub ≤ 0 → `1`. Każda reguła, która coś zmieniła, daje jedno zbiorcze ostrzeżenie po polsku.
  - `parseImport(input: string | object): { data, warnings }` — rozpoznaje 3 kształty: kopertę `{format: EXPORT_FORMAT, version, data}`, surowy blob persist `{state, version}` (np. skopiowany z DevTools) oraz goły `Data` (ma tablicę `classes`). Potem `normalizeData` → `cleanData`. Rzuca `ImportError` (eksportowana klasa) przy złym JSON, nieznanym kształcie i `version > EXPORT_VERSION`.
  - `buildExport(data, { source: 'browser' | 'app', exportedAt = new Date().toISOString() })` → `{ format, version, exportedAt, source, counts: summarize(data), data: pickData(data) }`
  - `pickData(state): Data`, `summarize(data): { classes, students, categories, entries }`, `formatCounts(counts): string` (np. `2 klasy · 5 uczniów · 4 kategorie · 12 wpisów`; formy: klasa/klasy/klas, uczeń/uczniów/uczniów, kategoria/kategorie/kategorii, wpis/wpisy/wpisów), `exportFileName(iso): 'arcade-scoreboard-YYYY-MM-DD.json'`
  - `hasSavedLocalData(storage): boolean` (`getItem(STORAGE_KEY) !== null`; wyjątek → `false`) i `readBrowserData(storage): Data | null` (`null` przy braku klucza lub wyjątku; uszkodzony JSON → `ImportError`; zwraca `normalizeData(blob.state, blob.version)` bez czyszczenia)
- Produces, `src/lib/download.js`: `downloadJson(filename, value): void` (Blob + tymczasowy `<a download>`)
- Produces, fixtures (używane w Taskach 1–6):
  - `test/fixtures/demo-export.json` — koperta v1. Zawiera 2 klasy („Klasa 7B”, ikona 🚀, `pointStep: 10`; „Klasa 8A” z `null`), 5 uczniów (w tym „Jakub Wiśniewski”), 4 kategorie (jedna z wagą `1.5`), ≥ 8 wpisów (jeden z notatką „Świetna praca ✨”), `pointStep: 5`, `weightStep: 1`. Musi być „czysty”: `cleanData` nie zwraca ostrzeżeń.
  - `test/fixtures/local-v1.json` — `{"state": {...}, "version": 1}` bez kroków (ani globalnie, ani w klasach). Zawiera 1 wpis z nieistniejącym `categoryId` i 2 uczniów z tym samym `id`.

- [ ] **Step 1: Napisz failujące testy `src/lib/exportFormat.test.js`**

```js
const demo = readFixture('demo-export.json')   // JSON.parse(readFileSync(new URL('../../test/fixtures/…', import.meta.url)))
const fakeStorage = (obj) => ({ getItem: (k) => obj[k] ?? null })

test('envelope round-trip keeps data exactly (Polish chars, emoji, 1.5 weight)', () => {
  const file = buildExport(demo.data, { source: 'browser', exportedAt: '2026-11-10T08:00:00.000Z' })
  assert.equal(file.format, 'arcade-scoreboard-export'); assert.equal(file.version, 1)
  assert.deepEqual(file.counts, { classes: 2, students: 5, categories: 4, entries: demo.data.entries.length })
  assert.deepEqual(parseImport(JSON.stringify(file)), { data: demo.data, warnings: [] })
})
test('v1 localStorage blob: fills steps, drops orphans and duplicate ids', () => {
  const { data, warnings } = parseImport(readFixture('local-v1.json'))
  assert.equal(data.pointStep, 5); assert.equal(data.weightStep, 1)
  assert.ok(data.classes.every((c) => c.pointStep === null && c.weightStep === null))
  assert.equal(new Set(data.students.map((s) => s.id)).size, data.students.length)
  assert.ok(data.entries.every((e) => data.categories.some((c) => c.id === e.categoryId)))
  assert.equal(warnings.length, 2)
})
test('rejects files that are not exports', () => {
  for (const bad of ['nie json', '[]', '{}', JSON.stringify({ format: 'arcade-scoreboard-export', version: 99, data: {} })])
    assert.throws(() => parseImport(bad), ImportError)
})
test('readBrowserData: nothing saved → null (Review Focus 1)', () => {
  assert.equal(readBrowserData(fakeStorage({})), null)
  assert.equal(readBrowserData({ getItem() { throw new Error('SecurityError') } }), null)
  assert.equal(hasSavedLocalData(fakeStorage({})), false)
})
test('readBrowserData is lossless (no cleaning)', () => {
  const raw = readFixture('local-v1.json')
  assert.equal(readBrowserData(fakeStorage({ 'arcade-scoreboard@v1': JSON.stringify(raw) })).students.length, raw.state.students.length)
})
test('formatCounts uses Polish plurals', () => assert.equal(formatCounts({ classes: 2, students: 5, categories: 1, entries: 22 }), '2 klasy · 5 uczniów · 1 kategoria · 22 wpisy'))
test('exportFileName', () => assert.equal(exportFileName('2026-11-10T08:00:00.000Z'), 'arcade-scoreboard-2026-11-10.json'))
```

- [ ] **Step 2: Dodaj skrypt `test` i sprawdź, że testy failują.** `npm test` → FAIL (`Cannot find module …/exportFormat.js`).
- [ ] **Step 3: Zaimplementuj `exportFormat.js`.** `migrate` w `useStore.js` → `(state, from) => state && { ...state, ...normalizeData(state, from) }`.
- [ ] **Step 4: `npm test` → PASS.**
- [ ] **Step 5: `download.js` + `BackupPanel` (bez propsów) na dole `HomePage`.**
  - Nagłówek `Kopia danych`. Opis: `Pobierz wszystkie klasy, uczniów, kategorie i punkty zapisane w tej przeglądarce do pliku .json — żeby przenieść je do aplikacji Arcade Scoreboard.`
  - Gdy `hasSavedLocalData(localStorage)` (sprawdzane przy każdym renderze, bo to tanie): `formatCounts` liczników ze store i przycisk `⬇ Pobierz kopię (.json)`. Klik → `readBrowserData` → `downloadJson(exportFileName(now), buildExport(data, { source: 'browser' }))`.
  - Gdy brak danych: przycisk `disabled`, liczniki ukryte, tekst `W tej przeglądarce nie ma zapisanych danych. Otwórz aplikację pod tym samym adresem, pod którym zwykle z niej korzystasz.`
  - `ImportError` → `Nie udało się odczytać zapisanych danych: {message}`.
- [ ] **Step 6: Sprawdzenie w przeglądarce (playwright MCP, `npm run dev`).** Nawiguj klikaniem. Czysty kontekst: przycisk zablokowany i widać podpowiedź. Dodaj klasę „Test” → przycisk aktywny. Klik → pobiera się `arcade-scoreboard-2026-11-10.json`, a `parseImport` na nim zwraca klasę „Test”.
- [ ] **Step 7: Commit + tag.**

```bash
git add src/lib/exportFormat.js src/lib/exportFormat.test.js src/lib/download.js src/components/BackupPanel.jsx \
        src/pages/HomePage.jsx src/store/useStore.js src/styles/app.css test/fixtures package.json .gitignore
git commit -m "Eksport danych z przeglądarki do pliku JSON"
git tag v1.1-eksport
```
Ten tag to build dla nauczycielki (`npm run build` → `dist/`). Trzeba go wystawić **pod tym samym adresem**, pod którym dziś otwiera aplikację.

---

### Task 2: Baza SQLite w procesie Electron

**Files:**
- Create: `electron/db.js`, `electron/db.test.js`
- Modify: `package.json` (devDependency `electron@45.2.3`), `.gitignore` (`*.sqlite*`)

**Interfaces:**
- Consumes: `Data`, `parseImport` (Task 1; w testach)
- Produces, `electron/db.js`:
  - `openDb(file: string): DatabaseSync` — pragmy z Global Constraints. Gdy `PRAGMA user_version` = 0: schemat poniżej i `user_version = 1`. Zawsze dba o wiersz `settings(id=1, point_step=5, weight_step=1)`.
  - `tx(db, fn: () => T): T` — `BEGIN IMMEDIATE` / `COMMIT`; wyjątek → `ROLLBACK` i ponowne rzucenie (`node:sqlite` nie ma `db.transaction()`)
  - `readState(db): Data`. Zwraca zwykłe obiekty: `node:sqlite` oddaje wiersze z null-prototype, więc trzeba je jawnie zmapować, inaczej `deepStrictEqual` failuje. Pola camelCase, każda tabela `ORDER BY rowid` (kolejność wstawienia = kolejność w UI).
  - `isEmpty(db): boolean` (brak klas)
  - `importData(db, data: Data, { force = false } = {}): counts` — całość w jednym `tx`: `!isEmpty && !force` → `NotEmptyError`; `force` → `DELETE FROM classes` (reszta kaskadą); inserty w kolejności tablic; ustawia `settings`.
  - `class NotEmptyError extends Error`
  - Uwaga: `node:sqlite` rzuca przy bindowaniu `undefined`. Dane muszą przejść przez `normalizeData`, a SQL używa `null`.

Schemat (dokładnie):
```sql
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), point_step REAL NOT NULL, weight_step REAL NOT NULL);
CREATE TABLE classes (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '', point_step REAL, weight_step REAL, created_at TEXT NOT NULL);
CREATE TABLE students (id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL);
CREATE TABLE categories (id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, weight REAL NOT NULL CHECK (weight > 0), color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL);
CREATE TABLE points (id TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id)   ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  points REAL NOT NULL, note TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX students_class   ON students(class_id);
CREATE INDEX categories_class ON categories(class_id);
CREATE INDEX points_student   ON points(student_id);
CREATE INDEX points_category  ON points(category_id);
```

- [ ] **Step 1: Spike: czy Electron ma `node:sqlite`.** `npm i -D --save-exact electron@45.2.3`, potem:
  `ELECTRON_RUN_AS_NODE=1 npx electron -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync(':memory:').prepare('select sqlite_version() v').get().v)"`
  Oczekiwane: wypisana wersja SQLite. Jeśli moduł nie istnieje: **STOP**, zgłoś użytkownikowi. Alternatywą jest `better-sqlite3` z przebudową pod Electron, a to zmienia sposób uruchamiania testów.
- [ ] **Step 2: Napisz failujące testy `electron/db.test.js`**

```js
test('file DB runs in WAL with foreign keys on', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'asb-')), 't.sqlite'))   // :memory: zwraca 'memory'
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
})
test('fresh DB: defaults, no data', () => assert.deepEqual(readState(openDb(':memory:')),
  { pointStep: 5, weightStep: 1, classes: [], students: [], categories: [], entries: [] }))
test('import → readState round-trip (order, Polish chars, REAL)', () => {
  const db = openDb(':memory:'); importData(db, demo.data); assert.deepEqual(readState(db), demo.data)
})
test('second import without force → NotEmptyError, data unchanged', () => {
  importData(db, demo.data); const before = readState(db)
  assert.throws(() => importData(db, demo.data), NotEmptyError); assert.deepEqual(readState(db), before)
})
test('force import replaces data', () => {
  const v1 = parseImport(readFixture('local-v1.json')).data
  importData(db, demo.data); importData(db, v1, { force: true }); assert.deepEqual(readState(db), v1)
})
test('failed import rolls back completely', () => {
  const bad = structuredClone(demo.data); bad.entries.push({ ...bad.entries[0], id: 'x', categoryId: 'brak' })
  assert.throws(() => importData(db, bad)); assert.equal(isEmpty(db), true)
})
test('deleting a class cascades to students, categories, points', ...)  // DELETE FROM classes WHERE id=? → brak dzieci tej klasy
```

- [ ] **Step 3: `npm test` → FAIL.**
- [ ] **Step 4: Zaimplementuj `electron/db.js`.**
- [ ] **Step 5: `npm test` → PASS.**
- [ ] **Step 6: Commit** `git add electron/db.js electron/db.test.js package.json package-lock.json .gitignore && git commit -m "Baza SQLite (WAL, FK) dla aplikacji Electron"`

---

### Task 3: Operacje na danych + eksport/import (handlery IPC)

**Files:**
- Create: `src/lib/apiMethods.js`, `electron/validate.js`, `electron/repo.js`, `electron/ipc.js`, `electron/ipc.test.js`

**Interfaces:**
- Consumes: `openDb`, `tx`, `readState`, `isEmpty`, `importData` (Task 2); `parseImport`, `ImportError`, `buildExport`, `exportFileName`, `summarize`, `formatCounts` (Task 1)
- Produces:
  - `src/lib/apiMethods.js`: `API_METHODS = ['getState','putSettings','createClass','patchClass','deleteClass','createStudent','patchStudent','deleteStudent','createCategory','patchCategory','deleteCategory','createPoints','exportToFile','importFromFile','revealDatabase']` — wspólna lista dla main i renderera.
  - `electron/validate.js`: `validateEntity(kind: 'class'|'student'|'category'|'point', obj): string | null`, `validatePatch(kind, obj): string | null`, `validateSettings(obj): string | null`. Reguły:
    - `id`, `classId`, `studentId`, `categoryId`, `createdAt`: niepuste stringi
    - `name`, `firstName`: niepuste po trim
    - `lastName`, `number`, `note`, `icon`, `color`: stringi
    - `weight` oraz `pointStep`/`weightStep` w settings: skończone > 0; `pointStep`/`weightStep` klasy: skończone > 0 albo `null`
    - `points`: skończone; `date`: `/^\d{4}-\d{2}-\d{2}$/`
    - pola edytowalne w PATCH: klasa `name, icon, color, pointStep, weightStep`; uczeń `firstName, lastName, number`; kategoria `name, weight, color`
    - nieznane pole i pusty patch → błąd
  - `electron/repo.js`: `insertClass/insertStudent/insertCategory(db, e)`, `insertPoints(db, entries)`, `patchEntity(db, kind, id, patch): boolean`, `deleteEntity(db, kind, id): boolean`, `updateSettings(db, patch)`. Mapowanie camelCase → kolumny pochodzi z białej listy; nazwy kolumn nigdy nie przychodzą z wywołania.
  - `electron/ipc.js`:
    - `createHandlers(db, { dialogs, shell, dbPath, backupDir, now = () => new Date() }): Record<ApiMethod, (...args) => Result | Promise<Result>>`, gdzie `Result = { ok: true, value } | { ok: false, error: string }`. Handlery nigdy nie rzucają. Błędy:
      - walidacja → jej komunikat
      - brak rekordu → `Nie znaleziono rekordu`
      - SQLite `UNIQUE` / `FOREIGN KEY` → `Konflikt danych`
      - inne → log na stderr + `Nieoczekiwany błąd zapisu`
    - Zapisy z wieloma rekordami (`createPoints` 1–1000 wpisów, a także `deleteClass`) idą w jednym `tx`.
    - `exportToFile()`: `dialogs.showSaveDialog({ defaultPath: exportFileName(now()), filters: [{ name: 'Kopia Arcade Scoreboard', extensions: ['json'] }] })`. Anulowanie → `{ canceled: true }`; w przeciwnym razie zapis `buildExport(readState(db), { source: 'app' })` (wcięcie 2) → `{ path }`.
    - `importFromFile()`: `dialogs.showOpenDialog` (jeden plik .json) → `parseImport` (`ImportError` → `{ ok: false, error }`). Następnie `dialogs.showMessageBox({ type: 'question', buttons: ['Importuj', 'Anuluj'], defaultId: 1, cancelId: 1, message: 'Zaimportować dane z pliku?', detail })`. `detail` zawiera `formatCounts` pliku, ostrzeżenia oraz, gdy baza nie jest pusta, `Obecne dane (…) zostaną zastąpione. Najpierw zapiszę ich kopię w folderze „kopie”.`. Odpowiedź `1` → `{ canceled: true }`. Inaczej: gdy baza nie jest pusta, kopia `backupDir/przed-importem-YYYY-MM-DD-HHMMSS.json` (`buildExport` bieżących danych), potem `importData(db, data, { force: true })` → `{ counts, warnings, backupPath | null }`.
    - `revealDatabase()`: `shell.showItemInFolder(dbPath)`.
    - `registerIpc(ipcMain, handlers, isTrustedSender: (event) => boolean): void` — `ipcMain.handle('scoreboard', (event, method, ...args) => …)`. Nieufny nadawca albo metoda spoza `handlers` (`Object.hasOwn`) → `{ ok: false, error: 'Nieznana operacja' }`.

- [ ] **Step 1: Napisz failujące testy `electron/ipc.test.js`.** W `beforeEach`: `openDb(':memory:')`, `importData(db, demo.data)` i fake `dialogs`, który zapisuje wywołania i zwraca ustawione odpowiedzi. `backupDir` i ścieżki plików w `mkdtempSync`.

```js
test('handlers cover every API method', () => assert.deepEqual(Object.keys(h).sort(), [...API_METHODS].sort()))
test('getState returns stored data', () => assert.deepEqual(h.getState(), { ok: true, value: demo.data }))
test('createClass persists; invalid → error; duplicate → Konflikt')
test('patch whitelists fields; unknown id → Nie znaleziono; pointStep:null clears override')
test('deleteClass cascades')
test('createPoints is all-or-nothing')               // [ok, {points:'abc'}] → ok:false i liczba wpisów bez zmian
test('exportToFile writes a file parseImport accepts; cancel writes nothing', async () => {
  dialogs.save = { canceled: false, filePath: out }; const r = await h.exportToFile()
  assert.deepEqual(parseImport(readFileSync(r.value.path, 'utf8')).data, demo.data)
})
test('import into non-empty DB: cancel changes nothing (Review Focus 2)', async () => {
  dialogs.open = { canceled: false, filePaths: [fixture('local-v1.json')] }; dialogs.box = { response: 1 }
  assert.deepEqual((await h.importFromFile()).value, { canceled: true })
  assert.deepEqual(readState(db), demo.data); assert.deepEqual(readdirSync(backupDir), [])
})
test('import into non-empty DB: confirm backs up old data first (Review Focus 2)', async () => {
  dialogs.box = { response: 0 }; const r = (await h.importFromFile()).value
  assert.deepEqual(parseImport(readFileSync(r.backupPath, 'utf8')).data, demo.data)
  assert.deepEqual(readState(db), parseImport(readFixture('local-v1.json')).data); assert.equal(r.warnings.length, 2)
})
test('import of a non-export file → ok:false, DB unchanged')
test('registerIpc rejects unknown methods and untrusted senders')   // fake ipcMain z { handle(channel, fn) }
```

- [ ] **Step 2: `npm test` → FAIL.**
- [ ] **Step 3: Zaimplementuj `apiMethods.js`, `validate.js`, `repo.js`, `ipc.js`.**
- [ ] **Step 4: `npm test` → PASS.**
- [ ] **Step 5: Commit** `git add src/lib/apiMethods.js electron && git commit -m "Operacje na danych, eksport i import z kopią zapasową (IPC)"`

---

### Task 4: Renderer: store bez persist, optymistyczne zmiany, panel kopii

**Files:**
- Create: `src/lib/api.js`, `src/lib/api.test.js`, `src/store/writeQueue.js`, `src/store/writeQueue.test.js`, `src/store/createScoreboardStore.js`, `src/store/createScoreboardStore.test.js`, `src/components/ErrorBanner.jsx`
- Modify: `src/store/useStore.js` (cienki), `src/App.jsx`, `src/main.jsx` (`createBrowserRouter` → `createHashRouter`, bo Electron ładuje `file://`), `vite.config.js` (`base: './'`), `src/components/BackupPanel.jsx` (wersja aplikacji), `src/styles/app.css`
- Delete: `src/lib/download.js` (pliki zapisuje teraz proces główny)

**Interfaces:**
- Consumes: `API_METHODS` (T3), kontrakt `Result` (T3), `pickData`, `formatCounts`, `summarize` (T1), `normalizeStep`, `snapToStep` (`src/lib/steps.js`)
- Produces:
  - `src/lib/api.js`: `class ApiError extends Error`. `createBridgeApi(bridge = globalThis.window?.scoreboard): Api | null` (`null`, gdy mostu brak, czyli zwykła przeglądarka). `Api` ma po jednej metodzie dla każdej nazwy z `API_METHODS`: `(...args) => bridge.invoke(name, ...args)`, przy czym `{ ok: true, value }` → `value`, a `{ ok: false, error }` → `ApiError(error)`. Odrzucone `invoke` → `ApiError('Błąd komunikacji z aplikacją')`.
  - `src/store/writeQueue.js`: `createWriteQueue({ revert, onError })` → `{ enqueue(send: () => Promise, snapshot: Data): void, isIdle(): boolean, whenIdle(): Promise<void> }`. Reguły:
    1. Zapisy idą ściśle po jednym, w kolejności `enqueue`.
    2. Błąd: porzuć niewysłane zapisy, `revert(snapshot nieudanego zapisu)`, `onError(err)`.
  - `createScoreboardStore({ api })` → hook zustand (`create`, **bez `persist`**). Stan początkowy: `pointStep: 5, weightStep: 1`, puste tablice, `sync: { status: api ? 'loading' : 'unavailable', lastError: null }`.
  - Akcje mają **niezmienione sygnatury i wartości zwracane**, więc strony i komponenty się nie zmieniają: `setSteps, addClass, updateClass, removeClass, addStudent, updateStudent, removeStudent, addCategory, updateCategory, removeCategory, pointStepFor, weightStepFor, awardPointsBulk, awardPoints`.
  - Nowe akcje: `load(): Promise<void>` (→ `'ready'` albo `'error'` + `lastError`), `exportToFile(): Promise<value>`, `importFromFile(): Promise<value>` (najpierw `whenIdle()`; po imporcie `load()`), `revealDatabase()`, `dismissError()`.
  - Usuwamy `seed()`, `persist`/`migrate`, `resetAll` i `removeEntry` (UI ich nie używa, a lokalna akcja bez zapisu byłaby pułapką).
  - Wzorzec mutacji: `const before = pickData(get())` → policz encję tak jak dziś → `set(...)` **synchronicznie** → `queue.enqueue(() => api.X(...), before)`.
    - Patch wysyła pola edytowalne z encji **po** zmianie (np. przyciętą wagę), tylko klucze z patcha.
    - No-op (nieistniejące id, pusta nazwa) → brak wywołania.
    - `awardPointsBulk` → jedno `api.createPoints(fresh)`.
    - `onError` → `lastError = \`Nie udało się zapisać zmian (${err.message}). Ostatnia zmiana została cofnięta.\``
  - `src/store/useStore.js`: `export const useStore = createScoreboardStore({ api: createBridgeApi() })`. Selektory `selectClass/selectStudents/selectCategories` zostają bez zmian.
  - `App.jsx`: na mount `load()`.
    - `'unavailable'` → `Ta strona działa tylko w aplikacji Arcade Scoreboard.`
    - `'loading'` → `Wczytywanie danych…`
    - `'error'` → `Nie udało się wczytać bazy danych.` + `lastError` + przycisk `Spróbuj ponownie`
    - `'ready'` → `<Outlet />` + `<ErrorBanner />` (pasek `role="alert"` z `lastError` i przyciskiem `✕` → `dismissError`)
  - `BackupPanel` (aplikacja):
    - Nagłówek `Kopia danych`. Opis: `Dane są zapisane w bazie na tym komputerze. Kopię (.json) możesz przenieść na inny komputer i tam zaimportować.`
    - `formatCounts` i przyciski `⬇ Eksportuj do pliku…`, `⬆ Importuj z pliku…`, `📁 Pokaż plik bazy`.
    - Wyniki: `Zapisano kopię: {path}`, `Zaimportowano: {formatCounts}`, lista ostrzeżeń, `Kopia poprzednich danych: {backupPath}`. Anulowanie → bez komunikatu.

- [ ] **Step 1: Napisz failujące testy**

```js
// src/lib/api.test.js
test('exposes every API method', () => assert.deepEqual(Object.keys(createBridgeApi(fakeBridge)).sort(), [...API_METHODS].sort()))
test('unwraps ok results and passes args', async () => { /* invoke('createClass', cls) → value */ })
test('ok:false → ApiError with the message', async () => await assert.rejects(api.getState(), { name: 'ApiError', message: 'Konflikt danych' }))
test('rejected invoke → ApiError', ...); test('no bridge → null', () => assert.equal(createBridgeApi(undefined), null))

// src/store/writeQueue.test.js
test('writes run one at a time, in order')    // drugi send nie startuje, dopóki pierwszy deferred nie jest rozwiązany
test('failure reverts that write's snapshot, drops queued writes, reports once')
  // enqueue(A,S0), enqueue(B,S1), enqueue(C,S2); A ok, B rejects → revert(S1), C nigdy nie wywołane, onError ×1
test('whenIdle resolves after the queue drains')

// src/store/createScoreboardStore.test.js — fake api: każda metoda dopisuje [nazwa, ...args] do calls; getState → demo.data
test('starts loading and empty — no demo seed', () => { const s = createScoreboardStore({ api }).getState(); assert.equal(s.sync.status, 'loading'); assert.deepEqual(s.classes, []) })
test('api null → unavailable')
test('load() hydrates; failure → error with message')
test('addClass is optimistic and sends the full entity', async () => {
  const cls = store.getState().addClass('Klasa 8B')
  assert.ok(store.getState().classes.some((c) => c.id === cls.id))   // synchronicznie
  await flush(); assert.deepEqual(calls.at(-1), ['createClass', cls])
})
test('removeClass cascades locally, one deleteClass call')
test('updateCategory sends the clamped weight')       // weightStep 1, {weight: 2.4} → stan 2 i ['patchCategory', id, { weight: 2 }]
test('awardPointsBulk: one createPoints for all')     // 3 uczniów × 2 kategorie → 6 wpisów; zwraca { entries: 6, students: 3 }
test('per-keystroke setSteps keeps order, last value wins (Review Focus 5)', async () => {
  for (const v of ['1', '12', '125']) store.getState().setSteps({ pointStep: v })
  assert.equal(store.getState().pointStep, 125)       // synchronicznie
  await flush(); assert.deepEqual(calls.filter((c) => c[0] === 'putSettings').map((c) => c[1].pointStep), [1, 12, 125])
})
test('failed write reverts and sets lastError')       // createPoints rejects → entries jak przed, lastError =~ /cofnięta/
test('mutating an unknown id sends nothing')
test('importFromFile waits for pending writes, then reloads state')
```

- [ ] **Step 2: `npm test` → FAIL.**
- [ ] **Step 3: Zaimplementuj `api.js`, `writeQueue.js`, store, `useStore.js`, `App.jsx`, `ErrorBanner`, `BackupPanel`, hash router, `base: './'`.** Usuń `download.js`.
- [ ] **Step 4: `npm test` → PASS.** `npm run build` przechodzi.
- [ ] **Step 5: Commit** `git add -A src vite.config.js && git commit -m "Renderer jako klient bazy: optymistyczne zmiany, cofanie, eksport i import"`

---

### Task 5: Powłoka Electron (main, preload, dev, smoke)

**Files:**
- Create: `electron/main.js`, `electron/preload.cjs`, `electron/smoke.js`, `scripts/dev.mjs`, `scripts/smoke.mjs`
- Modify: `package.json` (`"main": "electron/main.js"`, skrypty `app:dev`, `app:smoke`)

**Interfaces:**
- Consumes: `openDb`, `readState` (T2), `createHandlers`, `registerIpc` (T3), `dist/` (T4)
- Produces:
  - `electron/main.js` (ESM; `__dirname` liczony z `import.meta.url`):
    - Gdy ustawione `SCOREBOARD_DATA_DIR`: `app.setPath('userData', dir)` przed `ready`.
    - `app.requestSingleInstanceLock()`; brak blokady → `app.quit()`; `second-instance` → przywróć i zfokusuj okno (Review Focus 3).
    - Baza `join(userData, 'scoreboard.sqlite')`; `createHandlers(db, { dialogs: dialog, shell, dbPath, backupDir: join(userData, 'kopie') })`; `registerIpc(ipcMain, handlers, isTrustedSender)`.
    - Okno: `BrowserWindow({ width: 1280, height: 800, title: 'Arcade Scoreboard', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } })`. Dev: `loadURL(process.env.VITE_DEV_SERVER_URL)`; prod: `loadFile(join(__dirname, '../dist/index.html'))`.
    - `isTrustedSender`: `event.senderFrame.url` zaczyna się od URL dev serwera albo od `file://` katalogu `dist`.
    - `will-navigate` spoza aplikacji → `preventDefault`; `setWindowOpenHandler(() => ({ action: 'deny' }))`.
    - `will-quit` → `db.close()`.
    - `SCOREBOARD_SMOKE=1` → po `did-finish-load` `runSmoke(win, db, userData)`.
  - `electron/preload.cjs`: tylko `contextBridge.exposeInMainWorld('scoreboard', { invoke: (method, ...args) => ipcRenderer.invoke('scoreboard', method, ...args) })`. Preload w sandboksie nie może importować plików aplikacji, dlatego biała lista żyje w main.
  - `electron/smoke.js`: `runSmoke(win, db, outDir)`.
    1. Odpytuj `executeJavaScript('document.body.innerText')` (max 15 s), aż pojawi się nazwa pierwszej klasy z `readState(db)`.
    2. Ustaw `location.hash = '#/class/<id>/ranking'` i odczekaj, aż pojawi się tekst `Tablica wyników`.
    3. `win.reload()` i ponownie poczekaj na `Tablica wyników` (odświeżenie na widoku rankingu).
    4. `capturePage()` → `outDir/smoke.png`, wypisz `SMOKE OK`, `app.exit(0)`. Timeout lub wyjątek → `SMOKE FAIL <powód>`, `app.exit(1)`.
  - `scripts/dev.mjs`: `createServer()` z `vite` → `listen()` → spawn `electron .` z `VITE_DEV_SERVER_URL`; zamknięcie Electron zamyka Vite. Skrypt `"app:dev": "node scripts/dev.mjs"`.
  - `scripts/smoke.mjs [--app <plik wykonywalny>]`: tymczasowy katalog → `openDb` + `importData(demo)` + `close` → spawn (domyślnie `electron .`, z `--app` spakowana aplikacja) z `SCOREBOARD_DATA_DIR` i `SCOREBOARD_SMOKE=1`. Exit 0 tylko przy `SMOKE OK`; wypisuje ścieżkę do `smoke.png`. Skrypt `"app:smoke": "npm run build && node scripts/smoke.mjs"`.

- [ ] **Step 1: Zaimplementuj pliki z listy.**
- [ ] **Step 2: `npm run app:smoke` → exit 0, `SMOKE OK`.** Obejrzyj `smoke.png` (Read): podium „Klasa 7B” z wynikami z fixture.
- [ ] **Step 3: Druga instancja (Review Focus 3).** `SCOREBOARD_DATA_DIR=$(mktemp -d) npx electron . &`, potem z tym samym katalogiem `timeout 15 npx electron .; echo $?` → `0` w ciągu kilku sekund (druga instancja kończy się sama), a pierwsze okno dalej działa.
- [ ] **Step 4: Ręcznie z `npm run app:dev`.**
  1. Import `test/fixtures/demo-export.json` przez „Importuj z pliku…” → klasy widoczne.
  2. Przyznaj punkty i zamknij aplikację; po ponownym otwarciu punkty są.
  3. Eksport do pliku → plik przechodzi `parseImport`.
  4. Ponowny import pokazuje dialog z ostrzeżeniem o zastąpieniu i tworzy plik w `kopie/`.
- [ ] **Step 5: Commit** `git add electron scripts package.json && git commit -m "Powłoka Electron: okno, IPC, pojedyncza instancja, smoke test"`

---

### Task 6: Instalator `ScoreboardSetup.exe` (Docker) + README

**Files:**
- Create: `electron-builder.yml`, `scripts/build-win.sh`
- Modify: `package.json` (`react`, `react-dom`, `react-router-dom`, `zustand` → `devDependencies`, bo Vite wbudowuje je w `dist/`, a electron-builder pakuje tylko `dependencies`; devDependency `electron-builder@26.18.0`; skrypty `dist:win`, `dist:linux-dir`), `.gitignore` (`release/`), `README.md`

**Interfaces:**
- Consumes: `npm run build`, `electron/**`, `scripts/smoke.mjs --app` (T5)

`electron-builder.yml` (dokładnie):
```yaml
appId: app.arcade-scoreboard
productName: Arcade Scoreboard
directories: { output: release }
files:
  - package.json
  - dist/**
  - electron/**
  - "!electron/**/*.test.js"
  - src/lib/exportFormat.js
  - src/lib/steps.js
  - src/lib/apiMethods.js
win:
  target: nsis
nsis:
  oneClick: true
  perMachine: false
  artifactName: ScoreboardSetup.exe
  shortcutName: Arcade Scoreboard
  createDesktopShortcut: true
  deleteAppDataOnUninstall: false
linux:
  target: dir
```

`scripts/build-win.sh` ma spełniać: repo zamontowane tylko do odczytu; kopia w kontenerze bez `node_modules`, `dist`, `release`; `npm ci && npm run build && npx electron-builder --win nsis`; gotowy `.exe` trafia do `release/` na hoście z właścicielem `$(id -u):$(id -g)`; cache `~/.cache/electron` i `~/.cache/electron-builder` zamontowane. Szkielet:
```bash
docker run --rm -v "$PWD":/src:ro -v "$PWD/release":/out \
  -v "$HOME/.cache/electron":/root/.cache/electron -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  electronuserland/builder:22-wine bash -c '
    mkdir /project && tar -C /src --exclude=node_modules --exclude=dist --exclude=release -cf - . | tar -C /project -xf - &&
    cd /project && npm ci && npm run build && npx electron-builder --win nsis &&
    cp release/ScoreboardSetup.exe /out/ && chown '"$(id -u):$(id -g)"' /out/ScoreboardSetup.exe'
```
Skrypty: `"dist:win": "bash scripts/build-win.sh"`, `"dist:linux-dir": "npm run build && electron-builder --linux dir"`.

- [ ] **Step 1: Utwórz `electron-builder.yml` i `build-win.sh`, przenieś zależności, dodaj skrypty.** `npm install` aktualizuje lockfile.
- [ ] **Step 2: Smoke na spakowanej aplikacji (Review Focus 4).** `npm run dist:linux-dir && node scripts/smoke.mjs --app release/linux-unpacked/arcade-scoreboard` → `SMOKE OK`. Brakujący plik z `files` daje tu `SMOKE FAIL` albo biały ekran.
- [ ] **Step 3: Build Windows.** `npm run dist:win` (pierwszy raz pobiera obraz kilku GB) → istnieje `release/ScoreboardSetup.exe`, a `file release/ScoreboardSetup.exe` pokazuje `PE32 executable … Nullsoft Installer`. Instalacji na Windowsie nie da się sprawdzić z tej maszyny; to zrobi użytkownik.
- [ ] **Step 4: README.** Opis jako aplikacji desktopowej.
  - **Dla nauczycielki:** uruchom `ScoreboardSetup.exe`. Instalator jest niepodpisany, więc SmartScreen pokaże „System Windows ochronił ten komputer” → „Więcej informacji” → „Uruchom mimo to”. Przy pierwszym starcie: „Importuj z pliku…” i wskaż plik z wersji przeglądarkowej (tag `v1.1-eksport`, ten sam adres co zwykle). Awaryjnie w konsoli DevTools starej wersji `copy(localStorage.getItem('arcade-scoreboard@v1'))`, wklej do pliku `.json` i zaimportuj.
  - **Gdzie są dane:** `%APPDATA%\Arcade Scoreboard\scoreboard.sqlite`, kopie w `kopie\`. Odinstalowanie nie usuwa danych. Przeniesienie na inny komputer: Eksportuj → Importuj.
  - **Dev:** `npm run app:dev`, `npm test`, `npm run app:smoke`, `npm run dist:linux-dir`, `npm run dist:win`.
  - Zaktualizuj „Stack” i „Project layout” (`electron/`, `scripts/`, `test/fixtures/`). Usuń zdanie o localStorage jako jedynym miejscu danych.
- [ ] **Step 5: Commit** `git add electron-builder.yml scripts/build-win.sh package.json package-lock.json .gitignore README.md && git commit -m "Instalator ScoreboardSetup.exe (electron-builder w Dockerze) i README"`

---

## Weryfikacja end-to-end

1. `npm test`: wszystkie testy z Tasków 1–4 zielone. `npm run build` przechodzi.
2. `npm run app:smoke` i smoke na `release/linux-unpacked`: `SMOKE OK`, zrzut rankingu wygląda poprawnie.
3. Pełna ścieżka migracji:
   1. `git checkout v1.1-eksport && npm run dev`, w przeglądarce z danymi „Pobierz kopię”.
   2. `git checkout feature/electron-sqlite && npm run app:dev` → „Importuj z pliku…”.
   3. Klasy, uczniowie i wyniki rankingu są identyczne jak w przeglądarce.
4. `release/ScoreboardSetup.exe` istnieje. Test instalacji robi użytkownik na Windowsie.

## Wykonanie

Rekomendacja: **Subagent-driven**. Taski są spięte wspólnymi kontraktami (`Data`, `API_METHODS`/`Result`, `createWriteQueue`), a błąd oznacza utracone punkty uczniów. Świeży reviewer po każdym tasku łapie rozjazd kontraktów, zanim zbuduje się na nim następny task. Task 1 można dostarczyć nauczycielce od razu po jego review.
