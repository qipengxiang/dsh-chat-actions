# dsh-chat-actions

[中文说明](README.zh.md)

Show or hide each button that sits under every assistant reply in DeepSeek Harness, and keep the
hidden ones one click away behind a single `⋯`.

## The buttons

The settings page lists exactly the buttons a rendered reply carries: open one assistant answer and
the page grows a switch per button it has. The shipped four keep the wording above; anything else
(another plugin's button, one you added by hand) is listed under its own name. No switch exists for
a button that is not on screen, and no button is listed twice — the usage chip, for instance, has a
text label of its own, so it shows up once under that name instead of as a second 「用量」.

Drag a switch row to set where that item sits in the row: the order is saved as dragged and
applies to every reply. The time stamp is an item too — it cannot be clicked, but it can be hidden
and moved like the rest.

The copy button on a code block belongs to the editor, not to this row, and is never touched.

## 收进「⋯」

The first switch on the settings page, on by default:

- **on** — hidden buttons leave the row and reappear in a small popover under a `⋯` button. Hovering
  a revealed button still shows its label: the shipped bubble when the popover opens downwards, and
  the same text drawn above the icon when it opens upwards (the last reply sits on the composer, so
  the popover has to flip) — that way the popover can sit right next to the `⋯`.
- **off** — hidden buttons are simply gone.
- The switch is disabled while every button is visible: there is nothing to collect, and no `⋯`
  renders in the chat in that state.

Settings live in its own section of the settings drawer: 设置 → dsh-chat-actions. State is stored in
`$DSH_HOME/dsh-chat-actions.json` (`~/.dsh/dsh-chat-actions.json` by default), not in
`localStorage`, because the Web GUI picks a new port on every launch and per-origin storage would not
survive a restart.

## Install

Needs a DeepSeek Harness build that loads plugin bundles (`dsh.bundle` in `package.json`).

From an agent session in this folder:

```
plugin_manager action=install_bundle target=/absolute/path/to/dsh-chat-actions
```

Harness links the folder into the active profile (`link:` in the profile `package.json`), so it keeps
tracking this source tree instead of a copy. After that it shows up as a bundle in 插件 and adds its
section to 设置.

Edits and restarts:

- `client.js` and `locale/*` are re-read on every page load — refresh the GUI (⌘R / Ctrl+R).
- `index.js` is the host half and only runs when the plugin starts — toggle the bundle off and on
  (`plugin_manager action=set_bundle target=dsh-chat-actions enabled=false`, then `enabled=true`), or
  restart Harness.

Remove it with `plugin_manager action=remove_bundle target=dsh-chat-actions`, or from the 插件 page.

## Test

```
npm test
```

`tests/self-check.mjs` stubs the module loader and `fetch`, then asserts the generated stylesheet
(one hide rule per switched-off button, the `⋯` reveal rules with their cell offsets), `sanitize()`
dropping unknown keys, and the slot registrations.

## Limits

- Buttons are found by name first (`aria-label`, then `title`, then text) and tagged with
  `data-dca-key`; the stylesheet only ever matches that attribute, so extra or reordered buttons
  cannot shift what a switch hides. Only a nameless icon button falls back to its position (first
  and last direct button, the only dialog trigger, the first two feedback buttons) — the `shortcut:`
  comment in `client.js` marks that fallback.
- Tagging runs in the mutation callback before the stylesheet is written, so a new button does not
  flash visible first; the settings page only lists a switch after a reply has rendered (before that
  it shows a one-line hint).
- Digits in a live label are folded (`Usage 129K tok` → `Usage #K tok`), so a changing counter cannot
  mint switches; the cost is that two buttons whose names differ only in digits, or two with the same
  name, share one switch.
- A key stays in `extra` in `$DSH_HOME/dsh-chat-actions.json` after its button stops appearing (up to
  24 of them), but it produces no row, because rows come from what is rendered.
- The `⋯` popover is placed with measured coordinates (24px cells, 32px card); a cell clips text and
  keeps the icon, and the name shows on hover.
- Sorting only flattens a **direct** wrapper. The usage chip sits in its own box, and the shipped usage
  popover measures that box, so it keeps its layout: `order` goes on the wrapper that is the real flex
  item (`data-dca-slot`), not on the button.
- Once the usage chip is collected into `⋯`, the shipped usage popover still opens at the chip's old
  spot instead of following the cell.
