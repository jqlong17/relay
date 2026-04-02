# 05 时间线会话记录 - 原生 Codex 接入与工作区交互优化

## 基本信息

- 会话编号：`05`
- 日期：`2026-04-02 ~ 2026-04-03`
- 时区：`Asia/Shanghai (CST)`
- 记录目的：记录 Relay 从“前端原型 + 自定义 runtime 过渡层”继续推进到“直接复用 Codex 原生 thread / rollout / sqlite / resume 能力”的全过程，并补充最近一轮围绕 workspace、session、文件树、归档、切换流畅度、本地文件夹选择器与 hydration 问题的具体处理，便于下一位接手者继续做真实产品化。

## 时间线（过程 + 细节）

### 16:00 - 决定不再自己维护 session 真相源，改为复用 Codex 原生 thread

用户输入与问题背景：
- 用户追问当前对话 session 在 Codex CLI 中到底如何处理，是否存到 sqlite。
- 用户明确要求尽量复用 Codex 原生能力，而不是在 Relay 里重新造一套 session 存储。

AI 当时的判断：
- 如果 Relay 自己再维护一份 session / runtime / 历史数据，后续一定会和 Codex 原生 thread 体系发生分叉。
- 更合理的路径是：
  - Relay Web 只负责 UI
  - `local-bridge` 负责把前端请求转成 Codex app-server 的 JSON-RPC
  - session / turn / persisted history 直接以 Codex 的 thread 为准

这一步的核心产品/技术决策：
- Relay 的真实会话历史不再由 `SessionStore` 作为权威来源。
- 架构切换为：
  - `Relay Web -> local-bridge -> codex app-server (stdio JSON-RPC)`
- 继续保留 Relay 自己的 `workspace` 概念，但 session 的真实底层来自 Codex thread。

### 16:05 - 原生 app-server 协议摸底与验证

已完成的底层调研与验证：
- 真实 `codex` 可执行文件存在：
  - `/opt/homebrew/bin/codex`
- 验证 `codex app-server --listen stdio://` 可用
- 验证的关键 RPC：
  - `initialize`
  - `thread/list`
  - `thread/start`
  - `thread/read`
  - `thread/name/set`
  - `turn/start`

从 Codex 原生协议确认到的关键事实：
- `thread/list` 会返回 persisted thread，数据中包括：
  - `id`
  - `preview`
  - `createdAt`
  - `updatedAt`
  - `cwd`
  - `name`
  - `path`
  - `turns`
- `thread/start` 返回 thread 元数据，并且底层会持久化到 Codex 的 session 目录 / sqlite 体系中。
- `turn/start` 的 `input` 必须是数组：
  - 形如 `[{ type: "text", text: "..." }]`
- 实际通知流已确认：
  - `thread/status/changed`
  - `turn/started`
  - `item/started`
  - `item/completed`
  - `item/agentMessage/delta`
  - `turn/completed`

这一步的意义：
- 证明 Relay 可以不通过 `codex exec` 的一次性命令模式，而是直接挂到 Codex 官方 rich interface 协议上。

### 16:10 - local-bridge 新增 CodexAppServerService，开始替换旧 runtime 路径

已执行动作：
- 新增：
  - `services/local-bridge/src/services/codex-app-server.ts`
- 将 bridge server 主依赖切到 app-server：
  - `services/local-bridge/src/index.ts`
  - `services/local-bridge/src/server.ts`

`CodexAppServerService` 的职责：
- 启动 `codex app-server --listen stdio://`
- 自动完成 `initialize` / `initialized`
- 暴露统一方法：
  - `threadList`
  - `threadStart`
  - `threadRead`
  - `threadSetName`
  - `startTurnStream`

实现方式：
- 用 Node `spawn` 启动子进程
- 用 `readline` 读取 JSONL
- 自己管理 JSON-RPC request id / pending promise / notification listeners
- 用一个 `AsyncNotificationQueue` 把通知流映射给上层 route

