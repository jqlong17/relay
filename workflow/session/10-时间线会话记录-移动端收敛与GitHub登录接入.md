# 10 时间线会话记录 - 移动端收敛与 GitHub 登录接入

## 基本信息

- 会话编号：`10`
- 日期：`2026-04-04` 至 `2026-04-05`
- 时区：`Asia/Shanghai (CST)`
- 记录目的：记录本轮围绕 `v0.0.2` 远程可达版的实测、移动端收敛、公共抽屉规范、记忆页落地、Supabase + GitHub 登录接入与真实回归问题修复过程，尤其保留“预期与实际差异”和用户关键决策，便于后续继续推进“用户登录账号后连接自己的本地 Codex”。

## 时间线（过程 + 细节）

### 2026-04-04 22:40 左右 - 启动 `v0.0.2` 本地联调，先跑通受密码保护的公网访问

用户目标：
- 先不租服务器。
- 先把 `v0.0.2` 跑通，并可被手机或外网设备访问。
- 先验证“登录后进入 Relay 工作区”的最小链路。

当时的预期：
- `pnpm dev:up` 拉起本地 web 与 bridge。
- 借助 `cloudflared tunnel --url http://127.0.0.1:3000` 暂时暴露到公网。
- 手机输入密码后应能进入网页工作区。

实际情况：
- 直接执行 `pnpm dev` 时，本地已有另一个 `next dev` 占用了 `3000` 端口，触发冲突。
- 改用 `pnpm dev:up` 后，`relay-web` 与 `relay-bridge` 才稳定由 `pm2` 管起来。
- `cloudflared` quick tunnel 能临时生成公网地址，但稳定性较差，且更换地址后需要重新测试。

关键差异：
- 预期是“启动后直接测试业务”，实际先卡在本地运行方式不统一。
- 预期是“公网验证主要看产品逻辑”，实际 quick tunnel 自身的不稳定和开发态 websocket 行为也会影响体验判断。

用户决策：
- 不先租服务器。
- 接受先用 `cloudflared quick tunnel` 做 `v0.0.2` 验证。
- 目标收敛为“先跑通，不先做生产化部署”。

涉及文件与脚本：
- [`dev-up.sh`](/Users/ruska/project/web-cli/dev-up.sh)
- [`ecosystem.config.cjs`](/Users/ruska/project/web-cli/ecosystem.config.cjs)

### 2026-04-04 22:44 - 23:00 - 手机首次访问公网地址，暴露出远程访问和移动端第一批真实问题

用户实测现象：
- 第一个 quick tunnel 可打开登录页，但“进入工作区”按钮点击无反应。
- 随后又出现 `1033` 错误。
- `cloudflared` 日志里出现：
  - `Unauthorized`
  - `The origin has been unregistered from Argo Tunnel`
  - `connection refused`

当时的预期：
- 只要密码登录成功，就能直接在手机端进入工作区。

实际情况：
- quick tunnel 会失效或中断。
- 开发态 `next dev` 的一些 websocket / HMR 请求会与隧道表现混在一起，造成误判。
- 手机端虽然后续成功登录，但页面并不适合移动端输入和浏览。

关键差异：
- 预期问题是“认证是否生效”，实际最先暴露的是“隧道稳定性 + 移动端页面根本没做完”。
- 预期移动端只是“桌面版缩小”，实际桌面布局直接搬到手机上不可用。

用户决策：
- 先不纠结 quick tunnel 是否可长期使用，它只承担临时验证。
- 立即把移动端当成独立产品面来收敛，而不是继续套用桌面页。

### 2026-04-04 23:00 - 2026-04-05 凌晨 - 移动端路由与功能边界第一次收敛

用户明确要求：
- 登录成功后默认进入 `/mobile`。
- 手机访问 `/workspace` 时自动重定向到 `/mobile`。
- 桌面端行为保持不变。

当时的预期：
- 只是补一个简单重定向规则。

实际情况：
- 一旦真的把手机流量打到 `/mobile`，立刻暴露出更深的问题：
  - 会话抽屉重叠严重。
  - 列表宽度和页面总宽度异常，需要横向滚动。
  - 底部输入框与消息滚动区互相遮挡。
  - iPhone / 手机浏览器聚焦输入框会自动缩放。
  - “打开工作区”仍然触发电脑端文件夹选择器，这对远程手机场景是错误交互。

