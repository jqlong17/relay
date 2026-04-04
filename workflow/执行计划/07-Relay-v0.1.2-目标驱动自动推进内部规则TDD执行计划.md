# 07 Relay v0.1.2 目标驱动自动推进内部规则 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.1.2` 的“目标驱动自动推进内部规则”能力。

本版本要解决的问题非常明确：

- 当前自动化体系里，Relay 内部规则只有“按轮次自动整理”这一类系统内置规则
- Codex 自动化可以定时执行提示词，但不具备“围绕目标持续推进直到完成”的多轮对话编排能力
- 用户希望只在开始时设定一个目标，然后系统能够自动推进，不再要求人类在每一轮继续输入
- 用户希望这不是一个独立的 Codex 定时规则，而是一个 Relay 内部能力
- 这个能力既要能绑定已有 session 复用上下文，也要能选择新开一个 session 单独推进
- 为了避免异常情况，系统必须有最大轮次与最大运行时长这两个兜底约束

本版本的核心目标不是“再加一种定时触发器”，而是：

- 在 Relay 内部引入一种新的可配置内部规则
- 让该规则能围绕用户目标自动与 Codex thread 持续多轮交互
- 让系统在每轮后自动评估目标是否完成
- 让这一能力在当前工作区 UI 中可创建、可运行、可停止、可查看状态

当前已确认的产品决策如下：

- 这是“一个有目标感的 agent”和 Codex thread 的自动多轮对话，不再要求人类逐轮介入
- 支持绑定已有 session 或新开 session
- 目标完成判断接受模型自动评估
- 第一版只做手动启动，不做时间触发

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 每个阶段只解决一个闭环问题
- `Codex thread` 仍是对话真相源
- Relay 负责目标编排、状态持久化、规则管理与 UI 展示
- 编排逻辑必须位于 `local-bridge`，不能退化成纯前端临时逻辑

---

## 1. 范围定义

本次必须做：

- 新增一种 Relay 用户可配置内部规则：
  - `goal-loop`
- 支持用户设定：
  - 目标描述
  - 目标 session 来源：
    - 绑定当前已有 session
    - 新建专用 session
  - 最大轮次
  - 最大运行时长
- 默认值：
  - 最大轮次 `10`
  - 最大运行时长 `120 分钟`
- 支持手动：
  - 创建
  - 编辑
  - 删除
  - 启动
  - 停止
- 每轮自动执行以下编排：
  - 向目标 session 发起一轮用户输入
  - 等待本轮完成
  - 读取本轮最新 assistant 最终回答
  - 自动评估目标是否完成
  - 若未完成则生成下一轮用户输入并继续推进
- 执行状态必须持久化
- 工作区右侧 `automation` tab 需要提供当前 session 上下文下的快捷创建入口
- 顶层 `automation` 页面需要统一展示和管理：
  - Relay 系统内置规则
  - Relay 用户自定义内部规则
  - Codex 自动化规则
- 规则列表与详情中必须明确区分：
  - 来源
  - 类型
  - 能否编辑
  - 能否运行 / 停止
- 第一版需要完整测试覆盖：
  - shared types
  - bridge service
  - bridge routes
  - Web UI

本次明确不做：

- 按时间自动触发该规则
- 多工作区并发资源配额管理
- 多个目标 agent 协作
- 人类中途审批下一轮是否继续
- 自定义评估模型选择
- 自动恢复 bridge 重启前未完成运行
- 复杂树搜索、反思链、子任务拆解器

---

## 2. 当前现状判断

当前系统已经具备以下能力：

- `local-bridge` 已经有 Relay 内部规则服务
- `GET /automations` 已经能返回真实内部规则，而不是 mock
- `runtime/run` 已经能向目标 thread 发起一轮真实执行
- 运行完成后，thread 快照可以同步回 session 视图
- Web 已经有独立的 `automation` 页面，并支持展示 Relay 内部规则与 Codex 自动化
- Web 已经具备运行历史展示、详情查看、手动运行 Codex 规则等基础 UI 能力

当前系统仍存在以下结构性问题：

- `AutomationRule` 类型仍然高度绑定“按轮次自动整理”这一种规则
- `AutomationService` 只能列出一个固定的系统内置规则
- `automations` route 只有只读 list，没有内部规则的增删改启停接口
- `RelayStateStore` 还没有内部规则定义与运行状态的持久化结构
- `runtime` 层虽然能跑单轮，但没有目标驱动的多轮编排器
- 前端虽然能管理 Codex 自动化，但还不能真正创建和管理“用户定义的 Relay 内部规则”

结论：

- 当前基础能力已经足够支撑“目标驱动自动推进”落地
- 但还缺一个真正的编排层与内部规则管理层

