/**
 * Self-check for the two non-trivial pieces: preference sanitizing (host) and the stylesheet the
 * browser half builds from those preferences. No framework, no network, no real DOM.
 *
 * Run: node tests/self-check.mjs
 */
import assert from 'node:assert/strict'

import { DEFAULTS, sanitize } from '../index.js'

// Host side: unknown keys and non-booleans never become buttons or values.
assert.deepEqual(sanitize(undefined), DEFAULTS)
assert.deepEqual(sanitize({ copy: false }), { ...DEFAULTS, copy: false })
assert.deepEqual(sanitize({ copy: 'no', usage: 0, extra: true }), DEFAULTS)
assert.deepEqual(sanitize({ like: false }, { ...DEFAULTS, copy: false }), { ...DEFAULTS, copy: false, like: false })
// Buttons the page reports (another plugin's, or one added by hand) keep their own map.
assert.deepEqual(sanitize({ extra: { 'Good response': false } }), { ...DEFAULTS, extra: { 'Good response': false } })
assert.deepEqual(sanitize({ extra: { a: 'no', b: true } }, { ...DEFAULTS, extra: { c: false } }), {
  ...DEFAULTS,
  extra: { c: false, b: true },
})
assert.deepEqual(sanitize({ extra: { ['x'.repeat(61)]: false } }), DEFAULTS)

// `overflow` is state like the rest, so it survives a write-back that only touches one button.
assert.deepEqual(sanitize({ overflow: true }, { ...DEFAULTS, copy: false }), { ...DEFAULTS, copy: false, overflow: true })

// Browser side: the hidden set becomes CSS rules, and a visible button gets no rule.
const appended = []
const documentStub = {
  getElementById: (id) => appended.find((node) => node.id === id) ?? null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild: (node) => appended.push(node) },
  querySelectorAll: () => [],
  body: {},
}

let definition
const React = { createElement: () => null }

globalThis.window = { __ModuleLoader__: { load: (module) => (definition = module) } }
globalThis.document = documentStub

await import('../client.js')