关键差异：
- 预期是“补一条移动端入口路径”，实际变成“移动端信息架构与交互模型都需要重做”。
- 预期是“工作区操作沿用桌面端逻辑”，实际手机用户可能根本不在电脑旁，必须支持脱离桌面文件选择器的路径。

用户决策：
- 移动端功能先做减法，不追求桌面等价。
- 去掉移动端 `picker`。
- 移动端工作区面板只保留：
  - 当前工作区
  - 最近工作区
  - 收藏工作区
  - 折叠的“高级方式：输入路径”

涉及核心文件：
- [`apps/web/src/proxy.ts`](/Users/ruska/project/web-cli/apps/web/src/proxy.ts)
- [`apps/web/src/components/mobile/mobile-shell.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-shell.tsx)
- [`apps/web/src/components/mobile/mobile-workspace-drawer.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-workspace-drawer.tsx)
- [`apps/web/src/components/mobile/mobile-session-drawer.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-session-drawer.tsx)
- [`apps/web/src/components/mobile/mobile-composer.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-composer.tsx)
- [`apps/web/src/app/globals.css`](/Users/ruska/project/web-cli/apps/web/src/app/globals.css)

### 2026-04-05 凌晨 - 移动端从“修单点 bug”转向“统一抽屉规范”

用户反复指出的问题：
- 会话抽屉和工作区抽屉风格不一致。
- 每行列表高度不统一。
- 文案、标题、列表、分区之间的垂直空间浪费过大。
- 宽度仍有溢出，必须左右滑动才能看完整。
- 这些问题不能再靠页面级 patch 修。

用户明确提出的设计原则：
- 标题代表全局信息。
- 全局操作和关闭按钮应该放在同一 header 行。
- 列表才是主体内容。
- 垂直空间必须紧凑。
- 分区标题贴近列表。
- 新增 tab 时不能再出现一轮一轮单独修样式的问题。

当时的预期：
- 调几个 margin / gap 即可。

实际情况：
- 真正的问题不是某个值不对，而是移动端抽屉没有公共层抽象。
- 工作区和会话抽屉使用了页面级样式思路，所以一个修好另一个又歪。

关键差异：
- 预期是“局部 CSS 调优”，实际需要引入公共抽屉变体。
- 预期是“每个 tab 自己写”，实际需要统一的移动端信息密度与列表规范。

用户决策：
- 把这套密度规范抽成公共 `drawer variant`。
- 新 tab 统一使用：
  - `MobileDrawerList variant="compact"`
  - `MobileDrawerSection variant="compact"`
- 不再接受 `mobile-workspace-*`、`mobile-session-*` 这种页面级间距样式继续扩散。
- 具体密度规范收敛为：
  - 标题 `8px` 贴列表
  - 分区间 `8px`

结果：
- 移动端抽屉由页面级补丁思路转成组件层密度规范。
- 后续新增 tab 有了统一承载层。

### 2026-04-05 凌晨稍后 - 新增移动端“记忆”tab，用统一抽屉体系验证可扩展性

用户要求：
- 新增一个 tab：`记忆`
- 顶部 header 右侧包含年份选择器和关闭按钮
- 下方是按月显示的日历
- 一行显示 7 天
- 点击某天方块后弹出记忆详情面板，支持上下滚动，关闭后回到日历

当时的预期：
- 如果公共抽屉层已经抽对了，新增 `记忆` tab 应该不需要再重新修一次结构与密度问题。

实际情况：
- `记忆` tab 的加入成为对“公共抽屉层”是否真的成立的一次压力测试。
- 这一轮落地后，形成了后续移动端侧栏类功能的标准承载方式。

阶段性结果：
- 完成移动端 `记忆` 入口和日历结构。
- 形成单独提交：
  - `67a7688 Add mobile memories drawer and compact drawer variants`

用户决策：
- 接受“移动端先做少而稳”的思路。
- 功能优先级以远程查看、切换、轻量驱动为主，不追求手机端立即完整等价于桌面端。

### 2026-04-05 白天 - 从产品路线收敛到账号体系、云后端与设备绑定方案

用户提出的核心产品目标：
- 让任何人登录自己的账号后，都可以在网页端连接到“自己本地电脑上的 Codex / CLI”。
- 团队规模只有 1 个人，主要依赖 AI coding。

