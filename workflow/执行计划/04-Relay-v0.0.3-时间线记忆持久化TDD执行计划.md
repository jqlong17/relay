# 04 Relay v0.0.3 时间线记忆持久化 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.0.3` 的“时间线记忆持久化”能力。

本版本要解决的问题非常明确：

- `sessions` 页面右侧 `summary` 不再显示 `linked file`
- `sessions` 页面右侧 `summary` 不再显示 `timeline`
- 右侧只显示当前 `session` 已生成的“时间线记忆”
- 记忆需要持久化，不能只停留在当前进程内存
- 记忆按日期存储，同一天内允许存在多条记忆
- 每条记忆对应一次大模型总结
- 默认每 `20` 条用户消息触发一次自动记忆整理

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 每个阶段只解决一个闭环问题
- 先保证 Codex CLI 独立性，再做与 Codex 的结合

---

## 1. 范围定义

本次必须做：

- 时间线记忆的数据模型
- 基于 `sqlite` 的记忆持久化
- `runtime/run` 后的自动触发器
- “时间线记忆”默认提示词固化
- 当前 `session` 记忆查询接口
- `sessions` 页面右侧 summary 改为只展示记忆
- `memories` 页面接入真实数据的基础读取
- 幂等保护，避免同一 checkpoint 重复生成

本次明确不做：

- 修改 Codex CLI 自身数据库 schema
- 依赖 Codex CLI 内部未文档化表结构做业务耦合
- 云同步
- 多用户记忆隔离
- 用户自定义记忆 prompt 编辑器
- 复杂的记忆搜索、标签、主题聚类

---

## 2. 关键产品定义

### 2.1 记忆粒度

采用以下定义：

- 生成粒度：按 `session`
- 存储分区：按日期归档
- 展示范围：右侧只展示当前 `session` 的记忆
- 日期下可存在多条记忆

补充约束：

- `session` 同时是主题容器
- `session title` 不是普通展示字段，而是当前会话主题的人类命名
- 主题默认直接继承 `session title`，不要求模型首版自动发明主题

### 2.1.1 主题定义

本版本采用以下主题策略：

- 主题主表达：`session title`
- 主题聚合键：由 `session title` 规范化得到的 `themeKey`
- 主题展示名：生成记忆时落库的 `themeTitle`

推荐的 `session title` 风格：

- `【性能优化】`
- `【Web端开发】`
- `【记忆优化】`

这样做的原因：

- 更符合用户真实使用习惯
- 当前项目中的人工整理记录已经证明，不同 session 往往天然对应不同主题
- 主题不需要额外由模型猜测，直接继承用户命名更稳

### 2.1.2 主题与记忆的关系

本计划中三者关系明确如下：

- `session`：主题容器
- `timeline memory`：该主题在某个时间 checkpoint 的沉淀
- `theme view`：对多个同主题记忆的聚合视图

首版不单独发明复杂主题系统，只做：

- 当前 session 内的记忆沉淀
- `memories` 页面中的按主题聚合查看

### 2.2 触发规则

“每 20 轮”在本计划中明确等于：

- 每 `20` 条 `user message` 触发一次

对应 checkpoint 例如：

- `20`
- `40`
- `60`

每个 checkpoint 只允许生成一次记忆。

### 2.3 默认记忆动作

默认动作统一为一个，不拆分多个快捷动作，名称固定为：

- `时间线记忆`

默认提示词：

```text
按时间线梳理对话摘要，保留必要细节和具体文件。

用户决策
提取用户明确做出的决策和理由；若理由没明说就不要补。

关注点地图
识别用户在过程中真正关注什么、不关注什么。
```

说明：

- 首版以服务端固定 prompt 落地
- 后续如需调整，采用 `promptVersion` 字段做版本管理

---

## 3. Codex CLI 独立性与兼容原则

这一节是本版本最重要的约束。

本项目虽然要与 Codex CLI 良好结合，但必须保证：

- Relay 的记忆功能是附加层，不是对 Codex CLI 的侵入式改造
- Codex CLI 升级后，Relay 不应因为依赖内部 schema 而崩溃
- 我们的持久化层必须可独立迁移、独立初始化、独立回滚

具体约束如下：

### 3.1 数据库独立

不直接修改 Codex CLI 现有 sqlite 表。

不做以下事情：

- 不向 Codex CLI 自带表写入业务字段
- 不依赖 `threads`、`logs` 等内部表的列结构做 join 查询
- 不在 Codex CLI 迁移链上追加我们的 migration

采用的方案是：

- 在 Codex 目录旁新建独立数据库
- 建议路径：`~/.codex/sqlite/relay-memory.db`

这样可以做到：

