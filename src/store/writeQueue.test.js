import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWriteQueue } from './writeQueue.js'

const flush = () => new Promise((r) => setImmediate(r))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

test('writes run one at a time, in order', async () => {
  const q = createWriteQueue({ revert() {}, onError() {} })
  const log = []
  const a = deferred()
  q.enqueue(() => (log.push('a'), a.promise), {})
  q.enqueue(() => (log.push('b'), Promise.resolve()), {})
  await flush()
  assert.deepEqual(log, ['a'])
  assert.equal(q.isIdle(), false)
  a.resolve()
  await flush()
  assert.deepEqual(log, ['a', 'b'])
  assert.equal(q.isIdle(), true)
})

test("failure reverts that write's snapshot, drops queued writes, reports once", async () => {
  const reverted = []
  const errors = []
  const q = createWriteQueue({ revert: (s) => reverted.push(s), onError: (e) => errors.push(e) })
  const ran = []
  q.enqueue(() => (ran.push('A'), Promise.resolve()), 'S0')
  q.enqueue(() => (ran.push('B'), Promise.reject(new Error('x'))), 'S1')
  q.enqueue(() => (ran.push('C'), Promise.resolve()), 'S2')
  await q.whenIdle()
  assert.deepEqual(ran, ['A', 'B'])
  assert.deepEqual(reverted, ['S1'])
  assert.equal(errors.length, 1)
  assert.equal(errors[0].message, 'x')
})

test('whenIdle resolves after the queue drains', async () => {
  const q = createWriteQueue({ revert() {}, onError() {} })
  await q.whenIdle()
  const a = deferred()
  let done = false
  q.enqueue(() => a.promise, {})
  q.whenIdle().then(() => (done = true))
  await flush()
  assert.equal(done, false)
  a.resolve()
  await flush()
  assert.equal(done, true)
})

test('queue keeps working after revert/onError throws', async () => {
  const sent = []
  const q = createWriteQueue({
    revert() { throw new Error('revert boom') },
    onError() {},
  })
  const orig = console.error
  console.error = () => {}
  q.enqueue(() => Promise.reject(new Error('send boom')), {})
  await flush()
  assert.equal(q.isIdle(), true)
  q.enqueue(() => (sent.push('next'), Promise.resolve()), {})
  await flush()
  assert.deepEqual(sent, ['next'])
  console.error = orig
})
