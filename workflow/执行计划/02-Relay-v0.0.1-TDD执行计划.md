# 02 Relay v0.0.1 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.0.1`。

`v0.0.1` 的目标不是完整产品，而是跑通最小本地链路：

- Web 前端
- 本地 relay bridge
- `codex cli`
- session 本地持久化

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 测试通过后再重构
- 每个阶段必须有明确验收标准

---

## 1. 版本范围

`v0.0.1` 本次只做这些能力：

- 打开本地 workspace
- 新建 / 切换 / 保存 session
- 发送任务给本地 `codex cli`
- 前端流式显示返回
- 右侧展示最小文件树
- settings 中基础配置可编辑生效

本次明确不做：

- memory 真正生成
- 自动整理规则
- 账号
- 云同步
- 手机端
- 远程访问
- diff
- 复杂文件编辑

---

## 2. 建议技术结构

建议目录结构：

```text
/Users/ruska/project/web-cli/
  apps/
    web/
      src/
        app/
          layout.tsx
          page.tsx
          sessions/page.tsx
          readme/page.tsx
        components/
          top-nav.tsx
          workspace-shell.tsx
          workspace-session-list.tsx
          workspace-timeline.tsx
          workspace-composer.tsx
          workspace-file-tree.tsx
        lib/
          api/
            workspaces.ts
            sessions.ts
            runtime.ts
          stream/
            runtime-stream.ts
        types/
          workspace.ts
          session.ts
          message.ts
          runtime-event.ts
          file-tree.ts
      tests/
        unit/
          workspace-shell.test.tsx
          workspace-session-list.test.tsx
          workspace-timeline.test.tsx
          workspace-composer.test.tsx
          workspace-file-tree.test.tsx
          runtime-stream.test.ts
    local-bridge/
      src/
        index.ts
        routes/
          health.ts
          workspaces.ts
          sessions.ts
          runtime.ts
        services/
          codex-cli.ts
          file-tree.ts
          session-store.ts
        types/
          workspace.ts
          session.ts
          runtime-event.ts
      tests/
        unit/
          session-store.test.ts
          file-tree.test.ts
          codex-cli.test.ts
        integration/
          health-route.test.ts
          workspaces-route.test.ts
          sessions-route.test.ts
          runtime-route.test.ts
  packages/
    shared-types/
      src/
        workspace.ts
        session.ts
        message.ts
        runtime-event.ts
        file-tree.ts
```

说明：

- 当前仓库还没有完全按这个结构实现
- 本计划把目标结构写清楚，后续开发可逐步落地
- `packages/shared-types` 的意义是尽早统一 Web 和本地 bridge 的 contract

---

## 3. TDD 总原则

每个阶段都按以下顺序执行：

1. 先写失败测试
2. 运行测试，确认失败
3. 写最小实现让测试通过
4. 运行测试，确认通过
5. 重构命名、结构、边界
6. 再次运行测试

执行时禁止：

- 先写大段实现再补测试
- 把多个阶段混在一起开发
- 在没有类型定义前直接硬写页面逻辑

---

## 4. 阶段拆分

## 阶段 01：共享类型与测试基线

### 目标

建立 `v0.0.1` 的最小共享数据模型，并让测试环境先可运行。

### 先写测试

- `apps/web/tests/unit/runtime-stream.test.ts`
  - 能识别 `run.started`
  - 能识别 `message.delta`
  - 能识别 `message.completed`
  - 能识别 `run.completed`
- `apps/local-bridge/tests/unit/session-store.test.ts`
  - 可以创建 session
  - 可以追加消息
  - 可以读取 session 列表
- `apps/local-bridge/tests/unit/file-tree.test.ts`
  - 给定目录可生成最小文件树结构

### 再实现