当时讨论的候选问题：
- 登录体系是 Google 还是 GitHub。
- 数据库用什么。
- 服务器放哪里。
- 是否需要 Vercel。
- Render / Supabase / 自租服务器如何选。
- 为什么需要设备绑定。

形成的主要判断：
- 登录优先用 `GitHub`，比 Google 更贴近开发者心智，也更适配“连接本地 Codex”这个产品定位。
- 身份与数据库优先交给 `Supabase`。
- 后续实时云 API / 设备中继更适合放在 `Render`。
- 不建议把 `Vercel` 作为这条链路的主后端承载。
- “设备绑定”不是额外复杂度，而是这个产品目标成立所必需的基础设施：
  - 用户账号只能证明“你是谁”
  - 设备绑定才解决“你能连接哪台本地机器”

关键差异：
- 预期可能是“先把账号登录做出来，公网访问就成了”。
- 实际上账号登录只解决身份，不解决“某个网页用户如何找到并连接属于自己的本地 relay / Codex”。

用户决策：
- 账号优先走 GitHub。
- 架构方向采用：
  - `Supabase` 承担 Auth + DB
  - `Render` 承担未来 Cloud API / Realtime Relay
- 暂不走“全部自己搭在一台独立服务器”这条重运维路线。

相关设计文档：
- [`workflow/设计/07-v0.2.0-远程接入性能与工程设计.md`](/Users/ruska/project/web-cli/workflow/设计/07-v0.2.0-远程接入性能与工程设计.md)
- [`workflow/设计/08-v0.x-单人团队产品演进路线图.md`](/Users/ruska/project/web-cli/workflow/设计/08-v0.x-单人团队产品演进路线图.md)
- [`workflow/设计/04-v0.0.2-远程可达版产品目标.md`](/Users/ruska/project/web-cli/workflow/设计/04-v0.0.2-远程可达版产品目标.md)

### 2026-04-05 白天稍后 - Supabase 接入前的基础设施配置

已完成的外部动作：
- 新建 Supabase 项目。
- 在 GitHub Developer Settings 中配置 OAuth App。
- 在 Supabase 中启用 GitHub provider。
- 加入本地开发可用的 redirect / site URL。
- 将 Supabase MCP 接入 Codex 并完成授权。

用户当时给出的具体配置动作：
- 允许本地 URL：
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`
  - `http://localhost:3001/**`
  - `http://127.0.0.1:3001/**`
- 明确确认了 OAuth App 中的一些开关项。

关键差异：
- 预期可能是“先建表再开发登录”。
- 实际 GitHub 登录接入本身不依赖业务表，只依赖 `Supabase Auth`。

用户决策：
- 先做 Auth，不先建业务表。
- 先把“GitHub 登录 + Relay 本地会话”这条链路跑通。

### 2026-04-05 白天 - GitHub 登录第一版实现：预期正确，真实链路失败

第一版实现思路：
- 在服务端发起 Supabase GitHub OAuth。
- 回调到服务端 route。
- 服务端直接换取会话并设置本地 `relay_session`。

当时的预期：
- 这条链路足够直接，能快速复用现有服务端认证思路。

实际情况：
- 真实测试时，用户完成 GitHub 授权后，页面显示：
  - `GitHub 登录失败，请重试。`

真实根因：
- Supabase GitHub OAuth 使用 `PKCE`。
- `code_verifier` 在浏览器端的存储上下文中。
- 第一版“由服务端主导整个 OAuth 回调”的实现，拿不到浏览器端的 PKCE 上下文，导致链路不成立。

关键差异：
- 预期是“服务端统一处理 OAuth 更简单”。
- 实际 `Supabase Auth + GitHub + PKCE` 的约束决定了：
  - 必须由浏览器发起 OAuth
  - 必须由浏览器完成 `code -> session` 交换
  - 服务端只能在拿到已证明身份的 access token 后，再建立 Relay 自己的本地会话

用户决策：
- 不废弃现有密码登录。
- 采用“GitHub 登录与密码登录并存”的策略，降低迁移风险。

### 2026-04-05 白天稍后 - GitHub 登录第二版实现：改成浏览器主导 PKCE，服务端只建立本地 `relay_session`

落地实现：
- 浏览器在登录页发起 `signInWithOAuth({ provider: "github" })`
- 回调页 `/auth/callback` 在浏览器中执行：
  - `exchangeCodeForSession(code)`
- 取得 Supabase `access_token` 后，浏览器再 POST 到：
  - `/api/auth/supabase-session`
