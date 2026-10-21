/**
 * Show or hide each button under an assistant reply, and optionally collect the hidden ones into a 「⋯」 button.
 *
 * The buttons are shipped UI, not slot entries, so the only way to hide one without shadowing
 * `conversation.chat.node` is a stylesheet this half owns. The 「⋯」 trigger is a real slot entry
 * (`conversation.chat.assistant-actions`), and its popover only paints a card behind the shipped
 * buttons: they stay in place so their own click handlers (and clipboard activation) keep working.
 * Which buttons are on lives on the host: the Web GUI port changes every launch, so localStorage
 * would not survive a restart.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chat-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ROUTE = '/dsh-chat-actions'
    const ENDPOINT = `${ROUTE}/prefs`

    /** Key, switch label, one-line description. */
    const ACTIONS = [
      ['copy', '复制', '把回答全文复制到剪贴板'],
      ['like', '好评', '把回答标记为「好的回答」'],
      ['dislike', '差评', '把回答标记为「有问题的回答」'],
      ['branch', '分支', '在新对话里从这条回答继续'],
      ['usage', '用量', '本轮 token 用量明细'],
    ]
    const ORDER = ACTIONS.map(([key]) => key)
    const OVERFLOW = 'overflow'
    const OVERFLOW_ROW = [OVERFLOW, '收进「⋯」', '有按钮被隐藏时才能开启；开启后被隐藏的按钮收进一个「⋯」，点开就能用']

    // A button is identified by the name it carries, so a button someone else adds to the row cannot
    // shift the switches onto its neighbours. The names are the shipped `aria-label`s (never the
    // localized tooltip text), and the position below is only a fallback for an icon-only button.
    const ROW = '[data-clock="end"]'
    const NAMES = {
      Copy: 'copy',
      'Good response': 'like',
      'Bad response': 'dislike',
      'Branch into a new conversation': 'branch',
    }
    const TARGET = {
      copy: '> button:first-of-type',
      like: '[data-slot="conversation.chat.assistant-actions"] > button:nth-of-type(1)',
      dislike: '[data-slot="conversation.chat.assistant-actions"] > button:nth-of-type(2)',
      branch: '> button:last-of-type:not(:first-of-type)',
      usage: 'button[aria-haspopup="dialog"]',
    }

    // Popover geometry: one square cell per hidden button, parked at the coordinates the cell measures.
    const CELL = 24
    const PAD = 4
    const CARD_HEIGHT = 32
    const OPEN = `${ROW}[data-dca-open]`

    const STYLE_ID = 'dsh-chat-actions'

    const BASE = `
.dca-more { display: inline-flex; align-items: center; }
.dca-more-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; transition: background 120ms ease, color 120ms ease; }
.dca-more-btn:hover, .dca-more-btn[aria-expanded='true'] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dca-more-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dca-card { display: none; }
@media (prefers-reduced-motion: reduce) { .dca-more-btn { transition: none; } }
`

    const CSS = `
.dca-page { display: flex; flex-direction: column; gap: 12px; max-width: 660px; padding-bottom: 24px; }
.dca-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dca-note { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); margin: 0; }
.dca-list { display: flex; flex-direction: column; }
.dca-row { display: flex; align-items: center; gap: 16px; padding: 13px 0; cursor: pointer; }
.dca-row + .dca-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.dca-row:hover .dca-row-title { color: var(--dsw-alias-brand-primary); }
.dca-row-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.dca-row-title { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); transition: color 120ms ease; }
.dca-row-desc { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.dca-switch { position: relative; flex: none; width: 34px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); padding: 0; cursor: pointer; transition: background 140ms ease, border-color 140ms ease; }
.dca-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dca-switch:disabled { opacity: 0.45; cursor: default; }
.dca-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dca-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0,0,0,0.18); transition: transform 140ms ease; }
.dca-switch[aria-checked='true']::after { transform: translateX(14px); }
.dca-error { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-state-error-primary); margin: 0; }
.dca-pending { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }
@media (prefers-reduced-motion: reduce) { .dca-row-title, .dca-switch, .dca-switch::after { transition: none; } }
`

    let current = {}
    let loading
    let loaded = false

    // Everything under a reply is tagged with the key it answers to; the stylesheet matches that tag
    // and nothing else. A button this plugin does not ship keeps its own name as its key.
    const KEY_ATTR = 'data-dca-key'
    const NAME_ATTR = 'data-dca-name'
    const extras = []

    const watchers = new Set()
    const notify = () => watchers.forEach((watcher) => watcher())

    const selector = (key) => `[${KEY_ATTR}="${key}"]`

    /** Visible unless the host says otherwise; unknown keys never hide anything. */
    function visible(key) {
      return (TARGET[key] ? current[key] : current.extra?.[key]) !== false
    }

    /** Everything hideable right now, the shipped five first. */
    const hideable = () => [...ORDER, ...extras]

    /** The 「⋯」 collection is opt-in: collapsed buttons stay fully hidden until it is on. */
    function overflowOn() {
      return current[OVERFLOW] === true && hideable().some((key) => !visible(key))
    }

    /** The key one button answers to: a shipped name, the name it carries, or its position if unnamed. */
    function keyOf(row, button, claimed) {
      const name = String(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '')
        .trim()
        .replace(/["\\]/g, '')
        .slice(0, 60)
      if (NAMES[name] && !claimed.has(NAMES[name])) return { key: NAMES[name], name: NAMES[name] }
      // A live counter in the label (the usage chip carries the token count) must not mint a switch per value.
      const key = name.replace(/\d+/g, '#')
      if (key) return claimed.has(key) ? undefined : { key, name }
      // Icon-only: the shipped five were read off these positions.
      for (const builtin of ORDER) {
        if (claimed.has(builtin)) continue
        if (row.querySelector(`:scope ${TARGET[builtin]}`) === button) return { key: builtin, name: builtin }
      }
      return undefined
    }

    /**
     * Tag every button under a reply with the key it answers to, and repaint when a button this
     * plugin does not ship turns up. Rows mount long after this module applies, so `watch` calls
     * this on every change; tagging runs before the frame paints, so nothing flashes hidden.
     */
    function scan() {
      if (typeof document.querySelectorAll !== 'function') return
      let grew = false
      for (const row of document.querySelectorAll(ROW)) {
        const claimed = new Set()
        for (const button of row.querySelectorAll('button')) {
          if (button.closest('.dca-more')) continue
          const found = keyOf(row, button, claimed)
          if (!found) continue
          claimed.add(found.key)
          if (button.getAttribute(KEY_ATTR) !== found.key) button.setAttribute(KEY_ATTR, found.key)
          if (button.getAttribute(NAME_ATTR) !== found.name) button.setAttribute(NAME_ATTR, found.name)
          if (ORDER.includes(found.key) || extras.includes(found.key)) continue
          extras.push(found.key)
          extras.sort()
          grew = true
        }
      }
      if (grew) {
        paint()
        notify()
      }
    }

    /** Chat rows come and go; the buttons they carry do not exist when this module applies. */
    function watch() {
      if (typeof MutationObserver !== 'function' || !document.body) return
      new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true })
      scan()
    }

    function styleNode() {
      let style = document.getElementById(STYLE_ID)
      if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      return style
    }

    function paint() {
      const hidden = hideable().filter((key) => !visible(key))
      const rules = [BASE]
      for (const key of hidden) rules.push(`${ROW} ${selector(key)}{display:none !important}`)
      // The cell measures itself and parks the card with two custom properties on the row: the hidden
      // buttons are shipped DOM, so they can only be moved by CSS and cannot live inside our card.
      if (overflowOn()) {
        rules.push(
          `${OPEN} .dca-card{display:block; position:fixed; top:var(--dca-t); left:var(--dca-l); height:${CARD_HEIGHT}px; border-radius:10px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); box-shadow:0 8px 24px rgba(0,0,0,0.16); pointer-events:none; z-index:50}`,
        )
        hidden.forEach((key, index) => {
          const left = PAD + index * CELL
          rules.push(
            `${OPEN} ${selector(key)}{display:inline-flex !important; position:fixed; top:calc(var(--dca-t) + ${(CARD_HEIGHT - CELL) / 2}px); left:calc(var(--dca-l) + ${left}px); width:${CELL}px; height:${CELL}px; padding:0; align-items:center; justify-content:center; border-radius:6px; overflow:hidden; white-space:nowrap; z-index:51}`,
          )
        })
        // The usage trigger is icon + live text; a popover cell only has room for the icon.
        if (hidden.includes('usage')) rules.push(`${OPEN} ${selector('usage')} > span{display:none}`)
        // Flipped up: the shipped bubble hangs under the hovered cell and would force a wide gap
        // over the 「⋯」, so hide it and draw the same label above the cell instead.
        rules.push(`${OPEN}[data-dca-flip="up"] [role="tooltip"]{display:none !important}`)
        hidden.forEach((key, index) => {
          const center = PAD + index * CELL + CELL / 2
          rules.push(
            `${OPEN}[data-dca-flip="up"] ${selector(key)}[${NAME_ATTR}]:hover::before{content:attr(${NAME_ATTR}); position:fixed; top:calc(var(--dca-t) - 28px); left:calc(var(--dca-l) + ${center}px); transform:translateX(-50%); padding:2px 8px; border-radius:6px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:12px; line-height:1.5; white-space:nowrap; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.14); z-index:52}`,
          )
        })
      }
      styleNode().textContent = rules.join('\n')
    }

    async function call(method, body) {
      const response = await fetch(ENDPOINT, {
        method,
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      return payload
    }

    // Boot read diagnostics land in the profile's dsh-chat-actions.log: a page that loses the state
    // at launch cannot be inspected from inside the desktop shell, and guessing is worse.
    function diag(entry) {
      void fetch(`${ROUTE}/diag`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(() => {})
    }

    // The desktop shell forwards plugin requests to a host that may still be booting, so the first
    // read can fail through no fault of the page; one lost read must not hide nothing all session.
    async function readSaved() {
      for (let tries = 0; ; tries += 1) {
        try {
          return await call('GET')
        } catch (cause) {
          diag({ phase: 'load', tries, error: String(cause?.message ?? cause) })
          if (tries === 3) throw cause
          await new Promise((done) => setTimeout(done, 400 * (tries + 1)))
        }
      }
    }

    function load() {
      // Fetched once per page: the answer is cached, and a later visit must not replay an older
      // snapshot over a save the user already made (`save` is what keeps `current` truthful).
      if (loaded) return Promise.resolve(current)
      loading ??= readSaved()
        .then((saved) => {
          current = saved
          loaded = true
          paint()
          notify()
          diag({ phase: 'ok', hidden: hideable().filter((key) => !visible(key)).join(','), rules: styleNode().textContent.length })
        })
        .finally(() => {
          loading = undefined
        })
      return loading
    }

    function save(key) {
      // Shipped buttons are top-level keys; a discovered one lives in the per-button `extra` map.
      const patch = TARGET[key] ? { [key]: !visible(key) } : { extra: { [key]: !visible(key) } }
      return call('POST', patch).then((saved) => {
        current = saved
        paint()
        notify()
      })
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        className: 'dca-switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled,
        onClick: (event) => {
          event.stopPropagation()
          onChange(!checked)
        },
      })
    }

    /** The 「⋯」 cell of the shipped action row: opens the card the hidden buttons are painted over. */
    function More() {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      const [, bump] = React.useReducer((count) => count + 1, 0)

      React.useEffect(() => {
        watchers.add(bump)
        return () => watchers.delete(bump)
      }, [])

      const row = () => ref.current?.closest(ROW) ?? null
      const hidden = hideable().filter((key) => !visible(key))
      const collect = overflowOn() && hidden.length > 0

      // The popover rules key off the row, and the row is shipped DOM: it only carries our marker and
      // the two coordinates, which are measured here because only the browser knows the layout.
      React.useLayoutEffect(() => {
        const node = row()
        if (!node || !collect) return undefined
        if (!open) {
          node.removeAttribute('data-dca-open')
          node.removeAttribute('data-dca-flip')
          return undefined
        }
        const cell = ref.current.getBoundingClientRect()
        const width = hidden.length * CELL + PAD * 2
        const left = Math.max(8, Math.min(cell.left, window.innerWidth - width - 8))
        // Below the cell, or above it when the chat's own clipping box (the composer covers its
        // bottom edge) leaves no room — the last reply is exactly where the composer sits.
        let frame = node
        while (frame && getComputedStyle(frame).overflowY === 'visible') frame = frame.parentElement
        const bottom = (frame ?? document.documentElement).getBoundingClientRect().bottom
        const below = cell.bottom + 6
        const fitsBelow = below + CARD_HEIGHT + 8 <= bottom
        // Flipped up the label is drawn above the hovered cell (see paint), so the card can sit close
        // to the 「⋯」 instead of reserving the bubble's room.
        const top = fitsBelow ? below : Math.max(8, cell.top - CARD_HEIGHT - 8)
        node.style.setProperty('--dca-t', `${Math.round(top)}px`)
        node.style.setProperty('--dca-l', `${Math.round(left)}px`)
        node.setAttribute('data-dca-flip', fitsBelow ? 'down' : 'up')
        node.setAttribute('data-dca-open', '')
        return () => {
          node.removeAttribute('data-dca-open')
          node.removeAttribute('data-dca-flip')
          node.style.removeProperty('--dca-t')
          node.style.removeProperty('--dca-l')
        }
      }, [open, collect, hidden.join()])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const node = row()
          if (!node || !node.contains(event.target)) setOpen(false)
        }
        // A revealed shipped button lives in the row but outside this cell: use it, then close.
        const onClick = (event) => {
          if (!ref.current?.contains(event.target)) setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        // The card is placed once against the viewport: any scroll or resize invalidates it.
        const onEscapePlacement = () => setOpen(false)
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('click', onClick)
        document.addEventListener('keydown', onKeyDown)
        window.addEventListener('scroll', onEscapePlacement, true)
        window.addEventListener('resize', onEscapePlacement)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('click', onClick)
          document.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('scroll', onEscapePlacement, true)
          window.removeEventListener('resize', onEscapePlacement)
        }
      }, [open])

      if (!collect) return null

      return h(
        'span',
        { className: 'dca-more', ref },
        h(
          'button',
          {
            type: 'button',
            className: 'dca-more-btn',
            'aria-haspopup': 'menu',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': '更多操作',
            onClick: () => setOpen((value) => !value),
          },
          h(
            'svg',
            { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'currentColor' },
            [3.5, 8, 12.5].map((cx) => h('circle', { key: cx, cx, cy: 8, r: 1.3 })),
          ),
        ),
        h('div', { className: 'dca-card', style: { width: `${hidden.length * CELL + PAD * 2}px` } }),
      )
    }

    function Page() {
      const [error, setError] = React.useState(undefined)
      const [busy, setBusy] = React.useState(undefined)
      const [ready, setReady] = React.useState(false)
      const [, bump] = React.useReducer((count) => count + 1, 0)

      React.useEffect(() => {
        let alive = true
        const watcher = () => {
          if (!alive) return
          bump()
          setReady(true)
        }
        watchers.add(watcher)
        load().then(
          () => alive && setReady(true),
          (cause) => alive && setError(String(cause?.message ?? cause)),
        )
        return () => {
          alive = false
          watchers.delete(watcher)
        }
      }, [])

      const toggle = (key) => {
        setBusy(key)
        setError(undefined)
        save(key)
          .catch((cause) => setError(String(cause?.message ?? cause)))
          .finally(() => setBusy(undefined))
      }

      // The collection switch gates on having something to collect; the rest live under it.
      const rows = [OVERFLOW_ROW, ...ACTIONS, ...extras.map((id) => [id, id, '不是 DSH 自带的按钮，出现在回答底部时同样可以隐藏'])]
      const nothingHidden = !hideable().some((key) => !visible(key))
      const locked = (key) => (key === OVERFLOW && nothingHidden) || busy !== undefined

      return h(
        'div',
        { className: 'dca-page' },
        h('style', {}, CSS),
        h('h2', { className: 'dca-title' }, 'dsh-chat-actions'),
        h('p', { className: 'dca-note' }, '关掉的按钮会在每条回答底部隐藏。这里只管助手回答，代码块自带的复制按钮不受影响。'),
        ready
          ? h(
              'div',
              { className: 'dca-list' },
              rows.map(([key, title, desc]) =>
                h(
                  'div',
                  {
                    key,
                    className: 'dca-row',
                    onClick: () => {
                      if (!locked(key)) toggle(key)
                    },
                  },
                  h(
                    'div',
                    { className: 'dca-row-text' },
                    h('span', { className: 'dca-row-title' }, title),
                    h('span', { className: 'dca-row-desc' }, desc),
                  ),
                  h(Switch, { checked: visible(key), disabled: locked(key), label: title, onChange: () => toggle(key) }),
                ),
              ),
            )
          : h('p', { className: 'dca-pending' }, error ? `读取设置失败：${error}` : '读取中…'),
        error && ready ? h('p', { className: 'dca-error' }, error) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        paint()
        void load().catch(() => {})
        watch()
        // A settings nav entry of its own: the Plugins page's tabs buried this page two clicks deep.
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'dsh-chat-actions', order: 130, label: () => 'dsh-chat-actions' }, Page),
        )
        ctx.slots.inject('conversation.chat.assistant-actions', () =>
          ctx.slots.register({ name: 'conversation.chat.assistant-actions', id: 'dsh-chat-actions-more', order: 50 }, More),
        )
      },
    }
  },
})
