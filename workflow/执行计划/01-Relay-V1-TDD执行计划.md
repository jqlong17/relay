# 01 Relay V1 TDD执行计划

## 0. 目标与范围

本计划用于交付 Relay 的 V1 最小可演示版本（MVP）：

- 左侧：Session 列表
- 中间：对话 + 执行时间线（流式）
- 右侧：文件树 / 文件预览 / Diff 切换
- 底层：本地 bridge 对接 `codex app-server`

开发方法：`TDD`（先测试，后实现，持续重构）。

## 1. 技术栈（本计划默认）

- 前端：`Next.js 15 + React + TypeScript`
- 本地 bridge：`Node.js + Fastify + ws`
- 测试：
  - 单元测试：`Vitest`
  - 组件测试：`React Testing Library`
  - E2E：`Playwright`
- 代码质量：`ESLint + Prettier`

说明：本计划先做单仓结构，后续可拆为 monorepo。

## 1.1 视觉与字体规范（基于参考图，强化现代感）

目标风格：`终端感信息密度 + 现代产品质感`，不是复古终端模拟器。

字体建议（明确可执行）：

- 主字体（UI 与中文）：`IBM Plex Sans` + `Noto Sans SC`
- 等宽字体（代码、日志、命令、时间线元信息）：`IBM Plex Mono`
- 备选：
  - 英文可选 `JetBrains Mono`
  - 若需更强技术感可选 `Space Mono`（仅用于标题或强调）

排版规则：

- 正文字号：`14px`（移动端 `13px`）
- 行高：`1.55`（正文）/ `1.4`（等宽块）
- 字重：`400/500/600`
- 字距：默认不压缩，等宽块可 `0.01em`

色彩与层级（CSS Variables）：

- 背景主色：`#050607`
- 一级面板：`#0b0d10`
- 二级面板：`#11141a`
- 分割线：`#1b1f27`
- 主文本：`#e6eaf2`
- 次文本：`#9aa3b2`
- 强调色（交互高亮）：`#3aa0ff`
- 成功：`#22c55e`
- 警告：`#f59e0b`
- 错误：`#ef4444`

组件风格规则：

- 顶部导航：低对比描边 + 轻微磨砂感，不做高饱和背景块。
- 侧边栏：高信息密度，hover 和 active 用亮度差区分，不用夸张阴影。
- 时间线块：卡片弱化，优先用左侧状态条与标签区分（`READ/WRITE/RUN/DIFF`）。
- 右侧文件树：使用等宽字体显示路径，行高略紧凑，增强“工作台”感。

动效规则（丝滑但克制）：

- 页面初次进入：`180ms` 渐入 + `8px` 上移回弹（ease-out）
- 流式文本：仅增量区域更新，禁止整块重渲染闪烁
- 交互反馈：hover/active 动效 `120ms-160ms`

无障碍与可读性：

- 正文对比度不低于 `4.5:1`
- 状态颜色不单靠颜色区分，配合文本标签
- 键盘可完整操作 session 列表、时间线聚焦、右侧 tab 切换

## 2. 目录与文件规划（目标结构）

```text
/Users/ruska/project/web-cli/
  apps/
    web/
      src/
        app/
          layout.tsx
          page.tsx
        components/
          session-list.tsx
          conversation-timeline.tsx
          right-panel.tsx
          composer.tsx
          app-shell.tsx
        lib/
          api-client.ts
          event-stream.ts
        types/
          session.ts
          timeline.ts
          file-tree.ts
      tests/
        unit/
          app-shell.test.tsx
          session-list.test.tsx
          conversation-timeline.test.tsx
          right-panel.test.tsx
          api-client.test.ts
        e2e/
          relay-smoke.spec.ts
          relay-streaming.spec.ts
  services/
    bridge/
      src/
        index.ts
        routes/
          health.ts
          sessions.ts
          files.ts
          diff.ts
        codex/
          app-server-client.ts
          rpc-types.ts
        store/
          session-store.ts
        domain/
          timeline-mapper.ts
      tests/
        unit/
          session-store.test.ts
          timeline-mapper.test.ts
          app-server-client.test.ts
        integration/
          routes-sessions.test.ts
          routes-files.test.ts
  package.json
  pnpm-workspace.yaml
```

## 3. TDD 执行阶段

## 阶段 01：脚手架与测试基线

目标：仓库可安装、可测试、可启动。

先写测试：
- `apps/web/tests/unit/app-shell.test.tsx`：页面基础渲染占位结构（左中右三栏）。
- `services/bridge/tests/unit/session-store.test.ts`：会话 store 基础 CRUD。