- 服务端校验这个 `access_token` 对应的 Supabase 用户
- 校验成功后沿用现有模型，签发本地 `relay_session` cookie

相关文件：
- [`apps/web/src/lib/auth/supabase.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/supabase.ts)
- [`apps/web/src/app/api/auth/supabase-session/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/auth/supabase-session/route.ts)
- [`apps/web/src/app/auth/callback/page.tsx`](/Users/ruska/project/web-cli/apps/web/src/app/auth/callback/page.tsx)
- [`apps/web/src/components/auth-callback-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/auth-callback-client.tsx)
- [`apps/web/src/components/login-form.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/login-form.tsx)
- [`apps/web/src/app/login/page.tsx`](/Users/ruska/project/web-cli/apps/web/src/app/login/page.tsx)
- [`apps/web/src/lib/auth/guard.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/guard.ts)
- [`apps/web/src/config/messages.ts`](/Users/ruska/project/web-cli/apps/web/src/config/messages.ts)
- [`apps/web/src/lib/auth/session.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/session.ts)

同步移除的旧实现：
- `apps/web/src/app/api/auth/github/route.ts`
- `apps/web/src/app/api/auth/callback/route.ts`

阶段性验证：
- 认证相关路由测试通过。
- `web build` 通过。

### 2026-04-05 当前这一轮 - 再次出现“GitHub 登录失败”，先后定位到两个真实根因

