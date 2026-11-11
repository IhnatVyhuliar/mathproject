import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installCloseGuard } from './closeGuard.js'

function fakeWindow() {
  const handlers = {}
  return {
    closed: 0,
    addEventListener(type, fn) { handlers[type] = fn },
    removeEventListener(type, fn) { if (handlers[type] === fn) delete handlers[type] },
    close() { this.closed++ },
    // Returns true when the unload was cancelled.
    unload() {
      const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
      handlers.beforeunload?.(e)
      return e.defaultPrevented && e.returnValue === false
    },
  }
}

function fakeQueue() {
  let pending = 0
  let waiters = []
  return {
    add() { pending++ },
    finish() { pending = 0; waiters.forEach((r) => r()); waiters = [] },
    hasPendingWrites: () => pending > 0,
    whenIdle: () => (pending ? new Promise((r) => waiters.push(r)) : Promise.resolve()),
  }
}

test('no pending writes: the window closes normally', () => {
  const win = fakeWindow()
  installCloseGuard(win, fakeQueue())
  assert.equal(win.unload(), false)
  assert.equal(win.closed, 0)
})

test('pending writes: close is cancelled, then retried once the queue drains', async () => {
  const win = fakeWindow()
  const q = fakeQueue()
  installCloseGuard(win, q)
  q.add()
  assert.equal(win.unload(), true)
  assert.equal(win.unload(), true) // repeated clicks while draining
  await Promise.resolve()
  assert.equal(win.closed, 0)
  q.finish()
  await new Promise((r) => setImmediate(r))
  assert.equal(win.closed, 1) // one retry, however many clicks
  assert.equal(win.unload(), false) // the retry goes through
})

test('the returned function removes the guard', () => {
  const win = fakeWindow()
  const q = fakeQueue()
  const remove = installCloseGuard(win, q)
  q.add()
  remove()
  assert.equal(win.unload(), false)
})
