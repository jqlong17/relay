# 09 时间线会话记录 - 统一实时会话架构设计与 TDD 落地

## 基本信息

- 会话编号：`09`
- 日期：`2026-04-03`
- 时区：`Asia/Shanghai (CST)`
- 记录目的：记录本轮围绕 `Codex Desktop / CLI / Relay Web / Relay Mobile` 共享同一条 thread 的架构设计、执行计划制定、并行实现、broken-thread 降级与测试验证过程，便于下一位接手者继续推进 `v0.1.0` 的统一实时会话能力。

## 时间线（过程 + 细节）

### 18:00 - 用户要求把多端共享会话问题提升为中长期执行计划

用户澄清的真实场景：
- 现阶段优先使用 `Codex Desktop`
- 当前 Relay 主要承担自动记忆总结
- 未来希望也能直接在 `Web / Mobile` 和 `codex cli` 对话
- 核心诉求不是“避免冲突”本身，而是多个界面能围绕同一条 thread 实时同步

AI 当时的判断：
- 这个问题不能再用“本地 snapshot 修修补补”来回答
- 必须提升为：
  - 真相源定义
  - 协议层设计
  - 状态机设计
  - broken thread 降级策略

由此形成的核心结论：
- `Codex thread` 必须是唯一会话真相源
- Relay 不应再维护另一套独立消息真相
- Relay 更适合作为：
  - 产品视图层
  - 实时同步客户端
  - 记忆派生层

### 18:05 - 用户要求把方案写入 workflow，并使用 TDD 模式

用户明确约束：
- 执行计划要写入 `workflow`
- 使用 `TDD` 模式撰写
- 测试覆盖新增功能至少 `85%`

AI 当时的处理方式：
- 不只写口头方案
- 直接新增配套文档，且文档之间要成体系：
  - session 记录
  - 执行计划
  - 设计文档

### 18:10 - 18:20 - 先补架构文档与执行计划

本轮新增文档：
- [`workflow/执行计划/05-Relay-v0.1.0-统一实时会话架构TDD执行计划.md`](/Users/ruska/project/web-cli/workflow/执行计划/05-Relay-v0.1.0-统一实时会话架构TDD执行计划.md)
- [`workflow/设计/06-v0.1.0-统一实时会话架构设计.md`](/Users/ruska/project/web-cli/workflow/设计/06-v0.1.0-统一实时会话架构设计.md)

文档中明确的关键设计：
- `Codex thread` 是唯一会话真相源
- 架构拆成：
  - `Codex Thread Runtime`
  - `Relay Local Bridge`
  - `Relay Web / Mobile`
  - `Relay Memory Layer`
- 通信拆成两层：
  - 控制面：HTTP API
  - 实时面：`SSE`
- 统一事件模型：
  - `run.started`
  - `message.delta`
  - `message.completed`
  - `run.completed`
  - `run.failed`
  - `thread.updated`
  - `thread.list.changed`
  - `thread.broken`
  - `thread.deleted_or_missing`
- 统一状态语义：
  - `idle`
  - `running`
  - `syncing`
  - `stale`
  - `broken`

### 18:22 - 用户要求“先 git 保存，再直接一步到位拆成多个子 agent 执行”

用户明确要求：
- 先把本轮文档 git 保存
- 再按执行计划拆成多个子 agent 并行执行
- 各自补单元测试

已执行动作：
- 仅暂存本轮新增 `workflow` 文档
- 创建独立提交：
  - `0db19f2 docs: add realtime thread architecture plan`

这一阶段的重要约束：
- 当前工作区存在其他未提交改动
- 因此本轮文档提交必须保持边界清晰，不能把其他功能混进去

### 18:25 - 18:30 - 主线程先统一共享协议草案，再拆并行任务

AI 在主线程先做的事：
- 检查现有：
  - [`packages/shared-types/src/session.ts`](/Users/ruska/project/web-cli/packages/shared-types/src/session.ts)
  - [`packages/shared-types/src/runtime-event.ts`](/Users/ruska/project/web-cli/packages/shared-types/src/runtime-event.ts)
- 先补共享协议草案，避免子任务接口漂移

主线程先收敛出的共享字段：
- `Session`
  - `cwd`
  - `source`
  - `syncState`
  - `brokenReason`
- `RuntimeEvent`
  - `thread.updated`
  - `thread.list.changed`
  - `thread.broken`
  - `thread.deleted_or_missing`

随后把任务拆给三个并行子 agent：
- 子任务 1：
  - `local-bridge` 实时订阅与事件总线
- 子任务 2：
  - `apps/web` 的实时订阅接入与单元测试
- 子任务 3：
  - broken-thread 识别与降级返回

### 18:30 - 18:45 - 子任务并行落地 bridge 实时订阅

bridge 侧新增能力：
- 新增独立 SSE 订阅通道
- 新增运行时事件总线
- `run` 结束后发布 thread 级事件

