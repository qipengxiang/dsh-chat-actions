# dsh-chat-actions

[中文说明](README.zh.md)

Show or hide each button that sits under every assistant reply in DeepSeek Harness, and keep the
hidden ones one click away behind a single `⋯`.

## The buttons

The switches in its settings page map one to one onto the action row at the end of a reply:

| Switch | Button |
| --- | --- |
| 复制 | copy the whole answer |
| 好评 | mark the answer as a good one |
| 差评 | mark the answer as a bad one |
| 分支 | continue from this reply in a new conversation |
| 用量 | token usage of this reply |

The copy button on a code block belongs to the editor, not to this row, and is never touched.

## 收进「⋯」

The first switch on the settings page, on by default:

- **on** — hidden buttons leave the row and reappear in a small popover under a `⋯` button. Hovering
  a revealed button still shows its shipped label bubble (`好的回答`, `在新对话中分支`, …), and the
  bubble is kept clear of the `⋯` so it can always be clicked again.
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

- Buttons are found positionally inside the shipped action row: copy is the first direct button,
  branch the last, usage the only dialog trigger, and the feedback pair the first two buttons of
  `conversation.chat.assistant-actions`. A shipped button inserted before copy, or another plugin's
  entry in front of the feedback pair, would shift what a switch hides. The `shortcut:` comment in
  `client.js` marks this.
- The `⋯` popover is placed with measured coordinates (24px cells, 32px card); the 40px gap left
  above the row is sized for the shipped label bubble. A different bubble size would need that
  constant updated.
