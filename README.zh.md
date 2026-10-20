# dsh-chat-actions

[English](README.md)

单独显示或隐藏 DeepSeek Harness 每条助手回答底部的按钮，并把隐藏掉的按钮收进一个 `⋯`，点一下就能用。

## 管哪些按钮

设置页里的开关与回答末尾的行动行一一对应：

| 开关 | 对应按钮 |
| --- | --- |
| 复制 | 复制回答全文 |
| 好评 | 标记为「好的回答」 |
| 差评 | 标记为「有问题的回答」 |
| 分支 | 在新对话里从这条回答继续 |
| 用量 | 本轮 token 用量明细 |

代码块右上角的复制按钮属于编辑器，不在这一行里，本插件不会动它。

## 收进「⋯」

设置页第一个开关，默认开启：

- **开** — 被关掉的按钮从行动行消失，收进 `⋯` 按钮下面的小弹出层。鼠标移到弹出层里的按钮上仍然会显示名字：弹出层在 `⋯` 下方时用官方那颗标签气泡，在 `⋯` 上方时（最后一条回答贴着输入框，只能往上翻）把同样的字画在图标上方——这样弹出层就能紧贴 `⋯`，不必为气泡留大空档。
- **关** — 关掉的按钮就直接消失，连 `⋯` 也不出现。
- 所有按钮都可见时这个开关是禁用的：没有东西可收，聊天里也不会渲染 `⋯`。

设置在设置抽屉里独立一项：设置 → dsh-chat-actions。状态存在 `$DSH_HOME/dsh-chat-actions.json`（默认 `~/.dsh/dsh-chat-actions.json`），不用 `localStorage`——Web GUI 每次启动换端口，按 origin 存的开关活不过一次重启。

## 安装

需要会加载插件包（`package.json` 里的 `dsh.bundle`）的 DeepSeek Harness。

在本目录下的 agent 会话里执行：

```
plugin_manager action=install_bundle target=/绝对路径/dsh-chat-actions
```

Harness 会把这个目录以 `link:` 方式链进当前 profile，所以改的是本目录源码，不是拷贝。装好后在「插件」页能看到这个 bundle，设置里也会多出对应的一项。

改动生效方式：

- `client.js` 和 `locale/*` 每次打开页面都会重新加载——刷新 GUI 即可（⌘R / Ctrl+R）。
- `index.js` 是宿主那一半，只在插件启动时运行——把 bundle 关掉再打开（`plugin_manager action=set_bundle target=dsh-chat-actions enabled=false`，再 `enabled=true`），或者重启 Harness。

卸载：`plugin_manager action=remove_bundle target=dsh-chat-actions`，或在「插件」页里移除。

## 自检

```
npm test
```

`tests/self-check.mjs` 用假的模块加载器和 `fetch` 跑一遍客户端代码，检查生成的样式表（每个关掉的按钮一条隐藏规则、`⋯` 的展开规则与格子位置）、`sanitize()` 会丢掉未知字段，以及两个 slot 的注册。

## 已知限制

- 按钮是按位置认的：复制是行内第一个直属按钮，分支是最后一个，用量是唯一带 `aria-haspopup="dialog"` 的，好评/差评是 `conversation.chat.assistant-actions` 里的前两个按钮。官方哪天在复制前面再插按钮，或者别的插件把条目排到反馈按钮前面，开关指向就会偏。`client.js` 里用 `shortcut:` 注释标了这一点。
- `⋯` 弹出层是按实测坐标摆的（格子 24px、卡片 32px）。上翻时标签取自按钮自身的 `aria-label`；官方哪天给某个按钮去掉 `aria-label`，那一格就只剩图标没有文字。