### 16:20 - sessions 路由切到原生 Codex threads

已执行动作：
- 修改：
  - `services/local-bridge/src/routes/sessions.ts`

新的接口语义：
- `GET /sessions`
  - 调 `thread/list`
  - 当前先按 active workspace 的 `cwd` 过滤
- `POST /sessions`
  - 调 `thread/start`
  - 然后调 `thread/name/set`
- `GET /sessions/:id`
  - 调 `thread/read(includeTurns=true)` 读取完整会话

这里做的映射：
- `AppServerThread -> Relay Session summary`
- `AppServerTurn / AppServerItem -> Relay Message[]`

阶段性效果：
- Relay 的左侧 session 列表开始读取真实 Codex 持久化 thread，而不是临时内存对象。

### 16:30 - runtime 流式链路切到原生 turn/start

已执行动作：
- 修改：
  - `services/local-bridge/src/routes/runtime.ts`

实现策略：
- `POST /runtime/run`
  - 走 `threadRead`
  - 然后 `startTurnStream`
  - 将 app-server notifications 映射成前端现有的 `RuntimeEvent`
- `POST /runtime/run?stream=1`
  - 输出 NDJSON

具体映射规则：
- `item/agentMessage/delta` -> `message.delta`
- `item/completed`（agentMessage）-> `message.completed`
- `turn/completed` -> `run.completed / run.failed`

这一步的结果：
- Relay 继续保留原来的前端流式消费模型
- 但底层已经换成 Codex 原生 turn stream

### 16:40 - 真实 smoke test 打通，证明原生 thread/stream 可用

已执行验证：
- 真实请求 `GET /api/bridge/sessions`
  - 返回了来自 `~/.codex/sessions/...` 的 persisted threads
- 真实请求 `POST /api/bridge/sessions`
  - 创建了新的原生 Codex thread
- 真实流式 smoke：
  - `run.started`
  - `message.delta`
  - `message.completed`
  - `run.completed`

使用过的真实 smoke 内容：
- 新建 thread：
  - `019d4ef4-ab31-7372-bd80-5ffe7b590567`
- 流式 prompt：
  - `Reply with exactly: relay-web-ok`

真实观察到的流式结果：
- delta 分多段到达：
  - `relay`
  - `-web`
  - `-ok`
- 最终组合成：
  - `relay-web-ok`

意义：
- Relay workspace 页发送消息接原生 Codex stream 这条链路已经不再只是设计，而是已经真实可跑。

### 16:50 - 补 session/detail 的 materialize 降级逻辑

问题来源：
- 新建 thread 之后，在第一条 user message 发送前，`thread/read(includeTurns=true)` 会报错：
  - 该 thread 尚未 materialize，不能读 turns

如果不处理，会导致前端新建 session 后出现 `Request failed`。

已执行动作：
- 修改：
  - `services/local-bridge/src/routes/sessions.ts`

处理策略：
- 先尝试 `threadRead(threadId, true)`
- 如果失败，则降级到 `threadRead(threadId, false)`
- 这样新 session 详情会返回：
  - 合法的 thread 基础信息
  - 空消息数组

同时顺手处理的另一个问题：
- `GET /sessions/:id` 和 `POST /runtime/run` 不再依赖“当前 active workspace 必须存在”
- 只要 thread 存在，就允许继续读取或运行

原因：
- 否则 bridge 重启后，如果 workspace 没重新激活，会导致原生已存在的 thread 无法继续使用

### 17:00 - 补测试，确保原生链路改造不只是手工 smoke

已新增或更新的测试：
- `services/local-bridge/tests/integration/sessions-route.test.ts`
- `services/local-bridge/tests/integration/runtime-route.test.ts`

新增覆盖点包括：
- 空 thread 在未 materialize 时仍能返回空 messages
- 没有 active workspace 时，已有 thread 仍能继续 runtime
- archive 路由后续也在这里补充

