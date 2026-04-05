# 11 时间线会话记录 - 设备绑定 MVP 起步

## 基本信息

- 会话编号：`11`
- 日期：`2026-04-05`
- 时区：`Asia/Shanghai (CST)`
- 记录目的：记录本轮从“GitHub 登录已跑通”继续推进到“设备绑定 MVP 前置能力”的实现过程，明确当前已完成的基础件和下一步直接可做的任务。

## 时间线（过程 + 细节）

### 08:00 左右 - 用户要求直接开始设备绑定方向的开发

用户目标：
- 不再停留在登录本身
- 直接开始朝“登录后连接自己的本地 Codex”继续推进

AI 当时判断：
- 当前最重要的不是直接做云端转发
- 而是先补齐三块缺失的基础层：
  - 本地 session 中的用户身份
  - 本地稳定设备身份
  - 云端 schema

原因：
- 现在虽然已经能 GitHub 登录，但 `relay_session` 只表示“已登录”
- 如果 session 不知道“是谁”，后续就无法查询“我的设备”
- 如果 local bridge 没有稳定 `deviceId`，后续也无法绑定到账号

### 08:05 - 08:20 - 先补 auth session 的用户身份语义

本轮实现：
- [`apps/web/src/lib/auth/session.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/session.ts)
  - session token 增加：
    - `method`
    - `provider`
    - `sub`
  - 新增：
    - `readSessionToken()`
    - `getSessionActor()`
- [`apps/web/src/app/api/auth/login/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/auth/login/route.ts)
  - 密码登录写入 `method = password`
- [`apps/web/src/app/api/auth/supabase-session/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/auth/supabase-session/route.ts)
  - GitHub 登录写入：
    - `method = github`
    - `provider = github`
    - `userId`
- [`apps/web/src/app/api/auth/session/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/auth/session/route.ts)
  - 返回当前 session actor

实际价值：
- Web 终于能明确知道“当前是谁登录”
- 这一步是设备归属模型成立的前提

### 08:20 - 08:35 - 为 local-bridge 新增稳定设备身份

本轮实现：
- 新增 shared type：
  - [`packages/shared-types/src/device.ts`](/Users/ruska/project/web-cli/packages/shared-types/src/device.ts)
- [`services/local-bridge/src/services/relay-state-store.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/services/relay-state-store.ts)
  - 状态文件开始保存 `localDevice`
- 新增：
  - [`services/local-bridge/src/services/local-device-service.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/services/local-device-service.ts)
  - [`services/local-bridge/src/routes/device.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/routes/device.ts)
- bridge 新增：
  - `GET /device`
- web 新增：
  - [`apps/web/src/app/api/bridge/device/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/bridge/device/route.ts)

设备对象当前包含：
- `id`
- `name`
- `hostname`
- `platform`
- `arch`
- `bindingStatus`
- `boundUserId`
- `createdAt`
- `updatedAt`
- `lastSeenAt`

当前默认策略：
- 首次请求时生成稳定 `deviceId`
- 写入本地 state 文件
- 默认 `bindingStatus = unbound`

### 08:35 - 08:45 - 设置页接入账号与设备信息