---

## 3. 版本目标定义

本版本统一采用以下分层：

- `shared types`
- `relay-state persistence`
- `goal automation service`
- `goal automation executor`
- `bridge routes`
- `web ui`

### 3.1 核心交付标准

达到以下标准才算完成：

- 用户可以在当前 session 上创建一条“目标驱动自动推进”内部规则
- 用户可以选择：
  - 绑定当前 session
  - 新开一个专用 session
- 用户点击“启动”后，系统可以自动连续推进多轮
- 每轮完成后，系统自动判断目标是否完成
- 若完成，规则自动停止并记录完成原因
- 若未完成，系统自动继续下一轮
- 若达到最大轮次或最大运行时长，规则自动停止并记录停止原因
- 用户可以在 `automation` 页面看到：
  - 当前状态
  - 已推进轮次
  - 目标 session
  - 最近运行结果
  - 停止原因
- 用户可以编辑、删除、启动、停止这类规则
- 系统内置 checkpoint 规则仍保持只读
- 现有 Codex 自动化功能不回归

---

## 4. 产品定义

### 4.1 规则定义

本版本新增内部规则类型：

- `goal-loop`

它表示：

- 用户定义了一个“最终目标”
- Relay 作为目标编排者不断向指定 session 追加新的 user turn
- Codex 作为执行者持续响应
- Relay 每轮后自动评估目标是否已经达成

### 4.2 用户参与边界

用户只在以下环节参与：

- 设定目标
- 选择绑定已有 session 或新建 session
- 调整最大轮次
- 调整最长运行时长
- 点击启动 / 停止

用户不参与：

- 每轮续写 user message
- 判断是否继续
- 判断是否完成

### 4.3 目标 session 策略

必须支持两种模式：

- `existing-session`
- `new-session`

其中：

- `existing-session`
  - 用于复用当前已有上下文
  - 默认从当前 workspace 右侧 automation tab 进入时预选当前 session
- `new-session`
  - 用于隔离自动推进过程
  - 系统创建专用 session，并以目标内容生成默认标题

### 4.4 自动评估定义

自动评估不是“看字数够不够”，而是一个独立的模型判断步骤。

每轮结束后评估器需要产出结构化结论：

- `done`: 是否完成
- `reason`: 为什么判定完成或未完成
- `nextUserPrompt`: 如果未完成，下一轮要追加给目标 session 的 user 输入

要求：

- 评估过程不能污染目标 session 本身
- 评估输出必须是稳定的结构化 JSON

### 4.5 停止条件

系统必须支持四种停止原因：

- `completed`
- `max_turns_reached`
- `max_duration_reached`
- `stopped_by_user`

另外还应记录失败原因：

- `failed`

---

## 5. 数据模型设计

### 5.1 shared types 重构

当前 `AutomationRule` 需要从单一结构升级为带 `kind` 的可扩展 union。

建议新增统一字段：

- `id`
- `kind`
- `source`
- `title`
- `summary`
- `status`
- `workspaceId`
- `sessionId`
- `sessionTitle`
- `capabilities`

建议区分三类：

- `timeline-memory-checkpoint`
- `goal-loop`
- `codex-automation`

其中 `goal-loop` 需要新增配置字段：

- `goal`
- `targetSessionMode`
- `targetSessionId`
- `targetSessionTitle`
- `maxTurns`
- `maxDurationMinutes`

### 5.2 运行态模型

`goal-loop` 还需要单独的运行态结构，不能只塞进规则定义里。

建议定义：

- `runStatus`
  - `idle`
  - `running`
  - `completed`
  - `stopped`
  - `failed`
- `startedAt`
- `updatedAt`
- `finishedAt`
- `currentTurnCount`
- `lastEvaluationReason`
- `lastAssistantSummary`
- `stopReason`
- `lastError`

### 5.3 状态持久化位置

建议复用 `RelayStateStore`，新增两部分：

- `internalAutomationRulesByWorkspaceId`
- `internalAutomationRunStatesByRuleId`

理由：

- 当前 bridge 已经用它持久化 workspace / session 偏好和快照
- 这一能力属于 Relay 本地编排状态，放在同一层最自然
- 第一版没有必要额外引入 sqlite

---

## 6. bridge 架构设计

### 6.1 新服务拆分

建议新增两个服务：

- `GoalAutomationService`
- `GoalAutomationExecutor`

职责如下：

#### `GoalAutomationService`

负责：

- 规则 CRUD
- 列表查询
- 规则与运行态聚合
- 参数校验
- 绑定 session 或新建 session 的配置处理

不负责：

- 实际多轮执行

#### `GoalAutomationExecutor`

负责：

