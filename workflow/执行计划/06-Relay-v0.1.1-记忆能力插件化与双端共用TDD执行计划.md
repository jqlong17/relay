# 06 Relay v0.1.1 记忆能力插件化与双端共用 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.1.1` 的“记忆能力插件化与双端共用”能力。

本版本要解决的问题非常明确：

- 当前时间线记忆已经可用，但主要服务于 Relay Web
- 现有实现虽然调用了 Codex app-server 生成记忆，但并没有形成可复用的“记忆能力层”
- 现有记忆 UI、bridge 路由、生成逻辑仍耦合在 Relay 产品内部
- 这导致记忆能力无法自然进入 Codex Desktop / Codex CLI 的使用流
- 用户希望把“记忆检索 / 注入 / 生成”沉淀为一套双端共用能力

本版本的核心目标不是“把整个 Relay 记忆页面搬进 Codex”，而是：

- 抽离 `memory core`
- 定义稳定的记忆能力边界
- 做 Codex 插件接入
- 让 Relay Web 和 Codex 都能消费同一套记忆能力

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 每个阶段只解决一个闭环问题
- 核心能力优先独立，UI 与接入层后置
- 坚持 Codex 升级兼容性优先于短期“改起来快”

---

## 1. 范围定义

本次必须做：

- 抽离独立 `memory core`
- 将存储、查询、注入、生成触发从 Relay Web 逻辑中解耦
- 为 `memory retrieval / injection / generation` 定义统一服务接口
- 将现有时间线记忆与偏好记忆纳入统一能力模型
- 提供 Relay Web 可直接调用的本地服务接入层
- 提供 Codex 插件可直接调用的能力接入层
- 完成插件最小闭环：
  - 检索记忆
  - 生成时间线记忆
  - 生成偏好记忆
  - 将命中的记忆注入当前请求上下文
- 确保 Relay Web 与 Codex 插件共用同一份存储与核心逻辑
- 为后续更多记忆类型预留扩展位

本次明确不做：

- 修改 Codex Desktop 本体 UI
- 修改 Codex CLI 自身内部 schema
- 侵入 Codex runtime 协议
- 云同步
- 多用户权限隔离
- 复杂 embedding / 向量召回
- 自动主题聚类算法升级
- 将 Relay 记忆页原样移植为 Codex 桌面插件页面

---

## 2. 当前现状判断

当前系统已经具备以下能力：

- 记忆数据模型和持久化已存在
- 记忆默认存储在 `~/.codex/sqlite/relay-memory.db`
- 时间线记忆已支持手动生成与 checkpoint 生成
- Relay Web 已支持：
  - `memories` 页面
  - 按日期 / 按主题浏览
  - 年份切换
  - `@memory` 引用
  - 工作区快捷动作触发记忆整理

当前系统仍存在以下结构性问题：

- `memory-store`、`timeline-memory-service` 仍位于 `local-bridge`
- 记忆能力入口仍主要通过 Relay bridge route 暴露
- Web 在一定程度上知道过多记忆业务细节
- Codex 侧还没有“插件式记忆工具”
- “生成 / 检索 / 注入”尚未统一成一套稳定接口

结论：

- 当前已经有“可工作的产品功能”
- 但还没有“可跨端复用的能力产品”

---

## 3. 版本目标定义

本版本统一采用三层结构：

- `memory core`
- `memory adapters`
- `memory consumers`

其中：

- `memory core`：独立的业务能力层
- `memory adapters`：不同宿主的接入层
- `memory consumers`：Relay Web、Codex 插件、未来移动端

### 3.1 核心交付标准

达到以下标准才算完成：

- Relay Web 的现有记忆页面与工作流仍可正常工作
- 核心记忆逻辑不再耦合在 Web 页面或 route 中
- Codex 插件可以：
  - 查询相关记忆
  - 为当前 thread 手动生成时间线记忆
  - 为当前 thread 手动生成偏好记忆
  - 将命中的记忆整理为上下文片段返回
- 两端读写的是同一份记忆存储
- 任意一端新增记忆后，另一端读取结果一致

---

## 4. 总体架构设计

### 4.1 分层结构

建议落地结构：

- `packages/memory-core`
- `services/local-bridge` 作为 Relay 本地接入层
- `plugins/codex-memory` 或等价目录作为 Codex 插件接入层

