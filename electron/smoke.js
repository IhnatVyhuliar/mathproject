// Smoke test driver: runs inside the Electron main process (SCOREBOARD_SMOKE=1).
import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readState } from './db.js'

const TIMEOUT_MS = 15000

async function waitForText(win, text) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const body = await win.webContents.executeJavaScript('document.body.innerText')
    if (body.includes(text)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`timeout czekając na tekst: ${text}`)
}

export async function runSmoke(win, db, outDir) {
  try {
    const first = readState(db).classes[0]
    if (!first) throw new Error('brak klas w bazie')
    await waitForText(win, first.name)

    await win.webContents.executeJavaScript(`location.hash = '#/class/${first.id}/ranking'`)
    await waitForText(win, 'Tablica wyników')

    const loaded = new Promise((r) => win.webContents.once('did-finish-load', r))
    win.reload()
    await loaded
    await waitForText(win, 'Tablica wyników')

    const image = await win.webContents.capturePage()
    if (image.isEmpty()) throw new Error('capturePage zwrócił pusty obraz')
    const file = join(outDir, 'smoke.png')
    writeFileSync(file, image.toPNG())
    console.log(`SMOKE PNG ${file}`)
    console.log('SMOKE OK')
    app.exit(0)
  } catch (err) {
    console.log(`SMOKE FAIL ${err?.message ?? err}`)
    app.exit(1)
  }
}
