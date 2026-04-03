# 05 Relay v0.1.0 统一实时会话架构 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.1.0` 的“统一实时会话架构”能力。

本版本要解决的问题非常明确：

- Relay Web / Mobile / Codex Desktop / Codex CLI 将同时围绕同一条 thread 工作
- 当前系统虽然复用 Codex thread，但仍缺少真正的“多端实时同步”能力
- Relay 为了性能引入了 snapshot / cache / optimistic UI，但这些不能成为会话真相源
- Codex 底层 thread 可能出现：
  - rollout 文件缺失
  - thread 可列出但不可恢复
  - 归档状态与索引状态不一致
- 当未来用户开始直接在 Web 或 Mobile 中继续对话时，系统必须保证：
  - 多个界面看到的是同一条共享 thread
  - 对话流实时同步
  - 主对话链路不被记忆系统拖慢
  - 坏 thread 可被识别、隔离和降级处理

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 每个阶段只解决一个闭环问题
- `Codex thread` 是共享会话真相源
- Relay 只做：
  - 多端 UI
  - 实时同步客户端
  - 记忆增强层
- 所有新增功能测试覆盖率目标：
  - 不低于 `85%`

---

## 1. 范围定义

本次必须做：

- 明确 `Codex thread` 为唯一会话真相源
- `local-bridge` 增加实时事件订阅能力
- Web 端接入 thread 实时同步
- Mobile 端预留同一实时同步协议接入点
- 统一 thread 状态模型：
  - `idle`
  - `running`
  - `syncing`
  - `stale`
  - `broken`
- 坏 thread 识别与隔离
- 所有 thread 写操作写后重读
- snapshot / 缓存与真相源分层
- 会话列表与详情页的外部变更失效机制
- 统一 TDD 测试基线，并确保新增功能覆盖率不低于 `85%`

本次明确不做：

- 修改 Codex CLI 自身数据库 schema
- 修改 Codex Desktop 本体行为
- 直接侵入 Codex 内部 sqlite 表结构做 join 业务
- 多用户权限系统
- 云同步
- 复杂协同权限与多人编辑冲突解决
- 主题记忆自动聚类算法升级

---

## 2. 关键产品定义

### 2.1 会话真相源定义

本版本统一采用以下定义：

- `Codex thread`：唯一会话真相源
- `Relay session`：面向产品层的视图概念，不再被视为独立底层真相
- `memory`：挂在 thread 之上的异步派生层

补充约束：

- Relay 可以缓存 thread 数据，但缓存永远不能替代真相源
- Relay 可以维护 UI 偏好，但不能维护另一套独立消息历史
- 任何真正影响 thread 的写操作都必须回到 Codex thread 上执行

### 2.2 多端同步定义

本版本中“多端同步”明确等于：

- 同一条 thread 在多个界面可被同时打开
- 任一端新增消息或 agent 增量输出时，其他端能收到变化
- 任一端重命名 / 归档 thread 后，其他端状态同步更新
- 任一端发现 thread 损坏，其他端看到的也应是同一个降级状态

本版本不把同步定义为：

- 多个端分别维护本地副本，靠周期性全量刷新凑同步

### 2.3 线程状态模型

本版本统一 thread 状态表达：

- `idle`：当前 thread 可读，无活动 run
- `running`：当前 thread 正在生成
- `syncing`：正在重新获取最新状态
- `stale`：当前 UI 内容来自快照，等待真实值更新
- `broken`：thread 存在，但底层 rollout 不可读或恢复失败

要求：

- Web / Mobile / bridge 输出语义必须一致
- UI 可不同，但状态含义必须相同

### 2.4 坏 thread 定义

本版本中以下情况统一视为 `broken thread`：

- `thread/read` 失败且判断为底层 rollout 缺失
- `thread/resume` 失败且判断为底层 rollout 缺失
- thread 在索引中存在，但底层内容已不可恢复

系统行为要求：

- 不阻断整个页面
- 不影响其他 thread 使用
- 不把坏 thread 当正常 thread 继续展示
- UI 必须给出明确可理解的状态