本轮实现：
- [`apps/web/src/components/settings-page-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/settings-page-client.tsx)
  - 新增“账号与设备”区块
  - 会同时读取：
    - `/api/auth/session`
    - `/api/bridge/device`
- [`apps/web/src/config/messages.ts`](/Users/ruska/project/web-cli/apps/web/src/config/messages.ts)
  - 新增账号与设备相关文案
- [`apps/web/src/app/globals.css`](/Users/ruska/project/web-cli/apps/web/src/app/globals.css)
  - 新增设置页数据网格样式

这一阶段的意义：
- 用户已经可以在 UI 里看到：
  - 当前登录方式
  - 当前用户 ID
  - 当前本机设备
  - 当前设备未绑定状态

### 08:45 - 08:55 - 把云端 schema 和设计文档落库

本轮新增：
- Supabase migration：
  - [`supabase/migrations/20260405090000_device_binding_mvp.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405090000_device_binding_mvp.sql)
  - [`supabase/migrations/20260405093000_device_binding_rpc.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405093000_device_binding_rpc.sql)
- 设计文档：
  - [`workflow/设计/09-v0.2.0-alpha-账号与设备绑定设计.md`](/Users/ruska/project/web-cli/workflow/设计/09-v0.2.0-alpha-账号与设备绑定设计.md)
- TDD 计划：
  - [`workflow/执行计划/08-Relay-v0.2.0-alpha-账号与设备绑定TDD执行计划.md`](/Users/ruska/project/web-cli/workflow/执行计划/08-Relay-v0.2.0-alpha-账号与设备绑定TDD执行计划.md)

Schema 当前包含：
- `devices`
- `device_bind_codes`
- `user_device_preferences`
- `updated_at trigger`
- `RLS policies`
- `create_device_bind_code`
- `consume_device_bind_code`

### 09:00 - 09:15 - 把“绑定当前设备”最小闭环直接接到设置页

本轮新增：
- [`apps/web/src/lib/api/device-binding.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/api/device-binding.ts)
  - 浏览器基于当前 GitHub session 调用 Supabase RPC `create_device_bind_code`
- [`services/local-bridge/src/services/device-binding-service.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/services/device-binding-service.ts)
  - local-bridge 通过 anon key 调用 `consume_device_bind_code`
- [`services/local-bridge/src/routes/device.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/routes/device.ts)
  - 新增 `POST /device/bind`
- [`apps/web/src/app/api/bridge/device/bind/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/bridge/device/bind/route.ts)
  - 新增 `/api/bridge/device/bind`
- [`apps/web/src/components/settings-page-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/settings-page-client.tsx)
  - 设置页新增“绑定当前设备”按钮

当前交互：
1. 用户已通过 GitHub 登录
2. 设置页点击“绑定当前设备”
3. 浏览器创建一次性 bind code
4. Web 调用 local bridge `POST /device/bind`
5. bridge 消费 bind code，完成设备绑定
6. 本地设备状态更新为 `bound`

### 09:15 - 09:35 - Supabase SQL 已执行，但真实 E2E 暴露出“绑定失败”

用户实际动作：

- 已在 Supabase 后台执行：
  - [`supabase/migrations/20260405090000_device_binding_mvp.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405090000_device_binding_mvp.sql)
  - [`supabase/migrations/20260405093000_device_binding_rpc.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405093000_device_binding_rpc.sql)
- 返回结果：`Success. No rows returned`

AI 预期：

- 既然 schema 和 RPC 都已经建好
- 设置页点击“绑定当前设备”后，应该能立刻走到：
  - 浏览器创建 bind code
  - web 命中 `/api/bridge/device/bind`
  - local bridge 消费绑定码

实际情况：

- 设置页仍然显示“绑定失败”
- `relay-web` 日志里没有出现 `/api/bridge/device/bind`

由此可以确认：

- 失败点不在 local bridge
- 而是在浏览器侧创建设备绑定码这一步之前或过程中

关键差异：

- 原本 UI 对异常的处理过于粗糙
- Supabase 返回的很多错误是 plain object，不是 `Error`
- 因此前端最后只显示了泛化的“绑定失败”，看不到真实原因

### 09:35 - 09:50 - 针对真实故障补充可观测性并修正浏览器 RPC 调用方式

本轮修复：

