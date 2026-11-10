import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openDb } from './db.js'
import { createHandlers, registerIpc } from './ipc.js'
import { runSmoke } from './smoke.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.env.SCOREBOARD_DATA_DIR) {
  app.setPath('userData', process.env.SCOREBOARD_DATA_DIR)
}

const devUrl = process.env.VITE_DEV_SERVER_URL
const distUrl = pathToFileURL(join(__dirname, '../dist')).href + '/'
// Trusted origin/prefix of the app content (dev server origin or dist directory).
const trustedPrefix = devUrl ? new URL(devUrl).origin + '/' : distUrl
const isTrustedUrl = (url) => typeof url === 'string' && url.startsWith(trustedPrefix)

let win = null
let db = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.on('will-quit', () => {
    try { db?.close() } catch (err) { console.error(err) }
    db = null
  })

  app.on('window-all-closed', () => app.quit())

  app.whenReady().then(() => {
    const userData = app.getPath('userData')
    const dbPath = join(userData, 'scoreboard.sqlite')
    db = openDb(dbPath)

    // Dialogs are bound to the live main window so they are modal.
    const dialogs = {
      showSaveDialog: (o) => dialog.showSaveDialog(win, o),
      showOpenDialog: (o) => dialog.showOpenDialog(win, o),
      showMessageBox: (o) => dialog.showMessageBox(win, o),
    }
    const handlers = createHandlers(db, {
      dialogs, shell, dbPath, backupDir: join(userData, 'kopie'),
    })
    registerIpc(ipcMain, handlers, (event) => isTrustedUrl(event.senderFrame?.url))

    const smoke = process.env.SCOREBOARD_SMOKE === '1'
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: 'Arcade Scoreboard',
      autoHideMenuBar: true,
      show: !smoke,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    win.on('closed', () => { win = null })

    win.webContents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) event.preventDefault()
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    if (smoke) {
      win.webContents.once('did-finish-load', () => { runSmoke(win, db, userData) })
    }

    if (devUrl) win.loadURL(devUrl)
    else win.loadFile(join(__dirname, '../dist/index.html'))
  })
}
