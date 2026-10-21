/**
 * Show or hide each button under an assistant reply.
 *
 * The row is shipped UI: copy, like, dislike, branch and usage are not slot entries, so the browser
 * half hides them with CSS instead of shadowing `conversation.chat.node`. This half only owns the
 * durable state, because the Web GUI port changes on every launch and localStorage with it.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-chat-actions'

// No trailing slash: the carrier matches `path === prefix || path.startsWith(prefix + '/')`.
const ROUTE_PREFIX = '/dsh-chat-actions'
const STATE_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-chat-actions.json')
// Written by the browser half when it reads its state at boot: the only view into a launch that lost it.
const LOG_PATH = join(dirname(STATE_PATH), 'dsh-chat-actions.log')

/** One key per button the browser half can hide; `true` means visible. `overflow` is not a button:
 * it collects the hidden ones behind a 「⋯」 cell instead of hiding them outright. */
export const DEFAULTS = { copy: true, like: true, dislike: true, branch: true, usage: true, overflow: true }

// `extra` holds the buttons the page reports that this plugin does not ship — another plugin's, or
// one the user added by hand. Names come from the page, so both ends are bounded.
const MAX_EXTRA = 24
const MAX_NAME = 60

/** Keep only known boolean keys: a hand-edited file or a stray request body cannot invent a button. */
export function sanitize(patch, current = DEFAULTS) {
  const next = { ...current }
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof patch?.[key] === 'boolean') next[key] = patch[key]
  }
  // Merged, not replaced: one switch must not drop the state of every other discovered button.
  const extra = {}
  for (const [key, value] of Object.entries({ ...current?.extra, ...patch?.extra })) {
    if (typeof value === 'boolean' && key.length <= MAX_NAME && Object.keys(extra).length < MAX_EXTRA) {
      extra[key] = value
    }
  }
  if (Object.keys(extra).length > 0) next.extra = extra
  return next
}

function sendJSON(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJSON(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_048_576) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** A missing or unreadable file means "everything visible", never an error the page cannot fix. */
async function readState(path = STATE_PATH) {
  try {
    return sanitize(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

async function writeState(state, path = STATE_PATH) {
  await mkdir(dirname(path), { recursive: true })
  // Written beside the file and renamed: a crash mid-write must not leave a truncated file, which
  // would read back as DEFAULTS and silently turn every hidden button back on.
  const temp = `${path}.tmp`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`)
  await rename(temp, path)
}

/** Append one boot record; a reader tailing the file wants the last launches, not every page. */
async function appendDiag(entry) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(entry ?? {}).flatMap(([key, value]) =>
        typeof value === 'number' || typeof value === 'boolean'
          ? [[key, value]]
          : typeof value === 'string'
            ? [[key, value.slice(0, 300)]]
            : [],
      ),
    ),
  })
  try {
    const history = await readFile(LOG_PATH, 'utf8').catch(() => '')
    const kept = history.split('\n').filter(Boolean).slice(-199)
    await mkdir(dirname(LOG_PATH), { recursive: true })
    await writeFile(LOG_PATH, `${[...kept, line].join('\n')}\n`)
  } catch {}
}

export function apply(ctx) {
  function route(req, res) {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '') || 'prefs'
      try {
        if (action === 'prefs' && (req.method === 'GET' || req.method === 'HEAD')) {
          return sendJSON(res, 200, await readState())
        }
        if (action === 'prefs' && req.method === 'POST') {
          const next = sanitize(await readJSON(req), await readState())
          await writeState(next)
          return sendJSON(res, 200, next)
        }
        if (action === 'diag' && req.method === 'POST') {
          await appendDiag(await readJSON(req))
          return sendJSON(res, 200, { ok: true })
        }
        return sendJSON(res, 404, { error: `unknown action ${action}` })
      } catch (error) {
        return sendJSON(res, 500, { error: String(error?.message ?? error) })
      }
    })()
  }

  // `webServer` may activate after this plugin, so wait for it instead of reading it once.
  ctx.inject(['webServer'], (scope) => {
    const off = scope.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: route })
    return () => {
      try {
        off()
      } catch {}
    }
  })
}