- `packages/shared-types/src/workspace.ts`
- `packages/shared-types/src/session.ts`
- `packages/shared-types/src/message.ts`
- `packages/shared-types/src/runtime-event.ts`
- `packages/shared-types/src/file-tree.ts`
- `apps/local-bridge/src/services/session-store.ts`
- `apps/local-bridge/src/services/file-tree.ts`
- 测试运行配置

### 建议命令

```bash
pnpm test
```

### 验收标准

- 共享类型已存在
- 单元测试可跑通
- session-store 与 file-tree 有最小可用实现

---

## 阶段 02：本地 bridge 服务启动与健康检查

### 目标

让本地 relay bridge 能启动，并提供最小 API。

### 先写测试

- `apps/local-bridge/tests/integration/health-route.test.ts`
  - `GET /health` 返回 `200`
  - 返回版本号或服务状态

### 再实现

- `apps/local-bridge/src/index.ts`
- `apps/local-bridge/src/routes/health.ts`

### 建议命令

```bash
pnpm --filter local-bridge test
```

### 验收标准

- bridge 能启动
- `GET /health` 正常返回

---

## 阶段 03：workspace 读取与文件夹打开

### 目标

支持读取并返回本地 workspace 基本信息。

### 先写测试

- `apps/local-bridge/tests/integration/workspaces-route.test.ts`
  - `GET /workspaces` 返回 workspace 列表
  - `POST /workspaces/open` 可以打开一个本地路径
  - 打开的 workspace 会成为当前 active workspace
- `apps/web/tests/unit/workspace-shell.test.tsx`
  - 页面能显示当前 workspace 名称
  - active workspace 会展示在工作台顶部

### 再实现

- `apps/local-bridge/src/routes/workspaces.ts`
- `apps/local-bridge/src/types/workspace.ts` 或共享类型引用
- `apps/web/src/lib/api/workspaces.ts`
- `apps/web/src/components/workspace-shell.tsx`

### 建议命令

```bash
pnpm --filter local-bridge test
pnpm --filter web test
```

### 验收标准

- Web 能拿到当前 workspace
- 用户可以打开一个本地文件夹作为 workspace

---

## 阶段 04：session 列表与本地持久化

### 目标

支持新建、切换、保存 session。

### 先写测试

- `apps/local-bridge/tests/integration/sessions-route.test.ts`
  - `GET /sessions` 返回当前 workspace 下的 session 列表
  - `POST /sessions` 创建新 session
  - `GET /sessions/:id` 返回 session 详情
- `apps/web/tests/unit/workspace-session-list.test.tsx`
  - 渲染 session 列表
  - 点击后切换 active session
  - 新建 session 后列表更新

### 再实现

- `apps/local-bridge/src/routes/sessions.ts`
- `apps/local-bridge/src/services/session-store.ts`
- `apps/web/src/lib/api/sessions.ts`
- `apps/web/src/components/workspace-session-list.tsx`

### 建议命令

```bash
pnpm --filter local-bridge test
pnpm --filter web test
```

### 验收标准

- 可以新建 session
- 可以切换 session
- session 能被本地保存并重新读取

---

## 阶段 05：调用 codex cli 的最小运行时

### 目标

本地 bridge 能真正调用 `codex cli`，并把输出映射为统一运行时事件。

### 先写测试

- `apps/local-bridge/tests/unit/codex-cli.test.ts`
  - 能启动一次任务调用
  - 能把输出解析为 `run.started`
  - 能产生 `message.delta`
  - 能最终产生 `run.completed`
- `apps/local-bridge/tests/integration/runtime-route.test.ts`
  - `POST /runtime/run` 可以发起一次任务
  - 返回可订阅或可读取的运行标识

### 再实现

- `apps/local-bridge/src/services/codex-cli.ts`
- `apps/local-bridge/src/routes/runtime.ts`

### 建议命令

```bash
pnpm --filter local-bridge test
```

### 验收标准

- bridge 能真实调用本地 `codex cli`
- 至少能生成最小 runtime event 流

---