---

## 3. Codex 兼容原则

这一节是本版本最重要的约束。

虽然 Relay 未来要支持 Web / Mobile 直接继续对话，但必须坚持：

- 不自建另一套会话真相源
- 不和 Codex Desktop / CLI 在底层 thread 上形成“双真相”

具体约束如下：

### 3.1 真相源唯一

只能存在一个共享 thread 真相源：

- `Codex thread`

不允许：

- Relay 再维护一套独立消息真相
- Web / Mobile 用自己的草稿消息链路替代 thread 真相
- snapshot 命中后长期不与真实 thread 对齐

### 3.2 协议优先，结构次之

Relay 与 Codex 的边界只允许依赖以下稳定能力：

- `codex app-server`
- `thread/list`
- `thread/read`
- `thread/start`
- `thread/resume`
- `thread/name/set`
- `thread/archive`
- `turn/start`
- 通知流：
  - `turn/started`
  - `item/started`
  - `item/agentMessage/delta`
  - `turn/completed`

不允许直接依赖：

- Codex 内部 sqlite 表结构做业务读写
- 未稳定承诺的本地索引文件格式
- 私有缓存文件结构

### 3.3 写后重读

所有 thread 写操作必须遵循：

- 先写入 Codex
- 再读回 thread 真相
- 再更新 Relay 视图

覆盖操作：

- 创建
- 发送消息
- 重命名
- 归档
- 恢复 / resume

### 3.4 降级原则

若 Codex 底层出现：

- rollout 缺失
- thread 不可恢复
- 通知流异常

系统行为应为：

- 主页面不崩溃
- 其他 thread 不受影响
- 当前 thread 明确标记为 `broken`
- 记忆层与 UI 层允许降级，但不能把坏数据继续当正常 thread

---

## 4. 数据与事件模型设计

### 4.1 会话视图模型

建议统一使用以下视图模型：

- `threadId`
- `workspaceId`
- `title`
- `cwd`
- `turnCount`
- `messages`
- `status`
- `source`
  - `fresh`
  - `snapshot`
- `syncState`
  - `idle`
  - `running`
  - `syncing`
  - `stale`
  - `broken`
- `brokenReason`
- `updatedAt`

说明：

- `source` 描述当前内容来源
- `syncState` 描述当前 thread 运行和同步状态
- `brokenReason` 只用于机器判断与 UI 降级提示

### 4.2 实时事件模型

建议新增统一事件类型：

- `thread.list.changed`
- `thread.updated`
- `thread.archived`
- `thread.broken`
- `thread.deleted_or_missing`
- `run.started`
- `message.delta`
- `message.completed`
- `run.completed`
- `run.failed`

要求：

- 每个事件包含：
  - `threadId`
  - `workspaceId`（若可确定）
  - `occurredAt`
  - `sequence` 或等价顺序字段
- 前端必须支持乱序防护或至少忽略旧事件覆盖新状态

### 4.3 快照与缓存分层

本版本中必须明确：

- snapshot 只用于“更快显示”
- cache 只用于“更少重复请求”
- 真相判断永远来自 Codex thread

因此要求：

- snapshot 命中时必须带 `stale` 标记
- 前端进入详情页后必须补真实读取
- 外部变更场景下缓存必须可失效

### 4.4 坏 thread 元信息

对于坏 thread，建议新增以下派生信息：

- `brokenReason`
  - `missing_rollout`
  - `resume_failed`
  - `read_failed`
- `lastHealthyAt`
- `isRecoverable`

首版可先最小实现：

- `brokenReason`
- `syncState = broken`

---

## 5. 建议代码结构

建议在当前仓库中增加以下内容：