再实现：
- `package.json`
- `pnpm-workspace.yaml`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/app-shell.tsx`
- `services/bridge/src/store/session-store.ts`

执行命令：
- `pnpm install`
- `pnpm test`

验收标准：
- 单测全部通过。
- `pnpm test` 和 `pnpm -r test` 在本地可跑通。

## 阶段 02：Session 列表（左侧）

目标：可创建、列出、切换 session。

先写测试：
- `apps/web/tests/unit/session-list.test.tsx`
  - 渲染 session 列表
  - 点击切换 active session
  - 新建 session 回调触发
- `services/bridge/tests/integration/routes-sessions.test.ts`
  - `GET /sessions`
  - `POST /sessions`

再实现：
- `services/bridge/src/routes/sessions.ts`
- `services/bridge/src/index.ts`
- `apps/web/src/components/session-list.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/types/session.ts`

执行命令：
- `pnpm --filter bridge test`
- `pnpm --filter web test`

验收标准：
- 左侧 session 列表可加载和切换。
- 新建 session 后列表即时更新。

## 阶段 03：对话与执行时间线（中间）

目标：中间区能展示用户消息、Agent 消息、工具执行事件，并支持流式更新。

先写测试：
- `apps/web/tests/unit/conversation-timeline.test.tsx`
  - 渲染 message/event 混排
  - 按事件时间排序
  - 流式 token 增量更新
- `services/bridge/tests/unit/timeline-mapper.test.ts`
  - 将 app-server 事件映射为前端统一 timeline item

再实现：
- `services/bridge/src/domain/timeline-mapper.ts`
- `services/bridge/src/codex/rpc-types.ts`
- `services/bridge/src/codex/app-server-client.ts`
- `apps/web/src/components/conversation-timeline.tsx`
- `apps/web/src/lib/event-stream.ts`
- `apps/web/src/types/timeline.ts`

执行命令：
- `pnpm -r test`

验收标准：
- 中间区出现可读执行块（read/write/run/status）。
- 流式输出可见，无整页闪烁。

## 阶段 04：文件树、文件预览、Diff（右侧）

目标：右侧默认显示文件树，可切到 Diff。

先写测试：
- `apps/web/tests/unit/right-panel.test.tsx`
  - 默认 tab 为 Files
  - 切换到 Diff 成功
  - 点击文件展示内容
- `services/bridge/tests/integration/routes-files.test.ts`
  - `GET /files/tree`
  - `GET /files/content`
  - `GET /diff`

再实现：
- `services/bridge/src/routes/files.ts`
- `services/bridge/src/routes/diff.ts`
- `apps/web/src/components/right-panel.tsx`
- `apps/web/src/types/file-tree.ts`

执行命令：
- `pnpm -r test`

验收标准：
- Files / Diff 可切换。
- 点击文件后内容可预览。
- 当前会话变更可在 Diff tab 看见。

## 阶段 05：输入框与发起任务

目标：自然语言输入、回车发送、命令模式占位（`/`）可用。

先写测试：
- `apps/web/tests/unit/composer.test.tsx`
  - Enter 发送
  - Shift+Enter 换行
  - 输入 `/` 识别命令模式状态

再实现：
- `apps/web/src/components/composer.tsx`
- `apps/web/src/components/app-shell.tsx`（整合各区数据流）

执行命令：
- `pnpm --filter web test`

验收标准：
- 用户可从输入框发起一次任务，时间线立即出现用户输入和执行状态。

## 阶段 06：端到端验收（E2E）

目标：验证最小闭环可用。

先写测试：
- `apps/web/tests/e2e/relay-smoke.spec.ts`
  - 打开页面
  - 创建 session
  - 发送一条任务
  - 右侧切换 Files / Diff
- `apps/web/tests/e2e/relay-streaming.spec.ts`
  - 触发流式响应
  - 验证 token 持续追加

再实现：
- 修复所有测试失败点（不新增业务范围）。

执行命令：
- `pnpm --filter web test:e2e`

验收标准：
- 两个 E2E 用例通过。
- 可演示完整链路：`创建会话 -> 发任务 -> 看执行流 -> 看文件 -> 看diff`。

## 4. 每日执行节奏（建议）

1. 先写失败测试（红）。
2. 仅写最小实现让测试通过（绿）。
3. 立即重构并保持测试通过（重构）。
4. 每完成一个阶段，更新 `workflow/session` 记录真实进度和偏差。

## 5. 风险与预案

- 风险：`codex app-server` 事件协议复杂，映射不稳定。
  - 预案：先在 `timeline-mapper` 做中间层，隔离前端类型。
- 风险：流式渲染引发性能抖动。
  - 预案：仅增量更新当前 item，避免全列表重渲染。
- 风险：本地 bridge 与前端并发状态不一致。
  - 预案：所有事件携带 `sessionId + turnId + ts` 做幂等处理。

## 6. Definition of Done（V1）

- 三栏 UI 可用（左会话 / 中执行流 / 右文件与diff）。
- 支持自然语言发起任务。
- 能显示流式执行过程。
- 能查看文件树、文件内容、当前会话 diff。
- 单测、集成测试、E2E 全部通过。
