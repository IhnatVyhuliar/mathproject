// The inline script in index.html that sends old web links (/class/<id>/…)
// to hash routes. It runs before the app, so it is tested straight from the HTML.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1]

function redirectFor(href) {
  const u = new URL(href)
  let target = null
  const location = { protocol: u.protocol, origin: u.origin, pathname: u.pathname, search: u.search, replace: (t) => { target = t } }
  new Function('window', code)({ location })
  return target
}

test('old link → same page as a hash route', () => {
  assert.equal(redirectFor('https://math.reachit.space/class/abc/ranking'), 'https://math.reachit.space/#/class/abc/ranking')
})

test('never leaves the site (protocol-relative and backslash paths)', () => {
  for (const href of [
    'https://math.reachit.space//attacker.example/class/x',
    'https://math.reachit.space/\\attacker.example/class/x',
    'https://math.reachit.space///attacker.example/class/x',
  ]) {
    const target = redirectFor(href)
    assert.equal(new URL(target, 'https://math.reachit.space/').origin, 'https://math.reachit.space', `${href} → ${target}`)
  }
})

test('no redirect for the app root, hash routes and Electron (file://)', () => {
  assert.equal(redirectFor('https://math.reachit.space/'), null)
  assert.equal(redirectFor('https://math.reachit.space/#/class/abc/ranking'), null)
  assert.equal(redirectFor('file:///home/u/class/dist/index.html'), null)
})