- 使用体验上仍与 Codex 放在一起
- 物理实现上与 Codex 内部 schema 解耦

### 3.2 协议优先，结构次之

Relay 与 Codex CLI 的集成边界只允许依赖以下稳定能力：

- `codex app-server`
- `thread/list`
- `thread/read`
- `thread/start`
- `thread/resume`
- `thread/name/set`
- `thread/archive`
- `turn/start`

不允许直接依赖：

- Codex 内部 sqlite 的表结构
- 未公开承诺稳定的内部日志格式
- 私有缓存文件格式

### 3.3 降级策略

如果未来 Codex CLI 升级导致以下任一问题出现：

- thread 读取字段变化
- turn 通知字段变化
- 某次自动记忆生成失败

系统行为应为：

- 不影响主对话链路
- 不阻断 `runtime/run` 的成功返回
- 记忆模块记录失败并允许后续重试
- UI 只展示“暂无记忆”或“生成失败，可重试”

### 3.4 可迁移性

记忆 schema 的演进必须由 Relay 自己管理。

要求：

- 自己维护 schema 初始化逻辑
- 为后续 migration 预留版本表或等价机制
- 不把 Codex 升级与 Relay 记忆升级绑死

---

## 4. 数据模型设计

建议新增以下持久化实体：

### 4.1 `timeline_memories`

建议字段：

- `id`
- `session_id`
- `workspace_id`
- `theme_title`
- `theme_key`
- `session_title_snapshot`
- `memory_date`
- `checkpoint_turn_count`
- `prompt_version`
- `title`
- `content`
- `status`
- `source_thread_updated_at`
- `created_at`
- `updated_at`

说明：

- `theme_title` 为生成时刻的主题展示名，默认继承当前 `session title`
- `theme_key` 为主题规范化键，用于聚合同主题记忆
- `session_title_snapshot` 保留生成时原始 session 名称，避免后续重命名导致历史语义漂移
- `memory_date` 使用本地日期字符串，例如 `2026-04-03`
- `checkpoint_turn_count` 用于标识这是第几次 checkpoint 记忆
- `status` 至少支持：
  - `completed`
  - `failed`

建议约束：

- `UNIQUE(session_id, checkpoint_turn_count)`

建议索引：

- `INDEX(workspace_id, memory_date)`
- `INDEX(session_id, created_at DESC)`
- `INDEX(theme_key, created_at DESC)`

### 4.1.1 主题字段规范化规则

`themeKey` 首版建议采用简单稳定规则：

- 取 `session title`
- 去掉首尾空白
- 去掉全角或半角包裹符号，如 `【】`、`[]`
- 转为统一大小写
- 将连续空白折叠为单个空格

要求：

- 规则要可预测
- 规则要能在前后端保持一致
- 不要引入依赖模型判断的隐式分类

### 4.2 `theme summary` 预留

本版本不强制落地独立主题汇总表，但要为后续能力预留方向。

建议后续增加的聚合产物为：

- `theme summary`

它的职责是：

- 基于某个 `themeKey` 下多条 timeline memories 做更高层汇总
- 形成长期主题脉络，而不是单次 checkpoint 摘要

首版可以不自动生成，也可以仅保留手动触发能力预留。

### 4.3 可选扩展字段

如首版成本可控，可增加：

- `source_message_count`
- `generation_error`
- `model_name`

但这些不是首版必须项。

---

## 5. 建议代码结构

建议在当前仓库中增加以下内容：

```text
/Users/ruska/project/web-cli/
  services/
    local-bridge/
      src/
        routes/
          memories.ts
        services/
          memory-store.ts
          timeline-memory-service.ts
          timeline-memory-prompt.ts
      tests/
        unit/
          memory-store.test.ts
          timeline-memory-service.test.ts
        integration/
          memories-route.test.ts
          runtime-memory-trigger.test.ts
  packages/
    shared-types/
      src/
        memory.ts
  apps/
    web/
      src/
        app/
          api/
            bridge/
              memories/
                route.ts
              sessions/
                [id]/
                  memories/
                    route.ts
        components/
          sessions-client.tsx
      tests/
        unit/
          sessions-memory-panel.test.tsx
          memories-page.test.tsx
```

说明：

- 记忆逻辑优先收敛在 `local-bridge`
- 前端只消费桥接层提供的稳定 API
- `shared-types` 补统一类型，避免前后端各自猜字段

---

## 6. TDD 阶段拆分

## 阶段 01：记忆类型与 sqlite store

### 目标

先建立独立于 Codex CLI 的记忆持久化底座。

### 先写测试

