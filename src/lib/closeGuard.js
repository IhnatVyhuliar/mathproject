// Keeps the window open until queued writes reach the database. Edits show up
// on screen before they are saved, and closing or reloading the page throws
// away anything still waiting in the renderer's write queue.
export function installCloseGuard(win, { hasPendingWrites, whenIdle }) {
  let retrying = false
  const onBeforeUnload = (e) => {
    if (!hasPendingWrites()) return
    // Electron cancels the unload silently (no prompt) when it is prevented.
    e.preventDefault()
    e.returnValue = false
    if (retrying) return
    retrying = true
    whenIdle().then(() => {
      retrying = false
      win.close()
    })
  }
  win.addEventListener('beforeunload', onBeforeUnload)
  return () => win.removeEventListener('beforeunload', onBeforeUnload)
}