关键文件：
- [`services/local-bridge/src/routes/runtime.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/routes/runtime.ts)
- [`services/local-bridge/src/services/runtime-event-bus.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/services/runtime-event-bus.ts)
- [`services/local-bridge/src/index.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/index.ts)

这一阶段形成的关键实现：
- bridge 提供：
  - `GET /runtime/subscribe`
- 通过 `SSE` 推送：
  - run 事件
  - thread 事件
- 为了支持 `message.delta` / `message.completed` 的 session 过滤：
  - 事件总线内部维护 `runId -> sessionId` 关联

### 18:35 - 18:46 - 子任务并行落地 Web / Mobile 实时订阅

Web 侧新增能力：
- API 层新增实时订阅封装
- workspace 与 mobile 页面接入订阅
- 在收到 thread 级事件后静默刷新列表或详情

关键文件：
- [`apps/web/src/lib/api/bridge.ts`](/Users/ruska/project/web-cli/apps/web/src/lib/api/bridge.ts)
- [`apps/web/src/app/api/bridge/runtime/events/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/bridge/runtime/events/route.ts)
- [`apps/web/src/components/workspace-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/workspace-client.tsx)
- [`apps/web/src/components/mobile/mobile-shell.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/mobile/mobile-shell.tsx)

Web 侧本轮采用的消费策略：
- 继续保留现有 `runSessionStream`
- 新增独立 `subscribeRuntimeEvents()`
- 当收到以下事件时触发后台刷新：
  - `thread.list.changed`
  - `thread.updated`
  - `thread.broken`
  - `thread.deleted_or_missing`
  - `run.completed`
  - `run.failed`

### 18:38 - 18:47 - 子任务并行落地 broken-thread 基线能力

bridge 侧新增 broken-thread 识别器：
- `rollout_missing`
- `thread_resume_failed`
- `thread_read_failed`

关键文件：
- [`services/local-bridge/src/services/broken-thread.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/services/broken-thread.ts)
- [`services/local-bridge/src/routes/sessions.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/routes/sessions.ts)

本轮收敛出的 broken 降级策略：
- `thread not found`
  - 仍视为真实不存在
- rollout 丢失或恢复失败
  - 视为 `broken`
- `GET /sessions/:id`
  - broken 时返回 `200 + broken 占位 session`
- `GET /sessions`
  - 保留已识别 broken thread，并打上：
    - `syncState: "broken"`
    - `brokenReason`
- `POST /sessions/:id/select`
  - broken 时返回结构化 broken 响应
- `POST /sessions/:id/rename`
  - broken 时返回 `409`

这一步的意义：
- 坏 thread 不再拖垮整个 sessions 页面
- 也不会再把不可恢复 thread 当正常 thread 误导 UI

### 18:47 - 主线程集成时发现 SSE 路由命名不一致

主线程在汇总 bridge 与 web 改动时发现：
- bridge 实现的是：
  - `/runtime/subscribe`
- web 代理初版写成了：
  - `/runtime/events`

已执行动作：
- 修正 [`apps/web/src/app/api/bridge/runtime/events/route.ts`](/Users/ruska/project/web-cli/apps/web/src/app/api/bridge/runtime/events/route.ts)
- 将上游代理地址改为：
  - `/runtime/subscribe`

这一步的意义：
- 避免前后端都“各自正确”，但集成后无法连通

### 18:48 - 18:50 - 跑通定向测试与全量测试

已执行测试：
- `pnpm --filter web test -- tests/unit/bridge-api.test.ts tests/unit/mobile-shell.test.tsx tests/unit/workspace-client.test.tsx`
- `pnpm --filter local-bridge exec vitest run tests/unit/broken-thread.test.ts tests/unit/runtime-event-bus.test.ts tests/integration/sessions-route.test.ts tests/integration/runtime-route.test.ts`
- `pnpm --filter local-bridge test`
- `pnpm --filter web test`

测试结果：
- `local-bridge`
  - `13` 个文件通过
  - `39` 个测试通过
- `web`
  - `5` 个文件通过
  - `23` 个测试通过

本轮新增的重要测试覆盖面：
- SSE 订阅建立与事件消费
- bridge 事件总线过滤与发布
- broken-thread 分类
- sessions 路由 broken 降级
- workspace 实时订阅刷新
- mobile 实时订阅刷新

### 18:52 - 覆盖率目标检查时发现仓库缺少 coverage provider

用户原始要求之一：
- 新增功能测试覆盖率至少 `85%`

AI 在最后阶段执行检查：
- 尝试运行：
  - `vitest --coverage`

发现的新事实：
- 当前仓库缺少：
  - `@vitest/coverage-v8`

结果：
- 目前已经补齐了较完整的测试
- 但“覆盖率达到 85%”还无法被正式量化验证

这一步留下的明确后续动作：
- 安装 coverage provider
- 跑出覆盖率报告
- 再判断是否达到目标值

## 本轮沉淀出的结论

### 1. 会话真相源已经明确

本轮最大价值不是“多写了几个接口”，而是明确了：
- `Codex thread` 是唯一真相源
- Relay 的 snapshot / cache / memory 都是派生层，不是第二真相

### 2. v0.1.0 已经有了第一版可运行基线

本轮不是停留在文档阶段，而是已经落了第一版代码基线：
- bridge 实时订阅
- web/mobile 事件消费
- broken-thread 隔离
- 共享状态字段

### 3. 当前最值得继续推进的不是再扩协议，而是闭环验证

下一阶段最重要的事情不是继续堆功能，而是：
- 做干净提交
- 补 coverage
- 做真实多端端到端验证
- 把所有写操作统一到“写后重读 + 发布事件”

## 与项目主题归档目标的关系

本轮和项目长期目标高度一致：
- 项目希望做的不只是聊天界面，而是围绕会话形成：
  - session
  - theme memory
  - project rules
- 这条链路想成立，前提就是：
  - thread 真相稳定
  - 多端同步稳定
  - broken thread 可隔离
  - memory 明确是异步派生层

因此本轮的“统一实时会话架构”不是底层技术枝节，而是后续记忆系统和主题归档真正可产品化的前置基础。