- `packages/shared-types` 相关类型测试或编译约束
- `services/local-bridge/tests/unit/memory-store.test.ts`
  - 首次启动会初始化数据库和表
  - 可插入一条记忆
  - 可按 `sessionId` 查询
  - 可按 `memoryDate` 查询
  - 同一 `sessionId + checkpointTurnCount` 重复写入会被拒绝或忽略

### 再实现

- `packages/shared-types/src/memory.ts`
- `services/local-bridge/src/services/memory-store.ts`

### 验收标准

- 独立数据库可自动初始化
- 不修改 Codex CLI 自带数据库表
- 本地可读写时间线记忆
- 记忆写入时可同时保存主题字段
- 能按 `themeKey` 聚合同主题记忆

---

## 阶段 02：时间线记忆 prompt 与生成服务

### 目标

把“时间线记忆”变成可调用的独立服务。

### 先写测试

- `services/local-bridge/tests/unit/timeline-memory-service.test.ts`
  - 能把 session/thread 转成总结输入
  - 使用固定 prompt 生成请求
  - 生成时自动携带 `themeTitle/themeKey/sessionTitleSnapshot`
  - 生成成功后写入 store
  - 生成失败时返回失败状态但不抛出阻断主链路的异常

### 再实现

- `services/local-bridge/src/services/timeline-memory-prompt.ts`
- `services/local-bridge/src/services/timeline-memory-service.ts`

### 验收标准

- 生成服务输入边界清晰
- prompt 固定且可版本化
- 失败可降级
- 主题字段由 session 标题稳定派生

---

## 阶段 03：runtime 自动触发器

### 目标

在对话主链路结束后自动判断是否需要生成新记忆。

### 先写测试

- `services/local-bridge/tests/integration/runtime-memory-trigger.test.ts`
  - `turnCount < 20` 不触发
  - 到 `20` 轮触发一次
  - 同一个 `20` 轮 checkpoint 不重复触发
  - 到 `40` 轮再次触发
  - 记忆生成失败不会让 `/runtime/run` 返回失败

### 再实现

- 在 [`runtime.ts`](/Users/ruska/project/web-cli/services/local-bridge/src/routes/runtime.ts) 中接入 checkpoint 检查
- 将触发逻辑封装为独立函数或服务，避免 route 代码膨胀

### 验收标准

- 自动触发规则稳定
- 幂等成立
- 主对话链路不被记忆模块拖垮

---

## 阶段 04：记忆查询 API

### 目标

让前端能稳定读取当前 session 和记忆页所需数据。

### 先写测试

- `services/local-bridge/tests/integration/memories-route.test.ts`
  - `GET /sessions/:id/memories` 返回当前 session 记忆
  - `GET /memories?date=YYYY-MM-DD` 返回当日记忆
  - `GET /memories?themeKey=...` 返回某个主题下的记忆
  - `POST /sessions/:id/memories/generate` 可手动触发一次生成
  - session 不存在时返回 `404`

### 再实现

- `services/local-bridge/src/routes/memories.ts`
- `services/local-bridge/src/index.ts` 中挂载新路由
- `apps/web/src/app/api/bridge/memories/route.ts`
- `apps/web/src/app/api/bridge/sessions/[id]/memories/route.ts`
- `apps/web/src/lib/api/bridge.ts` 增加前端调用

### 验收标准

- session 右侧面板和 memories 页面都能走同一套桥接接口
- API 不暴露 Codex 内部实现细节
- 可按主题读取聚合结果

---

## 阶段 05：sessions 右侧 summary 重构

### 目标

把当前混合面板收敛成“只看当前 session 记忆”的 summary。

### 先写测试

- `apps/web/tests/unit/sessions-memory-panel.test.tsx`
  - 右侧仅渲染时间线记忆
  - 不再渲染 `linked file`
  - 不再渲染 `timeline`
  - 顶部显示当前 session 主题
  - 按日期分组展示
  - 无记忆时展示空状态

### 再实现

- 修改 [`sessions-client.tsx`](/Users/ruska/project/web-cli/apps/web/src/components/sessions-client.tsx)
- 如有必要，拆出单独的 `sessions-memory-panel` 组件

### 验收标准

- 右侧 summary 职责单一
- 不再混入文件树与文件预览
- 当前 session 的记忆可直接浏览
- 当前主题表达明确且稳定

---

## 阶段 06：memories 页面接入真实数据

### 目标

让 `memories` 页面至少具备“按日查看记忆 + 按主题聚合查看”的真实能力。

### 先写测试

- `apps/web/tests/unit/memories-page.test.tsx`
  - 页面可加载某日记忆
  - 同日多条记忆可显示
  - 可显示来源 session
  - 可切换到主题视图
  - 同一主题下可聚合多条记忆
  - 无数据时展示空状态