```text
/Users/ruska/project/web-cli/
  services/
    local-bridge/
      src/
        routes/
          stream.ts
          sessions.ts
          runtime.ts
        services/
          codex-event-bus.ts
          thread-sync-service.ts
          broken-thread-detector.ts
      tests/
        unit/
          broken-thread-detector.test.ts
          thread-sync-service.test.ts
        integration/
          thread-stream-route.test.ts
          sessions-broken-thread.test.ts
          runtime-write-after-read.test.ts
  packages/
    shared-types/
      src/
        thread-sync.ts
  apps/
    web/
      src/
        lib/
          realtime/
            thread-stream.ts
        components/
          workspace-client.tsx
          sessions-client.tsx
      tests/
        unit/
          workspace-realtime-sync.test.tsx
          sessions-broken-thread-ui.test.tsx
```

说明：

- 实时同步逻辑优先收敛在 `local-bridge`
- 前端只消费 bridge 提供的统一事件流
- `shared-types` 提供事件和 thread 视图统一类型

---

## 6. TDD 阶段拆分

## 阶段 01：统一类型与坏 thread 识别

### 目标

先建立统一 thread 视图类型与坏 thread 判断规则。

### 先写测试

- `packages/shared-types` 编译约束或类型测试
- `services/local-bridge/tests/unit/broken-thread-detector.test.ts`
  - 能识别 `missing rollout` 错误
  - 能识别 `resume` 失败但 thread 仍可读的非坏 thread
  - 不会把普通读取错误全部误判为 `broken`
  - 能输出稳定的 `brokenReason`

### 再实现

- `packages/shared-types/src/thread-sync.ts`
- `services/local-bridge/src/services/broken-thread-detector.ts`

### 验收标准

- thread 视图类型统一
- `broken` 判断规则可复用
- 不依赖前端自行猜测错误含义

---

## 阶段 02：bridge 实时事件总线

### 目标

把 `local-bridge` 从“只提供拉取接口”升级为“可广播 thread 变化的实时事件中心”。

### 先写测试

- `services/local-bridge/tests/unit/thread-sync-service.test.ts`
  - 能订阅一个 thread 的事件流
  - 能广播 `run.started`
  - 能广播 `message.delta`
  - 能广播 `run.completed`
  - 取消订阅后不再继续收到事件
- `services/local-bridge/tests/integration/thread-stream-route.test.ts`
  - SSE 连接建立成功
  - thread 过滤条件生效
  - 非目标 thread 事件不会误推送

### 再实现

- `services/local-bridge/src/services/codex-event-bus.ts`
- `services/local-bridge/src/services/thread-sync-service.ts`
- `services/local-bridge/src/routes/stream.ts`

### 验收标准

- bridge 提供可用的 thread 事件流
- 单 thread 事件订阅边界清晰
- 不要求前端轮询才能得到增量变化

---

## 阶段 03：thread 写后重读与一致性修复

### 目标

确保所有 thread 写操作都经过“写后重读”，不让 Relay 本地乐观状态变成假真相。

### 先写测试

- `services/local-bridge/tests/integration/runtime-write-after-read.test.ts`
  - `turn/start` 后会触发最新 thread 再读取
  - `thread/name/set` 后会重读
  - `thread/archive` 后会更新列表状态
  - 写入失败时不会错误保存成功态快照

### 再实现

- 修改：
  - `services/local-bridge/src/routes/runtime.ts`
  - `services/local-bridge/src/routes/sessions.ts`

### 验收标准

- 创建 / 发送消息 / 重命名 / 归档后，Relay 看到的是回读后的真实状态
- 不再把本地乐观值当最终真相

---

## 阶段 04：坏 thread 隔离与降级展示

### 目标

把底层 rollout 丢失或不可恢复的 thread 从“正常 thread”中隔离出来。

### 先写测试

- `services/local-bridge/tests/integration/sessions-broken-thread.test.ts`
  - `thread/read` 缺失 rollout 时，详情返回 `broken`
  - 列表中可选择：
    - 隐藏坏 thread
    - 或标记坏 thread
  - 坏 thread 不影响其他 thread 列表读取
- `apps/web/tests/unit/sessions-broken-thread-ui.test.tsx`
  - 坏 thread 状态有明确 UI
  - 用户不会把它误认为正常可继续对话的 session

### 再实现