- 新增统一错误提取工具：
  - [`apps/web/src/lib/errors.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/errors.ts)
- 更新：
  - [`apps/web/src/lib/api/device-binding.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/api/device-binding.ts)
  - [`apps/web/src/components/settings-page-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/settings-page-client.tsx)

具体改动：

- 浏览器创建 bind code 时，不再只依赖 `supabase.rpc(...)`
- 改为显式调用：
  - `POST ${SUPABASE_URL}/rest/v1/rpc/create_device_bind_code`
- 并明确带上：
  - `Authorization: Bearer <access_token>`
  - `apikey: <anon_key>`

这样做的原因：

- 之前虽然已经从浏览器 session 中拿到了 `access_token`
- 但实际 RPC 调用没有显式使用这枚 token
- 对单人开发调试来说，这会让“是否真的以已登录用户身份调用了 RPC”变得不透明
- 改为显式 REST 调用之后，鉴权链路更直接，也更容易排障

同时补充：

- 前端现在会把 Supabase/plain-object 错误正确转成可读信息
- 并在浏览器控制台打印 `Device binding failed`

### 09:50 - 10:00 - 回归测试与当前状态

已执行：

- `pnpm --filter web test -- tests/unit/device-binding.test.ts tests/unit/auth-routes.test.ts tests/unit/auth-session.test.ts`
- `pnpm --filter web build`
- `pnpm dev:up`

结果：

- 新增设备绑定单测通过
- 现有 auth 相关测试通过
- Web build 通过
- 本地开发服务已重启

### 10:00 左右 - 真实错误进一步收敛到 Supabase RPC 本身

用户在浏览器控制台看到的真实错误：

- `function gen_random_bytes(integer) does not exist`

这说明：

- 前端现在已经能把具体错误暴露出来
- 失败点已经从“前端不可观测”进一步收敛到“Supabase RPC 内部函数不可用”

根因：

- [`supabase/migrations/20260405093000_device_binding_rpc.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405093000_device_binding_rpc.sql)
  中的 `create_device_bind_code()` 依赖了：
  - `gen_random_bytes(5)`
- 但当前 Supabase 环境中这个函数不可用

修正方案：