用户最新反馈：
- 访问 [`http://localhost:3000/login`](http://localhost:3000/login) 时能够看到 GitHub 授权。
- 完成 GitHub 授权后，仍然显示：
  - `GitHub 登录失败，请重试。`

当时的预期：
- 浏览器主导 PKCE 的第二版已经足以解决真实登录失败。

实际情况：
- 在 `next dev` 开发环境里，回调页是客户端 `useEffect` 驱动的。
- 同一个 OAuth callback 在开发态可能被重复执行。
- 第一次执行会成功消费 `code`。
- 第二次执行再尝试 `exchangeCodeForSession(code)` 时，同一个 `code` 已被消费，从而落入“登录失败”的泛化提示。

第一层具体差异：
- 预期失败根因已经全部被 PKCE 修掉。
- 实际还存在“开发态双执行 / 重复消费 code”的幂等性问题。

第一阶段修复动作：
- 新增 OAuth callback 幂等 helper：
  - [`apps/web/src/lib/auth/oauth-callback.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/oauth-callback.ts)
- 在回调页改为：
  - 若浏览器已有 Supabase session，直接复用，不再重复换 code
  - 若同一个 code 正在处理，则等待已有 session 落盘
  - 只有真正第一次进入时才执行 `exchangeCodeForSession(code)`
- 回调页补充更明确的 `console.error`
- 服务端建立本地 `relay_session` 的接口继续保持不变

配套测试：
- [`apps/web/tests/unit/oauth-callback.test.ts`](/Users/ruska/project/web-cli/apps/web/tests/unit/oauth-callback.test.ts)

第一阶段验证：
- `pnpm --filter web test -- tests/unit/oauth-callback.test.ts tests/unit/auth-routes.test.ts tests/unit/auth-guard.test.ts tests/unit/auth-session.test.ts`
- `pnpm --filter web build`

随后通过真实浏览器端到端测试发现第二层根因：
- 在本机 Chrome 中真实点击“使用 GitHub 登录”后，页面最初根本没有离开 `/login`
- 暴露出的具体错误是：
  - `Supabase auth is not configured.`

第二层真实根因：
- [`apps/web/src/lib/auth/supabase.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/supabase.ts) 中使用了动态形式的 `process.env[name]`
- 这种写法在服务端可用，但在 Next 客户端 bundle 中不会正确注入 `NEXT_PUBLIC_SUPABASE_*`
- 结果是：
  - 服务端看起来“环境变量已配置”
  - 但浏览器端 `createSupabaseBrowserClient()` 实际拿到的是空值
  - 所以前端在 `signInWithOAuth` 之前就已经失败

第二阶段修复动作：
- 将 [`apps/web/src/lib/auth/supabase.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/supabase.ts) 改成静态读取：
  - `process.env.NEXT_PUBLIC_SUPABASE_URL`
  - `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 在 [`apps/web/src/components/login-form.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/login-form.tsx) 中补充开发态详细错误输出，避免再次被泛化提示掩盖
- 在 [`apps/web/src/app/api/auth/supabase-session/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/auth/supabase-session/route.ts) 中改成：
  - 优先读取 `getClaims(accessToken)`
  - 必要时 fallback 到 `getUser(accessToken)`
  - 并输出明确日志

第二阶段真实端到端验证结果：
- 在现有本机 Chrome 中真实点击 GitHub 登录
- 浏览器成功进入：
  - `http://localhost:3000/workspace`
- `relay-web` 日志显示：
  - `GET /auth/callback?next=%2Fworkspace 200`
  - `POST /api/auth/supabase-session 200`
  - `GET /workspace 200`

当前状态判断：
- 这次“GitHub 登录失败”的代码级根因已经被真实 E2E 验证修复。
- 本地 `localhost:3000/login -> GitHub -> /workspace` 链路当前已跑通。

## 本轮关键“预期 vs 实际”汇总

### 1. 公网验证

预期：
- `cloudflared` 只承担一个简单的公网地址映射。

实际：
- quick tunnel 本身不稳定，且开发态 websocket / HMR 噪音会干扰判断。

具体差异：
- 它适合演示和验证，不适合当长期方案。

### 2. 移动端

预期：
- 桌面端页面缩到手机上，再补少量样式即可。

实际：
- 移动端需要独立信息架构、独立输入体验、独立工作区打开方式。

具体差异：
- 桌面逻辑里“本地文件选择器”在移动远程场景不成立。
- 抽屉、列表、header 必须抽为公共层，否则无法扩展。

### 3. 账号登录

预期：
- 接上 GitHub OAuth 后，很快就能完成网页登录。

实际：
- 需要先尊重 Supabase PKCE 模型，再处理 Relay 自己的本地 cookie 会话。

具体差异：
- 账号登录只是身份证明，不等于已经打通“连接自己的本地 Codex”。

### 4. 第二版 OAuth

预期：
- 改成浏览器主导 PKCE 后，登录问题就完全结束。

实际：
- 开发态回调重复执行仍然会让同一个 code 被消费两次。

具体差异：
- 还需要做幂等保护，不能只保证生产态逻辑正确。

### 2026-04-05 晚间 - iOS / Safari / 微信首击输入框避让问题复盘

用户连续反馈的真实现象：
- 在 `Safari` 和微信内置浏览器里，底部输入框第一次点击后，经常仍然看不到。
- 某些版本里第二次点击才正常。
- 某些“强行顶到顶部”的修复虽然能避开键盘，但体验不自然，还会把 header 一起挤乱。

最开始的错误判断：
- 一度怀疑是“第一次点击输入框时，系统没有把点击事件传给我们”。
- 实际从真机视频与后续回归可以确认：
  - 第一次点击通常已经成功 focus。
  - 光标也出现了。
  - 真正的问题是 iOS 在键盘和视口更新的第一拍里，会继续做一轮原生滚动 / 视口调整，导致输入框又被挤走。

这轮最终确认的真实根因有两层：

第一层根因：
- 仅靠 `textarea onFocus` 触发“把输入框移到顶部”并不可靠。
- 因为第一次 focus 成功后，`visualViewport` 的缩小和浏览器自己的二次滚动并不是同步发生。
- 如果只在 focus 那一拍改布局，后续仍可能被系统再顶走。

第二层根因，也是这次最关键的经验：
- 动态键盘避让变量最初写到了 `document.documentElement`，也就是 `html` 上。
- 但真正消费这些变量的是 `main.mobile-app` 自己在 [`apps/web/src/app/globals.css`](/Users/ruska/project/web-cli/apps/web/src/app/globals.css) 里的局部 CSS 变量。
- 结果是：
  - JavaScript 看起来一直在更新 `--mobile-composer-top`、`--mobile-keyboard-fallback-reserve`、`--mobile-ios-bottom-boost`
  - 但布局实际仍然吃的是 `main.mobile-app` 上默认的 `0px`
  - 表现出来就是“代码看着改了，日志也在变，真机第一次点击却没有立刻生效”

最后收敛出的正确方案：
- 不再追求“输入框必须瞬间顶到页面最顶部”。
- 改成“尽量自然，但第一次点击就立刻避让，不被挡住”。
- 具体做法是：
  - 保留 `composer` 的 `fixed` 布局。
  - 在 [`apps/web/src/components/mobile/mobile-shell.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-shell.tsx) 中通过 `appRef` 直接把动态变量写回 `main.mobile-app`。
  - 第一次文本输入 focus 时，如果 `visualViewport` 还没真正缩下来，先给 iOS 一个轻量的 `fallback reserve` 兜底空间。
  - 等真实 viewport 更新后，再由自然位置接管，而不是一直强行顶到最顶部。
  - 配合少量 focus 后的视口稳定化，抵消 iOS 首帧原生 re-scroll。

这次明确保留下来的经验规则：
- 当 CSS 变量被组件根节点定义时，运行时更新必须写回同一个宿主节点，不能想当然写到 `html` 或 `body`。
- 移动端键盘问题不能只看“有没有 focus 到输入框”，还要看 focus 后第一拍和第二拍的 `visualViewport`、scroll、布局变量是否真的落到实际消费节点。
- 对 iOS 输入框避让，目标应该是“稳定可见”，不是“机械顶到顶部”。
- 如果真机问题只在第一次点击出现，优先怀疑：
  - `visualViewport` 更新晚于 focus
  - 浏览器自身的二次滚动
  - 动态样式写到了错误宿主，导致首帧补偿根本没生效

为避免再次回退，这轮还补了真实回归测试：
- 新增 Playwright 用例 [`apps/web/tests/e2e/mobile-composer-first-tap.spec.ts`](/Users/ruska/project/web-cli/apps/web/tests/e2e/mobile-composer-first-tap.spec.ts)
- 回归点不再只是“第一次点击后拿到 focus”，而是进一步验证：
  - `--mobile-keyboard-fallback-reserve` 在第一次点击后确实变化
  - `composer` 的 `top` 位置确实变化

这一条经验很重要，因为它不是某个浏览器特例，而是移动端布局排查里的通用结论：
- “事件触发了”不等于“布局生效了”
- “变量被更新了”不等于“正确的节点消费到了这个变量”
- 真机首击异常，很多时候是布局宿主错位，不是交互事件丢失

## 本轮用户关键决策汇总

- 先不租服务器，先跑通 `v0.0.2`。
- 先用 `cloudflared quick tunnel` 做公网验证。
- 登录成功默认进入 `/mobile`，手机访问 `/workspace` 自动重定向到 `/mobile`。
- 移动端先做减法，不追求与桌面完全等价。
- 移动端工作区入口只保留：
  - 当前工作区
  - 最近工作区
  - 收藏工作区
  - 高级方式：输入路径
- 抽屉样式必须上升到公共组件层，新增 tab 不能再靠单页面补丁修。
- 公共抽屉密度规范固定为紧凑模式。
- 新增 `记忆` tab，并沿用同一套移动端抽屉规范。
- 登录优先用 `GitHub`，不是 Google。
- 架构方向采用：
  - `Supabase` 承担 Auth + DB
  - `Render` 承担未来 Cloud API / Realtime Relay
- 保留现有密码登录，与 GitHub 登录并存。
- 先做 Auth，不先建业务表。

## 对当前版本位置的判断

如果按最初目标“任何人登录账号后，在网页端连接自己本地的 Codex”来衡量，本轮结束后的位置更接近：

- `v0.0.2`：远程可达版，已基本跑通
- 正在进入：`v0.0.3 - v0.1.0` 之间的“账号与身份层补齐阶段”

已经具备的部分：
- 本地 bridge + web + mobile 的基础链路
- 受保护的远程访问
- 移动端基本可用的专用入口
- 统一实时会话架构基线
- GitHub OAuth 接入框架

还未完成的关键缺口：
- 设备绑定
- 用户与设备关系表
- 云端设备注册 / 心跳 / 在线状态
- 账号登录后选中“自己的哪台机器”
- 公网稳定部署，不再依赖 quick tunnel

## 下一步建议

下一阶段不要再继续泛化讨论，应该直接进入“设备绑定最小可用版”：

1. 设计并落地 `devices`、`device_bind_codes` 等最小表结构。
2. 让本地 relay / bridge 可以生成绑定码并上报设备身份。
3. 让网页端登录后可以看到“我名下的设备”。
4. 先只支持“1 个账号 -> 1 台默认设备 -> 1 条连接链路”，不要过早做多设备复杂调度。

这一步完成后，产品才会真正从“远程可达的 Relay”进入“账号化的个人远程 Codex”。