- 修改：
  - `services/local-bridge/src/routes/sessions.ts`
  - `apps/web/src/components/workspace-client.tsx`
  - `apps/web/src/components/sessions-client.tsx`

### 验收标准

- 坏 thread 不再导致页面整体体验混乱
- 用户能区分“正常但未加载”与“底层记录损坏”

---

## 阶段 05：Web 端实时同步接入

### 目标

让 Web 成为真正的 thread 实时客户端。

### 先写测试

- `apps/web/tests/unit/workspace-realtime-sync.test.tsx`
  - 初始显示 snapshot 后，收到实时事件能更新
  - 收到 `message.delta` 时中间对话区增量刷新
  - 收到 `run.completed` 时状态归位
  - 外部端修改标题后列表标题同步更新
  - 外部端归档后当前页面状态同步收敛

### 再实现

- 新增：
  - `apps/web/src/lib/realtime/thread-stream.ts`
- 修改：
  - `apps/web/src/components/workspace-client.tsx`
  - `apps/web/src/components/sessions-client.tsx`

### 验收标准

- Web 不再只是“拉一次数据”
- 同一 thread 在 Web 中可实时看到其他端带来的变化

---

## 阶段 06：Mobile 接入预留与共享协议收敛

### 目标

虽然首版不要求 Mobile 完整做完，但必须确保协议已可复用，避免后续再拆一套同步模型。

### 先写测试

- `services/local-bridge/tests/unit/thread-sync-service.test.ts`
  - 同一协议可被多个客户端并发订阅
- `apps/web/tests/unit/workspace-realtime-sync.test.tsx`
  - 断线重连后能恢复到最新状态

### 再实现

- 在移动端数据层保留：
  - thread 流订阅接口
  - 重连接口
  - snapshot + realtime 合并策略

### 验收标准

- Mobile 后续接入不会推翻 Web 已有同步模型

---

## 7. 测试与覆盖率要求

本计划采用严格 TDD。

要求如下：

- 所有新增功能先补测试，再实现
- 单元测试覆盖：
  - 类型边界
  - 错误识别
  - 事件广播
  - 状态转换
- 集成测试覆盖：
  - bridge SSE 路由
  - 写后重读链路
  - 坏 thread 隔离
  - snapshot + realtime 合并行为
- 前端测试覆盖：
  - 实时消息同步
  - 外部修改同步
  - 坏 thread UI 降级

覆盖率要求：

- 新增功能相关代码覆盖率不低于 `85%`
- 若某块因为运行时依赖或第三方协议无法直接测满，需要：
  - 明确标注原因
  - 用集成测试或契约测试补等价覆盖

建议指标：

- lines >= `85%`
- functions >= `85%`
- branches >= `80%`

其中：

- 对状态机、坏 thread 判断、事件过滤等高风险逻辑，分支覆盖要优先提升

---

## 8. 里程碑与交付顺序

建议里程碑如下：

### M1：统一模型与坏 thread 识别

交付物：

- 统一 thread 类型
- 坏 thread 识别器
- 基础测试

### M2：bridge 实时事件中心

交付物：

- SSE 订阅通道
- 事件模型
- 事件广播服务

### M3：写后重读与一致性收敛

交付物：

- 所有 thread 写操作写后重读
- snapshot / cache / 真相分层明确

### M4：Web 实时客户端

交付物：

- workspace 实时同步
- sessions 实时同步
- 坏 thread UI 降级

### M5：Mobile 协议预留与 memory 解耦

交付物：

- Mobile 可复用协议
- memory 继续保持派生层定位

---

## 9. 成功标准

本计划完成后，至少应满足：

- Web / Mobile / Desktop / CLI 可围绕同一条 Codex thread 工作
- Relay 不再被视为另一套 session 真相源
- 外部端的 thread 变化可实时同步到 Web
- 坏 thread 不再污染正常体验
- memory 系统继续作为 thread 之上的增强层存在
- 新增功能测试覆盖率达到既定目标

如果本计划未达成这些结果，即使局部性能或 UI 继续提升，也不能视为“统一实时会话架构”真正落地。