- 新增 hotfix migration：
  - [`supabase/migrations/20260405103000_fix_device_bind_code_generator.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405103000_fix_device_bind_code_generator.sql)
- 绑定码生成逻辑改为：
  - 基于 `gen_random_uuid()` 截取 10 位十六进制字符
- 同时增加 `unique_violation` 重试循环，避免极低概率碰撞

### 10:05 左右 - 继续真实绑定时，错误进入消费绑定码 RPC

用户继续点击绑定后，新的真实错误变成：

- `column reference "user_id" is ambiguous`

这意味着：

- `create_device_bind_code()` 已经可以工作
- 当前失败点已经推进到 `consume_device_bind_code()`

根因判断：

- `consume_device_bind_code()` 的 `returns table (...)` 中本身就有 `user_id`
- 同时函数体里又写了：
  - `on conflict (user_id, local_device_id)`
  - `on conflict (user_id)`
- 在 PL/pgSQL 中，这类未显式消歧的列名会和 output 变量发生冲突

修正方案：

- 新增第二个 hotfix migration：
  - [`supabase/migrations/20260405104500_fix_consume_device_bind_code_ambiguity.sql`](/Users/ruska/project/web-cli/supabase/migrations/20260405104500_fix_consume_device_bind_code_ambiguity.sql)
- 把冲突目标改为显式约束名：
  - `devices_user_id_local_device_id_key`
  - `user_device_preferences_pkey`
- 并增加：
  - `#variable_conflict use_column`

这一步的意义：

- 设备绑定链路已经从“前端不可观测问题”推进到“数据库函数细节问题”
- 一旦这个 hotfix 生效，就可以继续验证本地设备是否真正进入 `bound`

### 10:20 左右 - 首次真实设备绑定成功

用户反馈：

- 设置页状态已经显示：
  - `绑定状态：已绑定`
  - `绑定成功`

本地再次核验：

- `curl http://127.0.0.1:4242/device`
- 返回：
  - `bindingStatus = bound`
  - `boundUserId = 7c23f265-6c68-41db-a3c7-14b31dd4c9ef`
  - `deviceId = 8b6ab0b1-27e1-4b76-bcd7-6759831bbbd8`

这说明最小闭环已经真实成立：

1. GitHub 登录成功
2. 浏览器能以当前用户身份创建 bind code
3. local bridge 能消费 bind code
4. 云端成功保存设备归属
5. 本地设备状态已持久化为 `bound`

这一步的产品意义：

- 现在已经不再是“能登录网页”
- 而是第一次真正实现了：
  - “用户登录账号后，识别并绑定自己的本地 Relay 设备”

后续不需要每次重新配置：

- 绑定是“按设备一次”
- 不是“按会话一次”
- 不是“每次登录一次”
- 同一台机器后续应该进入自动识别与自动连接路径

### 10:30 - 10:50 - 补“我的设备列表”“默认设备”“登录后自动检测”

用户明确要求：

- 做“我的设备列表”
- 做“默认设备选择”
- 登录后自动检测本机是否已绑定，尽量自动通过

AI 本轮实现判断：

- 这三件事不能拆成三套独立逻辑
- 否则后面会出现：
  - 设置页自己查设备
  - 登录回调自己判绑定
  - 默认设备自己再单独写一套状态
- 正确做法是先抽一层统一的云端设备目录能力，再让 settings 和 login callback 共用

本轮新增：

- shared types 扩展：
  - [`packages/shared-types/src/device.ts`](/Users/ruska/project/web-cli/packages/shared-types/src/device.ts)
    - `RelayCloudDevice`
    - `RelayDeviceDirectory`
- 云端设备 API：
  - [`apps/web/src/lib/api/cloud-devices.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/api/cloud-devices.ts)
- 登录后自动检测：
  - [`apps/web/src/lib/auth/device-bootstrap.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/device-bootstrap.ts)
  - [`apps/web/src/components/auth-callback-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/auth-callback-client.tsx)
- 设置页接入：
  - [`apps/web/src/components/settings-page-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/settings-page-client.tsx)
- 文案与样式：
  - [`apps/web/src/config/messages.ts`](/Users/ruska/project/web-cli/apps/web/src/config/messages.ts)
  - [`apps/web/src/app/globals.css`](/Users/ruska/project/web-cli/apps/web/src/app/globals.css)

这轮的具体能力变化：

1. 设置页现在可以显示“我的设备列表”
   - 读取当前 GitHub 用户的 `devices[]`
   - 同时读取 `user_device_preferences.default_device_id`
2. 每台设备现在可以手动“设为默认”
   - 不再只是绑定状态展示
3. GitHub 登录回调现在会自动执行当前设备补齐逻辑
   - 如果本机已绑定到当前账号，自动通过
   - 如果本机未绑定，自动绑定
   - 如果默认设备为空，自动把当前设备设为默认
   - 如果本机已经属于别的账号，则停止自动处理

这一轮的重要产品意义：

- 设备绑定不再只是一个 settings 按钮
- 它开始成为“登录后自动识别我的本机 Relay 设备”的真正产品路径

本轮测试：

- 新增单测：
  - [`apps/web/tests/unit/cloud-devices.test.ts`](/Users/ruska/project/web-cli/apps/web/tests/unit/cloud-devices.test.ts)
  - [`apps/web/tests/unit/device-bootstrap.test.ts`](/Users/ruska/project/web-cli/apps/web/tests/unit/device-bootstrap.test.ts)
- 已执行：
  - `pnpm --filter web test -- tests/unit/cloud-devices.test.ts tests/unit/device-bootstrap.test.ts tests/unit/device-binding.test.ts tests/unit/auth-routes.test.ts tests/unit/auth-session.test.ts`
  - `pnpm --filter web build`
  - `pnpm dev:up`

结果：

- 新增设备目录与自动绑定测试通过
- Web build 通过
- 本地服务已重启

### 10:50 - 11:10 - 把默认设备真正带进 workspace，并重排 settings 页面

用户补充要求：

- 按前面建议继续推进
- 同时优化 settings 页面，因为当前视觉上“有点乱”

AI 当时判断：

- 这里需要先澄清一个边界
- 当前系统还没有云端转发层
- 所以“默认设备接入 workspace”这一轮能做的是：
  - 让 workspace 入口具备设备目标感知
  - 让 workspace 明确展示“当前直连设备 / 默认设备 / 是否已命中默认设备”
- 但还不能伪装成已经支持“切到另一台设备去执行”

本轮新增：

- 认证类型抽取：
  - [`apps/web/src/lib/auth/types.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/auth/types.ts)
- workspace 接入设备目标状态：
  - [`apps/web/src/components/workspace-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/workspace-client.tsx)
- settings 页面结构重排：
  - [`apps/web/src/components/settings-page-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/settings-page-client.tsx)
  - [`apps/web/src/app/globals.css`](/Users/ruska/project/web-cli/apps/web/src/app/globals.css)
  - [`apps/web/src/config/messages.ts`](/Users/ruska/project/web-cli/apps/web/src/config/messages.ts)
- workspace 测试补齐：
  - [`apps/web/tests/unit/workspace-client.test.tsx`](/Users/ruska/project/web-cli/apps/web/tests/unit/workspace-client.test.tsx)

这轮具体变化：

1. workspace 页面现在会在进入时主动读取当前 Relay session
2. 如果是 GitHub session，会再次执行 `ensureCurrentGitHubDeviceReady()`
   - 已绑定则自动通过
   - 未绑定则自动补齐
   - 默认设备为空则自动补齐默认设备
3. workspace 头部下方新增“设备目标条”
   - 显示当前直连设备
   - 显示默认设备
   - 显示当前是否已命中默认设备
4. 如果默认设备和当前直连设备不一致
   - 页面会明确提示“跨设备路由尚未接入”
   - 避免产生功能已完成的假象
5. settings 页面不再只是长列表
   - 新增顶部概览卡
   - 设备、本机、默认设备、远程访问分成更清晰的内容卡
   - 说明性文字改回更适合阅读的正文字体，而不是一整页等宽字

本轮测试：

- `pnpm --filter web test -- tests/unit/workspace-client.test.tsx tests/unit/cloud-devices.test.ts tests/unit/device-bootstrap.test.ts tests/unit/device-binding.test.ts tests/unit/auth-routes.test.ts tests/unit/auth-session.test.ts`
- `pnpm --filter web build`
- `pnpm dev:up`

结果：

- workspace 新增设备目标条测试通过
- 相关回归测试通过
- Web build 通过
- 本地服务已重启

### 补充记录 - 09:15 前的初次定向测试

已执行：
- `pnpm --filter local-bridge exec vitest run tests/integration/device-route.test.ts`
- `pnpm --filter web test -- tests/unit/auth-session.test.ts tests/unit/auth-routes.test.ts`
- `pnpm --filter web build`

结果：
- 定向测试通过
- Web build 通过

## 当前结论

当前这一轮已经完成“真实设备绑定闭环”。

现在仓库已经具备：

- 当前登录用户身份
- 当前本机设备身份
- 当前设备未绑定状态
- 云端设备表与绑定码表 schema
- 设置页“绑定当前设备”按钮
- bridge 消费绑定码能力
- 浏览器侧显式 Bearer 鉴权创建 bind code
- 绑定错误可观测性
- 本机设备已成功绑定到当前 GitHub 用户
- 设置页已支持“我的设备列表”
- 设置页已支持“默认设备选择”
- GitHub 登录后已支持自动检测当前本机绑定状态
- workspace 已支持设备目标状态感知
- settings 页面已重排为更清晰的概览卡 + 内容卡结构

当前最直接的下一步：

1. 开始做云端设备在线注册与心跳
2. 准备“网页请求按默认设备路由到云端 Relay”的最小中继层
3. 增加“设备已属于别的账号”的显式提示与处理
4. 再进入“网页端真正连接到自己的本地 Codex”阶段