### 再实现

- 修改 [`memories/page.tsx`](/Users/ruska/project/web-cli/apps/web/src/app/memories/page.tsx)
- 视情况增加简单客户端组件承载交互

### 验收标准

- 页面不再只是静态样板
- 至少可以查看真实日期下的真实记忆
- 可以按主题聚合同名或同 key 的记忆

---

## 阶段 07：回归与兼容性验证

### 目标

确认引入记忆模块后，不破坏现有 Relay 与 Codex 的工作链路。

### 先写测试

- 回归 `sessions` 列表与详情读取
- 回归 `runtime/run` 流式输出
- 回归工作区切换
- 回归无记忆旧 session 的展示

### 再实现

- 修补集成问题
- 清理多余耦合
- 补充必要注释与文档

### 验收标准

- 旧 session 可正常使用
- 没有记忆时 UI 可正常降级
- Codex CLI 升级风险点被限制在 app-server 协议层

---

## 7. 关键实现决策

### 7.1 为什么不用 Codex 内置 sqlite 表

原因很直接：

- Codex CLI 的内部表结构不是我们项目的稳定契约
- 升级时列名、表名、迁移方式都可能变化
- 一旦我们直接写入或 join 这些表，风险会从“集成”变成“侵入”

因此本计划强制采用：

- 独立库
- 独立表
- 独立迁移

### 7.1.1 为什么主题不交给模型自动分类

原因也很直接：

- 主题是用户工作流中的强语义入口
- `session title` 往往就是用户主动命名过的主题
- 如果首版让模型自动分类，容易出现：
  - 同主题被拆散
  - 不同主题被误并
  - 用户心智和系统分类不一致

因此首版采用：

- 主题直接继承 `session title`
- 聚合依赖确定性的 `themeKey`
- 模型只负责生成记忆内容，不负责决定主题归属

### 7.2 为什么触发器挂在 `runtime/run` 后

因为这里有三个优势：

- 能拿到一次 turn 完成后的最新 thread
- 能基于最新 `turnCount` 做 checkpoint 判断
- 即便记忆生成失败，也容易做到不影响主对话请求返回

### 7.3 为什么右侧 summary 不再显示文件

因为本次需求已经明确：

- summary 只负责当前 session 的记忆

文件树、文件预览、timeline 都属于其他工作台职责，不应继续混在记忆面板里。

### 7.4 为什么 `memories` 页面要增加主题入口

因为按日期只能回答“那天发生了什么”，但不能回答“这个主题一路怎么演进”。

而你当前 `workflow/session` 的人工记录已经证明：

- session 天然带主题
- 主题是后续复用和回看时更稳定的入口

因此 `memories` 页面应采用双入口：

- 按日期看沉淀
- 按主题看演进

---

## 8. 风险与预案

### 风险 01：Codex app-server 返回结构变化

预案：

- 只在 `CodexAppServerService` 一层做适配
- 记忆模块永远消费内部规范化后的 `Session` / `Thread` 数据

### 风险 02：自动记忆生成拖慢主链路

预案：

- `/runtime/run` 先返回主结果
- 记忆生成采用异步补写或失败不阻断模式

### 风险 03：重复触发导致重复记忆

预案：

- 应用层 checkpoint 判重
- 数据库唯一约束兜底

### 风险 04：旧 session 没有记忆

预案：

- UI 空状态处理
- 支持手动触发补生成

### 风险 05：session 重命名导致主题漂移

预案：

- 每条 memory 落库时保存 `themeTitle` 和 `sessionTitleSnapshot`
- 聚合时优先依据 `themeKey`
- 必要时后续可提供主题合并或重算工具，但不作为首版前置条件

---

## 9. 执行顺序建议

按以下顺序推进：

1. 先完成记忆类型与 sqlite store
2. 再完成记忆生成服务
3. 然后接入 runtime 自动触发
4. 再暴露查询 API
5. 再改 sessions 右侧 summary
6. 再接 memories 页的按日期 / 按主题双视图
7. 最后做回归测试

---

## 10. 完成定义

满足以下条件，才算本计划完成：

- 当前 session 每到 20 条用户消息会自动新增一条时间线记忆
- 记忆被持久化到独立 sqlite 中
- 右侧 summary 只展示当前 session 的记忆
- `linked file` 与 `timeline` 不再出现在该 summary 中
- 记忆会携带主题字段，并默认继承 session 标题
- `memories` 页面可以按日期和按主题读取真实记忆数据
- 记忆模块不依赖 Codex CLI 内部 sqlite schema
- Codex CLI 升级风险被控制在 app-server 协议适配层
