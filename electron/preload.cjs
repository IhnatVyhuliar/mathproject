const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed preload cannot import app files; the method whitelist lives in main.
contextBridge.exposeInMainWorld('scoreboard', {
  invoke: (method, ...args) => ipcRenderer.invoke('scoreboard', method, ...args),
})
