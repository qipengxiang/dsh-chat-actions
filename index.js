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

/** One key per button the browser half can hide; `true` means visible. `overflow` is not a button:
 * it collects the hidden ones behind a 「⋯」 cell instead of hiding them outright. */
export const DEFAULTS = { copy: true, like: true, dislike: true, branch: true, usage: true, overflow: true }

/** Keep only known boolean keys: a hand-edited file or a stray request body cannot invent a button. */
export function sanitize(patch, current = DEFAULTS) {
  const next = { ...current }
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof patch?.[key] === 'boolean') next[key] = patch[key]
  }
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