阶段结果：
- `pnpm --filter local-bridge test` 通过

### 17:10 - workspace 页发消息真正接到原生 runtime stream

前端接入点：
- `apps/web/src/lib/api/bridge.ts`
- `apps/web/src/components/workspace-client.tsx`

已实现行为：
- workspace 页点击 `run`
- 先插入 optimistic user message
- 再插入 optimistic assistant streaming message
- 使用 `runSessionStream()` 消费 NDJSON
- 在前端逐条处理：
  - `message.delta`
  - `message.completed`
  - `run.completed`
  - `run.failed`

这一步的体验结果：
- workspace 页面不再是假数据演示
- 它已经是一个真实可向 Codex 发 prompt、并看到流式返回的工作台

### 17:20 - 用户反馈字体/布局/输入区可见性问题，继续收紧 workspace 页面

用户连续反馈的问题包括：
- 字体太小、太细，看不清
- 输入框底部有时看不到
- 不需要显示具体本地路径
- 风格希望继续接近已有截图：黑色、克制、终端感

已处理的方向：
- 提升消息可读性
- 确保 composer 固定在底部且可见
- 删除不必要的地址展示
- 继续收紧样式，让 workspace 更像真实工作台而不是 demo 页面

这一阶段的产品判断：
- 对于这类 agent 工作台，视觉风格不能只追求“好看”，必须优先保证：
  - 流式阅读
  - 输入稳定可见
  - 会话切换清楚
  - 文件区独立滚动

### 17:35 - 右侧文件树增加预览抽屉

用户要求：
- 右侧文件树支持垂直滚动
- 点击文件可预览
- `.md` 文件应尽量按 markdown 预览
- 需要可关闭的右侧抽屉

已执行动作：
- 前端支持：
  - 文件树独立滚动
  - 点击文件打开右侧 preview drawer
  - `.md` 用基础 markdown 渲染
  - 其他文本文件用 `pre` 预览
- 文件接口仍暂时使用 Relay 自己的 `files/tree` 与 `files/content`

技术判断：
- 这一块先不急着接 Codex 原生 `fs/*`，因为当前自有接口已经足够支撑前端原型验证
- 真正优先级更高的是 session/runtime 的原生化

### 17:45 - 右侧文件树从“平铺列表”改为真正树结构

用户反馈：
- 文件夹应该能展开
- 文件夹前应有 icon，与文件明显区分

已执行动作：
- `apps/web/src/components/workspace-client.tsx`
  - 文件树内部状态从扁平数组改为原始树 + collapsedFolders
- `apps/web/src/app/globals.css`
  - 增加 chevron / folder / file 的极简图标标记

交互调整：
- 文件夹支持展开/收起
- 文件继续打开预览
- 当前版本后续又根据用户反馈调整为：
  - 根目录默认展开
  - 其余文件夹默认收起
  - 点击文件夹就看到里面内容

这里暴露出来的一个真实问题：
- 用户第一次反馈“点击文件夹后看不到内容”，本质是因为最初实现为“默认展开，点击反而收起”，与直觉不符
- 随后重新改为更接近 Finder/IDE 的交互心智

### 18:00 - 左侧 session 支持归档，底层直接复用原生 thread/archive

用户要求：
- session 不需要硬删除
- 可以先做“归档”
- 在左侧 session 行的最右侧显示归档按钮
- 鼠标移入显示，点击后需要确认弹窗

协议调研结果：
- Codex app-server 原生支持：
  - `thread/archive`
  - `thread/unarchive`
- 没有公开的 `thread/delete`

产品判断：
- Relay 的“删除 session”产品语义，应优先定义为“归档”
- 不建议自己去删底层 rollout/jsonl/sqlite 记录

已执行动作：
- bridge 增加：
  - `threadArchive()` in `codex-app-server.ts`
  - `POST /sessions/:id/archive`