职责划分如下：

#### `packages/memory-core`

负责：

- 数据模型
- schema 初始化与迁移
- repository / store
- 主题键规范化
- 记忆查询
- 记忆生成编排
- 记忆注入编排
- prompt registry
- 记忆类型扩展

不负责：

- React UI
- HTTP 路由
- Codex 插件 manifest
- 页面文案展示

#### `services/local-bridge`

负责：

- 将 `memory core` 暴露给 Relay Web
- 处理 workspace / session 到 memory core 的参数映射
- 将 Codex app-server 能力作为 core 的一个 runtime adapter

不负责：

- 记忆业务规则定义
- prompt 内容硬编码
- 直接持有多套记忆实现

#### `plugins/codex-memory`

负责：

- 以插件工具的形式向 Codex 暴露记忆能力
- 把用户请求映射为：
  - 检索
  - 注入
  - 生成
- 尽量使用 `memory core` 的统一 API

不负责：

- 重新实现记忆存储
- 重新实现记忆提示词
- 复制一套 Relay Web 页面

### 4.2 核心设计原则

必须坚持：

- `Codex thread` 仍是对话真相源
- `memory` 是挂在 thread 之上的派生增强层
- `memory core` 不能依赖 Relay Web UI
- `memory core` 不能依赖 Codex Desktop 私有 UI 能力
- `memory core` 只能依赖稳定输入：
  - session 快照
  - workspace 信息
  - thread transcript
  - runtime text generation adapter

---

## 5. Codex 兼容原则

这一节是本版本最重要的约束。

### 5.1 不侵入 Codex 内部实现

不允许：

- 修改 Codex 自带 sqlite 表
- 依赖 Codex 私有表结构做 join 查询
- 修改 Codex Desktop 本体代码
- 依赖 Codex 未承诺稳定的内部缓存文件

允许：

- 使用 Codex app-server
- 使用 Codex 插件机制
- 将 Relay 自己的记忆库放在 Codex 目录下
- 通过插件把记忆能力接入 Codex 工作流

### 5.2 插件能力优先于 UI 侵入

本版本不追求：

- 在 Codex Desktop 中复刻完整 `memories` 页面

本版本追求：

- 让 Codex 能用上记忆能力

这意味着插件优先提供：

- `search_memories`
- `inject_memories`
- `generate_timeline_memory`
- `generate_preference_memory`

### 5.3 降级策略

若未来 Codex 升级导致：

- 插件接口变化
- app-server 某些字段变化
- 生成调用失败

系统应满足：

- Relay Web 仍能读取已存在记忆
- 插件可以失败但不影响正常对话
- 记忆生成失败不阻断主链路
- 注入失败时回退为空上下文而不是中断 run

---

## 6. 统一能力边界

本版本统一定义四类核心能力。

### 6.1 `MemoryRepository`

负责：

- 初始化 schema
- 写入记忆
- 按 session / 日期 / 主题 / 类型查询
- 幂等判断
- 后续迁移入口

建议接口：

- `createMemory`
- `updateMemory`
- `listMemories`
- `listBySessionId`
- `listByThemeKey`
- `listByDate`
- `getByCheckpoint`
- `getBySourceFingerprint`

### 6.2 `MemoryGenerationService`

负责：

- 基于 transcript 生成记忆
- 管理 checkpoint 逻辑
- 调用 prompt registry
- 调用 runtime generator adapter

建议支持两类生成：

- `timeline`
- `preference`

### 6.3 `MemoryRetrievalService`

负责：

- 读取候选记忆
- 基于 session / theme / recent / explicit mention 进行筛选
- 为 UI 或插件返回统一结果结构

建议输出：

- 原始记忆列表
- 注入摘要片段
- 关联来源信息

### 6.4 `MemoryInjectionService`

负责：

- 将命中的记忆整理成大模型可消费的上下文块
- 控制注入长度和优先级
- 统一 Relay Web 与 Codex 插件的注入格式

建议输出固定结构：

- `contextTitle`
- `contextBody`
- `sourceMemoryIds`
- `truncationApplied`

---

## 7. 记忆类型统一设计

本版本不再把时间线记忆和偏好记忆写成两套分裂系统。

