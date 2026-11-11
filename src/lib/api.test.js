import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API_METHODS } from './apiMethods.js'
import { ApiError, createBridgeApi } from './api.js'

const bridgeOf = (fn) => ({ invoke: fn })

test('exposes every API method', () => {
  const api = createBridgeApi(bridgeOf(async () => ({ ok: true, value: null })))
  assert.deepEqual(Object.keys(api).sort(), [...API_METHODS].sort())
})

test('unwraps ok results and passes args', async () => {
  const calls = []
  const api = createBridgeApi(bridgeOf(async (...a) => (calls.push(a), { ok: true, value: 42 })))
  const cls = { id: 'c1' }
  assert.equal(await api.createClass(cls), 42)
  assert.deepEqual(calls, [['createClass', cls]])
})

test('ok:false → ApiError with the message', async () => {
  const api = createBridgeApi(bridgeOf(async () => ({ ok: false, error: 'Konflikt danych' })))
  await assert.rejects(api.getState(), { name: 'ApiError', message: 'Konflikt danych' })
})

test('rejected invoke → ApiError', async () => {
  const api = createBridgeApi(bridgeOf(async () => { throw new Error('boom') }))
  await assert.rejects(api.getState(), (e) => e instanceof ApiError && e.message === 'Błąd komunikacji z aplikacją')
})

test('no bridge → null', () => assert.equal(createBridgeApi(undefined), null))
