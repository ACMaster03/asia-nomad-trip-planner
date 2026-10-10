// Every path the web app serves must redirect from livhold.com to app.livhold.com once
// livhold.com is the landing page (#163, step 5): follow links, invites, digest emails and
// password resets already sent carry the old address. This fails when a route folder in
// product/src/app (or its (app) group) or a file in product/public has no redirect in
// landing/vercel.json, so a new screen cannot ship without one.
//
//   node --test landing/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const cfg = JSON.parse(readFileSync(new URL('landing/vercel.json', root), 'utf8'))
const APP = 'https://app.livhold.com'

const sources = new Map(cfg.redirects.map((r) => [r.source, r]))

// Paths the landing page answers itself, on purpose.
const OWN = new Set([
  'favicon.ico', // the landing page's own icon
  'sw.js', // the kill switch for the app's old service worker (landing/public/sw.js)
])

function entries(dir) {
  const url = new URL(dir, root)
  return readdirSync(url).map((name) => ({ name, isDir: statSync(new URL(name, url + '/')).isDirectory() }))
}

function expected() {
  const out = new Set(['_next/'])
  for (const { name, isDir } of entries('product/src/app')) {
    if (name === '(app)') {
      for (const sub of entries('product/src/app/(app)')) if (sub.isDir) out.add(sub.name + '/')
    } else if (isDir) out.add(name + '/')
    else if (name === 'manifest.ts') out.add('manifest.webmanifest')
  }
  for (const { name, isDir } of entries('product/public')) {
    if (name === 'sw.js' || name.startsWith('.')) continue // sw.js is build output; ours is the kill switch
    out.add(isDir ? name + '/' : name)
  }
  for (const own of OWN) out.delete(own)
  return out
}

test('every app path redirects to app.livhold.com, path kept, permanent', () => {
  for (const path of expected()) {
    // A folder needs two: the bare path (`/dashboard`, no trailing slash added) and
    // everything below it (`/dashboard/…`).
    const name = path.replace(/\/$/, '')
    const pairs = path.endsWith('/')
      ? [[`/${name}`, `${APP}/${name}`], [`/${name}/:path+`, `${APP}/${name}/:path+`]]
      : [[`/${name}`, `${APP}/${name}`]]
    for (const [source, destination] of pairs) {
      const r = sources.get(source)
      assert.ok(r, `no redirect for ${source} in landing/vercel.json`)
      assert.equal(r.destination, destination)
      assert.equal(r.permanent, true, `${source} must be permanent (308)`)
    }
  }
})

test('the landing page keeps its own root and files', () => {
  for (const source of sources.keys()) {
    assert.notEqual(source, '/', 'the root is the landing page')
    for (const own of OWN) assert.notEqual(source, `/${own}`)
  }
  for (const name of readdirSync(new URL('landing/public', root))) {
    assert.ok(!sources.has(`/${name}`) && !sources.has(`/${name}/:path+`), `${name} is a landing file and must not redirect`)
  }
})

test('no clean-URL rewriting gets ahead of the redirects', () => {
  // cleanUrls turned /offline.html into /offline on this project before the redirect ran.
  assert.notEqual(cfg.cleanUrls, true)
})

test('sw.js is served fresh', () => {
  const h = cfg.headers.find((x) => x.source === '/sw.js')
  assert.ok(h && h.headers.some((x) => x.key === 'Cache-Control' && /no-cache/.test(x.value)))
})