统一定义：

- `memoryKind`

首批取值：

- `timeline`
- `preference`

### 7.1 时间线记忆

用途：

- 对某一段 session 演进进行可长期复用总结

适用入口：

- 20 轮自动触发
- sessions 页面手动生成
- Codex 插件手动生成

### 7.2 偏好记忆

用途：

- 记录用户对某个场景、对象、交互方式的偏好

适用入口：

- 工作区快捷动作
- Codex 插件手动整理偏好

### 7.3 Prompt Registry

所有 prompt 不再散落在页面或 route 中。

建议统一进入：

- `prompt registry`

要求：

- 每类记忆 prompt 有稳定 `promptVersion`
- 输入参数结构统一
- 后续可做版本切换

---

## 8. 插件接入方案

### 8.1 插件目标

插件不是页面容器，而是“记忆工具箱”。

首版插件工具建议如下：

- `search_memories`
- `inject_memories`
- `generate_timeline_memory`
- `generate_preference_memory`

### 8.2 插件输入输出建议

#### `search_memories`

输入：

- `query`
- `sessionId`
- `themeKey`
- `memoryKind`
- `limit`

输出：

- `items`
- 每项包含：
  - `id`
  - `title`
  - `themeTitle`
  - `memoryDate`
  - `memoryKind`
  - `excerpt`

#### `inject_memories`

输入：

- `sessionId`
- `query`
- `mentionedMemoryIds`
- `limit`

输出：

- `contextTitle`
- `contextBody`
- `sourceMemoryIds`

#### `generate_timeline_memory`

输入：

- `sessionId`
- `force`
- `manual`

输出：

- `item`
- `created`
- `reason`

#### `generate_preference_memory`

输入：

- `sessionId`
- `force`

输出：

- `item`
- `created`
- `reason`

### 8.3 插件实现原则

插件层必须尽量薄。

要求：

- 只做参数解析和结果封装
- 不重新实现业务逻辑
- 所有核心逻辑都调用 `memory core`

---

## 9. Relay Web 接入方案

Relay Web 将继续保留完整体验层。

但接入方式必须调整为：

- 页面只调用 bridge API
- bridge API 只调用 memory application service
- memory application service 再调用 `memory core`

这意味着需要逐步清理以下耦合：

- 页面直接知道过多记忆组织规则
- route 层直接拼装业务决策
- timeline / preference 逻辑分散在多个页面

本版本要求：

- `memories` 页面继续可用
- `sessions` 页面右侧整理台继续可用
- workspace `@memory` 引用继续可用
- 新的注入逻辑统一走 `MemoryInjectionService`

---

## 10. TDD 分阶段执行

### 阶段 1：抽离 `memory core` 骨架

目标：

- 把数据模型、存储、prompt registry、generation service 从 `local-bridge` 抽到 `packages/memory-core`

先写测试：

- repository 初始化测试
- schema 迁移测试
- `themeKey` 规范化测试
- `memoryKind` 持久化测试
- prompt registry 版本测试

再写实现：

- 新建 `packages/memory-core`
- 迁移 `memory-store`
- 迁移 prompt builder
- 迁移通用类型和 application service

完成标准：

- bridge 仍可通过新 core 正常读写记忆

### 阶段 2：统一生成服务

目标：

- 把时间线记忆和偏好记忆统一进生成服务

先写测试：

- `generate timeline memory`
- `generate preference memory`
- checkpoint 幂等测试
- `force regenerate` 测试
- 失败降级测试

再写实现：

- 抽象 `runtime text generator adapter`
- 实现 timeline / preference 的 generation pipeline

完成标准：

- Relay Web 所有手动生成入口仍可工作

### 阶段 3：统一检索与注入服务

目标：

- 为 Web 和 Codex 提供统一 retrieval / injection API

先写测试：

- 按 session 检索
- 按主题检索
- 按记忆类型检索
- `@memory` 显式命中优先
- 注入内容裁剪测试
- 空结果降级测试

再写实现：

- `MemoryRetrievalService`
- `MemoryInjectionService`
- 注入格式统一

完成标准：

- Relay Web 的 `@memory` 引用接入新服务

### 阶段 4：Relay bridge 适配

目标：