- web 增加：
  - `archiveSession()` API
  - 左侧 session hover 动作
  - 轻量确认弹窗

归档后的行为：
- 当前列表中移除
- 若归档的是当前激活 session，则自动切换到下一条
- 若无剩余 session，则中间区清空

### 18:10 - 归档按钮在窄布局里被标题挤没，继续修正左侧 session 行布局

用户反馈：
- 左侧看不到归档按钮
- 从截图判断，按钮不是没渲染，而是被长标题挤掉

已执行动作：
- 在 session 行右侧预留固定操作区
- 将归档按钮改为绝对定位到最右侧
- 标题继续单行截断，不再参与按钮宽度竞争

这一轮修正后的经验：
- 在窄侧栏里，操作按钮不应参与 flex 内容挤压
- 这类动作位必须是固定槽位

### 18:20 - 中间 header 文案调整为“最新一条”，支持定位最后消息

用户要求：
- 中间原有 `web-cli` 文案不合适
- 改成“最新一条”
- 点击后直接定位到当前会话最后一条消息

已执行动作：
- 将中间 header 右侧从展示性文案改为可点击按钮
- 点击后调用 `scrollToCurrentMessage("smooth")`

产品意义：
- 进一步减少装饰性文案
- 强化 workspace 页面“工作行为优先”的方向

### 18:25 - new session 出现闪烁，去掉整页 refresh 的切换方式

用户反馈：
- 点击 `new session` 时有明显闪烁

原因定位：
- 之前 `handleCreateSession()` 会走一次完整 `refreshWorkspaceData()`
- 这会触发全局 `isLoading`
- 造成左侧、中间区整块刷新

已执行动作：
- 创建 session 后：
  - 先本地插入到 session 列表
  - 立即切到新 session
  - 后台再单独 `getSession()` 补详情

效果：
- 不再触发整页 loading
- 新建会话的切换体验明显平滑

### 18:35 - session 切换不够丝滑，增加激活态即时切换 + 缓存 + 预热

用户反馈：
- 左侧点击 session 时“不够丝滑”

AI 当时的判断：
- 这不是缺动画，而是切换时在等待接口返回
- 左侧激活态和中间消息内容都晚了一拍

已执行动作：
- 引入 `activeSessionId`
  - 点击时立即切左侧选中态
- 引入 `sessionCacheRef`
  - 已读取过的 session 详情直接本地命中
- 页面加载完成后后台预热更多 session 详情
  - 先从 6 条提升到 20 条
- 引入 `activeSessionIdRef`
  - 防止异步返回乱序，把旧 session 内容写回当前界面

这一步的结果：
- session 第二次切换几乎即时
- 首次切换的等待概率显著下降
- 左侧视觉反馈先于网络返回发生

### 18:45 - 增加中间消息区的轻量 opacity 过渡

用户同意继续做两点优化：
- 中间消息区切换时做轻微 opacity 过渡
- 继续预热更多 session 详情

已执行动作：
- 新增 `isSessionSwitching` 状态
- 消息区在切换时增加：
  - `opacity`
  - `1px translateY`
  - 140ms 级别轻过渡
- 使用双 `requestAnimationFrame` 在切换完成后结束动画状态

设计原则：
- 过渡必须足够轻，不能变成“花哨动效”
- 重点是消除硬切感，而不是制造存在感

### 18:55 - workspace 打开方式从手输路径改为系统原生文件夹选择器

用户要求：
- 删除输入 workspace 路径的输入框
- 点击 `open workspace` 后直接弹本地文件夹选择框

关键技术判断：
- 浏览器自身无法直接获得用户选中的本地目录绝对路径
- 要实现这个体验，必须由本地 `local-bridge` 调起系统原生文件夹选择器

已执行动作：
- 新增：
  - `services/local-bridge/src/services/workspace-picker.ts`
- 通过 macOS `osascript` 调 `choose folder`
- bridge 新增接口：
  - `POST /workspaces/open-picker`