- 启动一次 goal loop
- 按轮推进
- 自动评估
- 状态持久化
- 停止控制
- 并发互斥

不负责：

- 页面展示拼装
- 规则配置解释

### 6.2 执行器单实例约束

同一条 `goal-loop` 规则同一时刻只允许有一个活动实例。

要求：

- 启动前检查是否已在运行
- 停止后释放锁
- bridge 内用内存锁保护
- 运行态落盘，确保 UI 可感知当前状态

### 6.3 执行算法

执行算法建议如下：

1. 读取规则定义与运行约束
2. 解析目标 session
3. 若配置为新开 session，则创建专用 session
4. 初始化运行态为 `running`
5. 构造第一轮 user prompt
6. 调用 `runtime` 能力向目标 session 发起一轮执行
7. 等待本轮结束
8. 读取目标 session 最新 thread 快照
9. 提取本轮 assistant 最终回答
10. 调用评估器生成结构化评估结果
11. 若 `done = true`：
    - 标记 `completed`
    - 记录完成原因
    - 结束
12. 若未完成：
    - 检查 `maxTurns`
    - 检查 `maxDurationMinutes`
    - 未超限则将 `nextUserPrompt` 作为下一轮输入继续
13. 用户手动停止时：
    - 标记 `stopped_by_user`
    - 结束
14. 异常时：
    - 标记 `failed`
    - 记录错误

### 6.4 评估器策略

第一版建议使用“独立评估调用”，不要把评估消息写回目标 session。

原因：

- 否则目标 session 会混入评估提示词
- 会污染用户真正关心的对话上下文
- 会使历史阅读体验变差

评估输入建议包括：

- 用户目标
- 当前轮 assistant 最终回答
- 已执行轮次
- 历史评估原因摘要

评估输出必须限定为 JSON：

- `done`
- `reason`
- `nextUserPrompt`

### 6.5 bridge 重启策略

第一版明确采用：

- 不自动恢复未完成运行

bridge 重启后：

- 所有 `running` 状态统一转换为 `stopped`
- `stopReason` 记为：
  - `bridge_restarted`

原因：

- 第一版先保证状态清晰可解释
- 自动恢复需要额外解决中断点一致性和重复执行问题

---

## 7. route 设计

当前 `/automations` 只有 `GET list`。

本版本建议新增内部规则接口：

- `GET /automations`
- `POST /automations/internal/goal-loop`
- `PATCH /automations/internal/:id`
- `DELETE /automations/internal/:id`
- `POST /automations/internal/:id/start`
- `POST /automations/internal/:id/stop`

必要时可补充：

- `GET /automations/internal/:id/runs`

要求：

- 顶层 list 返回时统一聚合：
  - 系统内置内部规则
  - 用户定义内部规则
- 用户定义内部规则必须包含运行态

Web proxy 层需要对应新增：

- `/api/bridge/automations/internal/...`

---

## 8. Web UI 设计

### 8.1 工作区右侧 automation tab

当前工作区右侧 automation tab 只提供泛化自动化入口。

本版本应增加“针对当前 session 创建目标规则”的入口：

- 默认绑定当前 session
- 默认带入当前 session 标题
- 可以切换为“新建专用 session”
- 支持填写：
  - 目标
  - 最大轮次
  - 最大运行时长

该入口的核心作用是：

- 把“当前 session 上下文”自然传给规则创建过程

### 8.2 顶层 automation 页面

`automation` 页面需要支持第三类规则：

- Relay 用户定义内部规则

左侧列表建议分组为：

- `Codex 自动化`
- `Relay 用户规则`
- `Relay 系统内置`

右侧详情建议支持：

- 目标内容
- 绑定 session / 专用 session 信息
- 最大轮次
- 最大运行时长
- 当前运行状态
- 已执行轮次
- 最近一次评估原因
- 启动 / 停止 / 编辑 / 删除

### 8.3 状态展示要求

必须清楚展示：

- `来源`
- `类型`
- `当前状态`
- `目标 session`
- `上次运行`
- `停止原因`

对于 `goal-loop`：

- 它是 Relay 内部规则
- 但不是系统内置
- 它应显示为“用户配置”

对于 `timeline-memory-checkpoint`：

- 它仍显示为“系统内置”
- 不允许编辑

---

## 9. TDD 实施阶段

### 第 1 阶段：shared types 与状态存储测试

先写测试：

- `AutomationRule` 支持 `kind` 扩展
- `goal-loop` 配置结构可序列化
- `RelayStateStore` 可保存和读取内部规则定义
- `RelayStateStore` 可保存和读取内部规则运行态

再写最小实现：

- 改 shared types
- 扩展 relay state schema

### 第 2 阶段：GoalAutomationService 单测

