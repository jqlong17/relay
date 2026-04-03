# Relay

Relay 是一个浏览器中的工作台，用来驱动本地运行的 Codex runtime。

它把本地工作区继续作为执行边界，同时通过 Web 界面暴露 session、文件和运行状态，让你可以在不同设备之间连续地接力工作。

## Relay 是什么

Relay 不是托管式 agent runtime，也不只是一个浏览器终端。

它是覆盖在以下几层之上的一个轻量 Web 层：

- 能访问当前活动工作区的本地 bridge 服务
- 负责 thread 和 turn 的 Codex app server
- 用于切换工作区、延续 session、查看文件和接收流式输出的浏览器 UI

当前产品结构刻意保持简单：

- `workspace`：打开本地目录、浏览文件、查看预览、继续当前 thread
- `sessions`：查看、重命名、归档并恢复由 Codex 支持的 session
- `memories`：面向长期记忆工作流的产品界面
- `readme`：承载明确的项目上下文和 onboarding 信息

## 当前范围

这个仓库已经支持核心的本地工作闭环：

- 从 Web UI 打开本地工作区
- 列出工作区，并记住每个工作区偏好的 session
- 列出当前工作区对应的 Codex threads
- 在第一次 runtime turn 之前创建草稿 session
- 重命名和归档 session
- 将 Codex 的运行输出流式推送到 Web 客户端
- 查看当前工作区文件树并预览文件内容
- 通过独立的移动端路由进行轻量续接

其中部分页面已经具备产品形态，但还没有完全接上后端。尤其是 `memories` 页面，目前更接近目标 UX 和信息架构的表达，而不是完整功能。

## 架构

Relay 是一个小型 monorepo，主要分为三层：

### 1. Web App

[`apps/web`](/Users/ruska/project/web-cli/apps/web) 是一个 Next.js 应用，负责渲染桌面端和移动端工作台 UI。

主要职责：

- 顶层导航和页面骨架
- workspace、sessions 和 mobile 客户端界面
- 在服务端和客户端组件中调用本地 bridge
- 渲染文件预览和 runtime 消息流

### 2. Local Bridge

[`services/local-bridge`](/Users/ruska/project/web-cli/services/local-bridge) 是一个 Node HTTP 服务，负责把 Web UI 的操作翻译成本地动作。

主要职责：

- 工作区打开、列出和移除流程
- 当前活动工作区状态管理
- 在活动工作区边界内提供文件树和文件内容访问
- session 创建、重命名、归档和选择
- 启动并流式转发 Codex turns

关键路由：

- `GET /health`
- `GET /workspaces`
- `POST /workspaces/open`
- `POST /workspaces/open-picker`
- `GET /sessions`
- `GET /sessions/:id`
- `POST /sessions`
- `POST /sessions/:id/select`
- `POST /sessions/:id/rename`
- `POST /sessions/:id/archive`
- `GET /files/tree`
- `GET /files/content?path=...`
- `POST /runtime/run?stream=1`

### 3. Shared Types

[`packages/shared-types`](/Users/ruska/project/web-cli/packages/shared-types) 保存 Web 应用和 bridge 共享的数据契约。

## Runtime 集成方式

Relay 自己并不实现 agent engine。

bridge 会启动并连接 `codex app-server --listen stdio://`，再把 Codex 的 thread/turn 通知映射成浏览器可消费的 Relay runtime events。

这意味着 Relay 当前默认假设：

- `codex` 已安装并且可通过 `PATH` 访问
- 本地机器就是实际执行环境
- 浏览器 UI 是控制与检查界面，而不是工作区事实来源

## 开发

### 前置条件

- Node.js 20+
- `pnpm`
- `pm2`
- `codex` 可通过 `PATH` 访问

安装依赖：

```bash
pnpm install
```

启动两个服务：

```bash
pnpm dev:up
```

这会运行 [`dev-up.sh`](/Users/ruska/project/web-cli/dev-up.sh)，并启动：

- `relay-bridge`：`http://127.0.0.1:4242`
- `relay-web`：`http://127.0.0.1:3000`

停止两个服务：

```bash
pnpm dev:down
```

常用 `pm2` 命令：

```bash
pm2 ls
pm2 logs relay-web
pm2 logs relay-bridge
pm2 restart relay-web relay-bridge
pm2 stop relay-web relay-bridge
```

进程定义位于 [`ecosystem.config.cjs`](/Users/ruska/project/web-cli/ecosystem.config.cjs)。

## 仓库结构

```text
.
├── apps/
│   └── web/
├── packages/
│   └── shared-types/
├── services/
│   └── local-bridge/
├── dev-up.sh
├── dev-down.sh
└── ecosystem.config.cjs
```

## 产品方向

Relay 的目标不是做一个终端壳，而是一个冷静、可检查、可续接的 agent 工作台。

当前产品方向是：

- 让本地工作区继续作为执行事实来源
- 让 session 可以从任何地方恢复并继续阅读
- 把文件和变更暴露为一等上下文
- 同时支持桌面端和移动端续接
- 为长期记忆和项目上下文层预留空间

## 文档规则

这个文件是仓库级中文 README，和根目录 [`README.md`](/Users/ruska/project/web-cli/README.md) 一起构成 README 内容来源。

如果其他界面需要展示 README，应直接引用或渲染仓库根目录下的文档，而不是再维护一份页面内拷贝。