## 阶段 06：Web 端流式消息展示

### 目标

中间主区域能够流式展示运行过程。

### 先写测试

- `apps/web/tests/unit/workspace-timeline.test.tsx`
  - 能渲染用户消息
  - 能渲染 assistant 增量消息
  - 能根据 `message.delta` 增量更新正文
  - 不会因增量更新而重复渲染整段历史
- `apps/web/tests/unit/runtime-stream.test.ts`
  - 能正确按顺序消费事件
  - 能正确结束流

### 再实现

- `apps/web/src/lib/stream/runtime-stream.ts`
- `apps/web/src/components/workspace-timeline.tsx`

### 建议命令

```bash
pnpm --filter web test
```

### 验收标准

- 前端能看到流式返回
- 中间区具备“任务正在运行”的明确感知

---

## 阶段 07：输入框与完整最短链路

### 目标

从输入框发消息，打通到 bridge，再返回到前端。

### 先写测试

- `apps/web/tests/unit/workspace-composer.test.tsx`
  - Enter 发送消息
  - 空输入不发送
  - 发送后触发 runtime 调用
- E2E 场景测试
  - `apps/web/tests/e2e/local-run-smoke.spec.ts`
  - 用户打开 workspace
  - 用户新建 session
  - 用户输入一条任务
  - 页面收到流式返回
  - 刷新后 session 仍存在

### 再实现

- `apps/web/src/components/workspace-composer.tsx`
- `apps/web/src/lib/api/runtime.ts`
- `apps/web/src/app/page.tsx`

### 建议命令

```bash
pnpm --filter web test
pnpm --filter web exec playwright test
```

### 验收标准

- 最短链路完整跑通
- 可以被本地重复演示

---

## 阶段 08：最小文件树与 settings 基础可用

### 目标

补齐 `v0.0.1` 的最小辅助能力。

### 先写测试

- `apps/web/tests/unit/workspace-file-tree.test.tsx`
  - 能渲染最小文件树
  - 当前文件树数据能正确显示层级
- `apps/web/tests/unit/settings-config.test.tsx`
  - settings 中可加载配置文本
  - 修改并保存后状态更新

### 再实现

- `apps/web/src/components/workspace-file-tree.tsx`
- settings 相关最小整合
- `relay.ui.toml` 继续作为配置入口

### 建议命令

```bash
pnpm --filter web test
```

### 验收标准

- 右侧能显示最小文件树
- settings 可以完成基础配置读写

---

## 5. 测试清单汇总

### 本地 bridge 测试

- `session-store.test.ts`
- `file-tree.test.ts`
- `codex-cli.test.ts`
- `health-route.test.ts`
- `workspaces-route.test.ts`
- `sessions-route.test.ts`
- `runtime-route.test.ts`

### Web 测试

- `workspace-shell.test.tsx`
- `workspace-session-list.test.tsx`
- `workspace-timeline.test.tsx`
- `workspace-composer.test.tsx`
- `workspace-file-tree.test.tsx`
- `runtime-stream.test.ts`
- `settings-config.test.tsx`

### E2E 测试

- `local-run-smoke.spec.ts`

---

## 6. v0.0.1 最终验收标准

当以下条件同时满足时，可以认为 `v0.0.1` 可交付：

- 用户可以打开本地 workspace
- 用户可以新建并切换 session
- 用户可以发起一次任务
- 本地 bridge 可以调用 `codex cli`
- Web 前端可以流式展示返回
- session 可本地持久化并重新打开
- settings 基础可用

---

## 7. 当前阶段注意事项

- 当前阶段不要提前做 memory 系统
- 不要提前做远程访问
- 不要提前做账号与云同步
- 不要过早优化到 `v0.2.0` 的多端结构

`v0.0.1` 最重要的是证明：

- Relay 的最短本地闭环成立

只要这个闭环没有稳定跑通，后面的高版本设计都不应开始实现。