/** Boot the browser half against one saved-preferences payload and return the CSS it painted. */
const diagBodies = []
async function paint(saved) {
  let requests = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/diag')) {
      diagBodies.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ ok: true }) }
    }
    requests += 1
    return { ok: true, json: async () => saved }
  }
  const client = definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require(${id})`)
  })
  const injected = []
  client.apply({
    slots: {
      inject: (name, setup) => injected.push(name) && setup(),
      register: (options) => options,
    },
  })
  assert.deepEqual(client.inject, ['slots'])
  assert.deepEqual(injected, ['settings.section', 'conversation.chat.assistant-actions'])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(requests, 1)
  return appended[0].textContent
}

const HIDDEN = { copy: false, like: true, dislike: false, branch: true, usage: false }

const K = (key) => `\\[data-clock="end"\\] \\[data-dca-key="${key}"\\]`

// Collection off: hidden buttons are hidden outright and nothing paints a popover.
const plain = await paint({ ...HIDDEN, overflow: false })
assert.match(plain, /\[data-clock="end"\] \[data-dca-key="copy"\]\{display:none !important\}/)
assert.match(plain, /\[data-clock="end"\] \[data-dca-key="dislike"\]\{display:none !important\}/)
assert.match(plain, /\[data-clock="end"\] \[data-dca-key="usage"\]\{display:none !important\}/)
assert.doesNotMatch(plain, /data-dca-key="like"/)
assert.doesNotMatch(plain, /data-dca-key="branch"/)
assert.doesNotMatch(plain, /data-dca-open/)

// Collection on: still hidden until opened, then one 24px cell per hidden button, parked at the
// coordinates the cell measures onto the row (a fixed card, so the chat's scroll container cannot clip it).
const collected = await paint({ ...HIDDEN, overflow: true })
assert.match(collected, /\[data-clock="end"\] \[data-dca-key="copy"\]\{display:none !important\}/)
assert.match(collected, /\[data-clock="end"\]\[data-dca-open\] \.dca-card\{display:block; position:fixed; top:var\(--dca-t\); left:var\(--dca-l\);/)
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\] \[data-dca-key="copy"\]\{display:inline-flex !important; position:fixed; top:calc\(var\(--dca-t\) \+ 4px\); left:calc\(var\(--dca-l\) \+ 4px\);/,
)
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\] \[data-dca-key="dislike"\]\{display:inline-flex !important; position:fixed;[^}]*left:calc\(var\(--dca-l\) \+ 28px\);/,
)
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\] \[data-dca-key="usage"\]\{display:inline-flex !important; position:fixed;[^}]*left:calc\(var\(--dca-l\) \+ 52px\);/,
)
// The usage trigger is icon + live text: the cell only keeps the icon.
assert.match(collected, /\[data-clock="end"\]\[data-dca-open\] \[data-dca-key="usage"\] > span\{display:none\}/)
// Flipped up: the shipped bubble is hidden and every cell draws the same label above the card, so
// the card can sit next to the 「⋯」 instead of reserving the bubble's room below the icon.
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\]\[data-dca-flip="up"\] \[role="tooltip"\]\{display:none !important\}/,
)
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\]\[data-dca-flip="up"\] \[data-dca-key="copy"\]\[data-dca-name\]:hover::before\{content:attr\(data-dca-name\); position:fixed; top:calc\(var\(--dca-t\) - 28px\); left:calc\(var\(--dca-l\) \+ 16px\);/,
)
assert.match(
  collected,
  /\[data-clock="end"\]\[data-dca-open\]\[data-dca-flip="up"\] \[data-dca-key="usage"\]\[data-dca-name\]:hover::before\{[^}]*left:calc\(var\(--dca-l\) \+ 64px\);/,
)

// A button this plugin does not ship is tagged with its own name and gets its own switch — and it
// cannot steal a switch from the shipped button it was inserted next to.
globalThis.MutationObserver = class {
  observe() {}
}
const makeButton = (label, text = '') => {
  const attrs = { 'aria-label': label }
  return {
    attrs,
    textContent: text,
    getAttribute: (key) => attrs[key] ?? null,
    setAttribute: (key, value) => {
      attrs[key] = value
    },
    closest: () => null,
  }
}
const copyButton = makeButton('Copy')
const extraButton = makeButton('My tool', 'My tool')
const branchButton = makeButton('Branch into a new conversation')
documentStub.querySelectorAll = (selector) =>
  selector === '[data-clock="end"]'
    ? [{ querySelector: () => null, querySelectorAll: () => [copyButton, extraButton, branchButton] }]
    : []

const discovered = await paint({ ...DEFAULTS, extra: { 'My tool': false } })
assert.equal(copyButton.attrs['data-dca-key'], 'copy')
assert.equal(branchButton.attrs['data-dca-key'], 'branch')
assert.equal(extraButton.attrs['data-dca-key'], 'My tool')
assert.equal(extraButton.attrs['data-dca-name'], 'My tool')
assert.match(discovered, /\[data-clock="end"\] \[data-dca-key="My tool"\]\{display:none !important\}/)
// Nothing shipped is hidden, so the shipped five paint no hide rule — the row is tagged, not guessed.
assert.doesNotMatch(discovered, /data-dca-key="copy"\]\{display:none/)
assert.doesNotMatch(discovered, /data-dca-key="branch"\]\{display:none/)

// Collection on but nothing hidden: no popover at all.
const idle = await paint({ ...DEFAULTS, overflow: true })
assert.doesNotMatch(idle, /data-dca-open/)
assert.doesNotMatch(idle, /data-dca-flip/)
assert.doesNotMatch(idle, /\.dca-card\{display:block/)

// A boot read is retried, and both outcomes are recorded where a lost launch can be read back.
assert.deepEqual(
  diagBodies.filter((body) => body.phase === 'ok').map((body) => body.hidden).slice(-3),
  ['copy,dislike,usage', 'My tool', ''],
)

// A read that fails at launch is retried instead of leaving a whole session unthemed.
let calls = 0
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/diag')) return { ok: true, json: async () => ({ ok: true }) }
  calls += 1
  if (calls < 3) throw new Error('Failed to fetch')
  return { ok: true, json: async () => ({ ...DEFAULTS, copy: false }) }
}
const retried = definition.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})
retried.apply({ slots: { inject: (name, setup) => setup(), register: (options) => options } })
await new Promise((resolve) => setTimeout(resolve, 1600))
assert.equal(calls, 3)
assert.match(appended[0].textContent, /\[data-dca-key="copy"\]\{display:none !important\}/)

console.log('self-check ok')