- bridge 退化为 adapter，不再持有记忆核心业务

先写测试：

- route 到 application service 的适配测试
- 兼容旧接口的回归测试
- Web 侧基础交互测试

再写实现：

- route 改为调用 `memory core` service
- 清理 bridge 中重复逻辑

完成标准：

- Web 端无感迁移

### 阶段 5：Codex 插件最小闭环

目标：

- 提供可在 Codex 中直接调用的记忆插件

先写测试：

- 插件 manifest / 工具注册测试
- `search_memories` 工具测试
- `inject_memories` 工具测试
- `generate_timeline_memory` 工具测试
- `generate_preference_memory` 工具测试

再写实现：

- 新建插件目录
- 接入 `memory core`
- 输出结构化结果

完成标准：

- 在 Codex 中可通过插件调用记忆能力

### 阶段 6：双端共用回归验证

目标：

- 验证 Relay Web 与 Codex 插件共用同一套核心能力和存储

先写测试：

- Web 生成后插件可读
- 插件生成后 Web 可读
- 主题聚合一致
- 年份 / 日期视图数据一致
- 偏好记忆可在两端都被检索与注入

再写实现：

- 修正剩余兼容问题
- 补齐缺口字段和适配器

完成标准：

- 形成真正的“双端共用”

---

## 11. 建议目录调整

建议目标目录如下：

- `packages/shared-types`
- `packages/memory-core`
- `services/local-bridge`
- `apps/web`
- `plugins/codex-memory`

建议 `memory-core` 内部结构：

- `src/types`
- `src/repository`
- `src/prompts`
- `src/services`
- `src/adapters`
- `src/index.ts`

建议插件结构：

- `plugins/codex-memory/.codex-plugin/plugin.json`
- `plugins/codex-memory/src/index.ts`
- `plugins/codex-memory/src/tools`

---

## 12. 测试策略

本版本测试覆盖必须尽量覆盖新增功能，重点不看表面 UI，而看能力闭环。

至少覆盖：

- `memory core` 单元测试
- sqlite repository 集成测试
- bridge route 集成测试
- Web 页面回归测试
- Codex 插件工具测试
- 双端读写一致性测试

重点回归风险：

- 自动记忆触发时机变化
- 手动 regenerate 幂等性
- 偏好记忆与时间线记忆 schema 兼容
- `@memory` 注入结果漂移
- Codex 升级后 runtime adapter 失效

目标：

- 新增模块测试覆盖率不低于 `85%`

---

## 13. 风险与应对

### 风险 1：过早插件化，导致 core 还没稳就暴露出去

应对：

- 必须先完成 `memory core`，再做插件

### 风险 2：Web 现有功能被抽离过程破坏

应对：

- 所有桥接接口保持兼容
- 阶段 4 前不改页面协议

### 风险 3：插件能力做得过重，重复一套 Web 逻辑

应对：

- 插件只做工具，不做复杂 UI

### 风险 4：记忆类型增多后 schema 混乱

应对：

- 从本版本开始统一 `memoryKind`
- prompt、生成、检索全部基于类型分发

### 风险 5：Codex 升级破坏接入

应对：

- 只依赖稳定 app-server / plugin 边界
- 通过 adapter 隔离 runtime 差异

---

## 14. 里程碑定义

### M1：Core 独立

达到标准：

- `memory core` 已抽离
- Relay Web 继续可用

### M2：能力统一

达到标准：

- 生成 / 检索 / 注入已统一
- timeline / preference 进入同一能力框架

### M3：插件可用

达到标准：

- Codex 可通过插件调用记忆能力

### M4：双端共用闭环

达到标准：

- Relay Web 与 Codex 插件共用同一存储和同一核心逻辑

---

## 15. 本计划的最终判断

本版本的正确方向不是：

- 继续把记忆功能仅仅做成 Relay Web 的专属页面能力
- 也不是直接侵入 Codex Desktop 本体

本版本的正确方向是：

- 把记忆先做成 Relay 自己的独立能力层
- 再通过插件把能力接入 Codex
- 最终形成：
  - Relay 擅长体验层
  - Codex 擅长对话工作流接入
  - 两端共用同一套记忆底座

这是当前代码现状下风险最低、扩展性最高、也最符合长期演进方向的方案。