先写测试：

- 创建规则成功
- 更新规则成功
- 删除规则成功
- 绑定已有 session 成功
- 新建 session 模式配置成功
- 列表能正确聚合系统内置规则与用户定义规则

再写最小实现：

- 新增 `GoalAutomationService`

### 第 3 阶段：GoalAutomationExecutor 单测

先写测试：

- 单轮后判断完成并停止
- 未完成时自动进入下一轮
- 达到最大轮次后停止
- 超过最大时长后停止
- 用户手动停止后终止循环
- 同一规则重复启动被拒绝
- bridge 重启后运行态能被标记为中止

再写最小实现：

- 新增执行器
- 实现互斥与状态落盘

### 第 4 阶段：bridge route 集成测试

先写测试：

- 创建规则接口
- 编辑规则接口
- 删除规则接口
- 启动规则接口
- 停止规则接口
- list 接口正确返回新规则

再写最小实现：

- 扩展 `automations` route
- 扩展 Web proxy route

### 第 5 阶段：Web UI 单测

先写测试：

- 工作区右侧 automation tab 能以当前 session 为默认上下文创建目标规则
- automation 页面能展示 Relay 用户规则
- 规则可编辑
- 规则可启动 / 停止 / 删除
- 运行状态和停止原因能正确显示

再写最小实现：

- 更新 automation 页面
- 更新 workspace 右侧 automation tab

### 第 6 阶段：真实联调与回归

必须完成：

- 当前 session 创建规则
- 新开 session 创建规则
- 手动启动一次完整执行
- 达成目标自动停止
- 超轮次自动停止
- 手动停止
- Codex 自动化页面不回归
- 系统内置 checkpoint 规则不回归

---

## 10. 关键实现建议

### 10.1 第一轮 prompt 生成建议

第一轮不要直接只发“请完成目标”。

建议由 Relay 生成带编排意图的首轮 user prompt，明确告诉 Codex：

- 当前最终目标是什么
- 当前 session 上下文可用于什么
- 如果尚未完成，应产出下一步可执行结果

这样第一轮更稳定，也更利于后续评估。

### 10.2 下一轮 prompt 生成建议

下一轮 user prompt 应由评估器返回，而不是写死模板。

这样可以让系统具备：

- 更自然的目标推进
- 更少的固定模板限制

### 10.3 规则命名建议

默认命名建议：

- `目标推进：<目标前 20~30 字>`

如果是绑定当前 session 创建，还可附加：

- `@<session title>`

### 10.4 UI 默认值建议

从当前 session 右侧创建时，默认：

- 绑定当前 session
- 最大轮次 `10`
- 最长运行时长 `120 分钟`
- 状态为可运行但未启动

---

## 11. 风险与应对

### 风险 1：目标 session 被自动推进污染

说明：

- 如果用户绑定的是已有 session，多轮自动 user turn 会持续写入该 session

应对：

- 明确告知这是“向该 session 继续推进”
- 同时提供“新建专用 session”模式

### 风险 2：模型评估不稳定

说明：

- 自动判断目标完成与否可能存在误判

应对：

- 严格限制评估输出 schema
- 要求返回 `reason`
- 在 UI 中展示最后一次评估原因

### 风险 3：bridge 中断导致状态不一致

说明：

- 运行到一半 bridge 重启，规则可能显示仍在运行

应对：

- 启动时统一扫描运行态
- 将残留 `running` 标记为 `bridge_restarted`

### 风险 4：规则类型继续扩展时再次结构失衡

说明：

- 如果这次仍沿用 checkpoint 专用结构，以后会继续出现字段混乱

应对：

- 这次必须把内部规则建模升级为 discriminated union

---

## 12. 完成标准

以下条件全部满足，才可视为本计划完成：

- `goal-loop` 内部规则可创建、编辑、删除
- 可绑定已有 session 或创建专用 session
- 可手动启动和停止
- 系统能自动进行多轮推进
- 模型可自动评估目标是否完成
- 最大轮次和最大时长兜底生效
- automation 页面可正确展示来源、类型、状态与停止原因
- 工作区右侧 automation tab 可基于当前 session 快速创建规则
- 系统内置 checkpoint 规则与 Codex 自动化功能无回归
- 所有新增核心能力均有 TDD 覆盖

---

## 13. 本计划后的推荐实施顺序

建议严格按以下顺序落地：

1. 先改 shared types 和 `RelayStateStore`
2. 再实现 `GoalAutomationService`
3. 再实现 `GoalAutomationExecutor`
4. 再扩 route
5. 最后改 Web UI

理由：

- 这是一项典型“编排能力先于页面”的功能
- 若先做 UI，很快会被底层状态结构反噬