- web 前端改为：
  - 只显示 `open workspace`
  - 点击后走 picker 模式
  - 用户取消选择时返回 `canceled: true`，不报错

对应测试已补：
- `services/local-bridge/tests/integration/workspaces-route.test.ts`
  - 正常选择
  - 用户取消

产品意义：
- workspace 入口从“工程师调试心智”切到了“普通用户可理解的系统行为”

### 19:05 - 处理 hydration mismatch 与 dev server 重启

用户遇到的错误：
- Next.js hydration failed
- 服务端节点还是：
  - `<span class="workspace-header-meta">`
- 客户端节点已经是：
  - `<button class="workspace-header-link">`

分析结论：
- 这是 dev server 热更新状态不一致导致的 SSR/client tree mismatch
- 同时前端还有一个潜在隐患：
  - 消息时间使用 `toLocaleTimeString()`
  - 服务端与浏览器 locale 可能不同，未来也可能触发 hydration mismatch

已执行动作：
- 将消息时间改为稳定切片格式：
  - 直接显示 `HH:MM:SS`
- 重新检查源码，确认组件内没有旧 `span` 残留
- 根据用户要求重启开发服务：
  - 停旧进程
  - 重启 `pnpm --filter web dev`

当前验证状态：
- `web` dev server 已重新启动
- `local-bridge` 继续运行在 `127.0.0.1:4242`

## 本次会话形成的关键决策

- Relay 的真实 session / thread / 历史持久化，以 Codex 原生 app-server 能力为准，不再自己造一套真相源。
- `local-bridge` 的职责是“本地 UI 桥”，不是独立业务后端。
- session 的“删除”产品语义暂定为“归档”，直接复用 `thread/archive`。
- workspace 页面已经从原型进入“真实工作台”阶段：
  - 可流式对话
  - 可切换真实 session
  - 可浏览文件树
  - 可预览文件
- workspace 打开方式应优先走系统原生文件夹选择，而不是手输路径。
- UI 动效应非常轻，只用于消除硬切，不追求存在感。

## 当前代码层面的落地结果

- 原生 Codex 接入：
  - `services/local-bridge/src/services/codex-app-server.ts`
  - `services/local-bridge/src/routes/sessions.ts`
  - `services/local-bridge/src/routes/runtime.ts`
- workspace picker：
  - `services/local-bridge/src/services/workspace-picker.ts`
  - `services/local-bridge/src/routes/workspaces.ts`
- workspace 前端主工作台：
  - `apps/web/src/components/workspace-client.tsx`
  - `apps/web/src/lib/api/bridge.ts`
  - `apps/web/src/app/globals.css`

## 测试与验证状态

- `pnpm --filter local-bridge test` 已通过
- `pnpm --filter web lint` 已通过
- 真实 runtime stream smoke 已经通过
- 当前开发环境已重新启动：
  - web: `http://localhost:3000`
  - local-bridge: `http://127.0.0.1:4242`

## 当前遗留问题 / 下一位接手建议

- 右侧文件树虽然已支持文件夹展开/收起，但仍需要用户实际再验证一次是否完全符合预期；用户最后一次反馈“似乎看不到”，需继续在真实 UI 上复核交互结果。
- 左侧 session 的归档按钮虽然已做成固定槽位，但建议下一步改成极简图标，而不是文字，以节省窄侧栏宽度。
- `workspace` 页面顶部与左侧的按钮组仍可以继续收紧，尤其 `open workspace / new session` 的纵向节奏。
- session 当前仍是“读取真实 thread，再映射成 Relay Session”这一层适配；后续可以继续接：
  - `thread/unarchive`
  - `thread/resume`
  - `thread/fork`
  - 原生 rename / metadata
- 右侧文件接口仍使用 Relay 自己的 `files/tree` / `files/content` 路由；是否要切到 Codex 原生 `fs/*`，可以等 0.1.0 主线稳定后再评估。
