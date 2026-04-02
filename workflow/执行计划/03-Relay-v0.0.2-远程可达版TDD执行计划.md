# 03 Relay v0.0.2 远程可达版 TDD执行计划

## 0. 计划目标

本计划用于交付 Relay `v0.0.2`。

`v0.0.2` 的范围非常明确：

- 使用 `Cloudflare Tunnel`
- 让不同网络下的手机可以访问本地电脑上的 Relay
- 在进入工作区前增加强密码认证
- 继续复用当前本地 `web + local-bridge + Codex app-server` 链路

开发方法固定为：

- `TDD`

原则：

- 先写测试
- 再写最小实现
- 每个阶段只解决一个闭环问题
- 不在本阶段引入账号、云数据库、多设备系统

---

## 1. 范围定义

本次必须做：

- 登录页
- 服务端密码校验
- `httpOnly` 认证 cookie
- 未登录拦截页面访问
- 未登录拦截 `/api/bridge/*`
- Cloudflare Tunnel 配置文档
- 手机端基础可用性验证

本次明确不做：

- 用户系统
- 多用户
- 云同步
- 设备中心
- memory 云同步
- 企业级权限体系

---

## 2. 建议技术结构

建议在当前仓库中增加以下内容：

```text
/Users/ruska/project/web-cli/
  apps/
    web/
      src/
        app/
          login/page.tsx
          api/
            auth/
              login/route.ts
              logout/route.ts
              session/route.ts
        components/
          login-form.tsx
        lib/
          auth/
            session.ts
            password.ts
        middleware.ts
      tests/
        unit/
          login-form.test.tsx
        integration/
          auth-routes.test.ts
          auth-guard.test.ts
  workflow/
    设计/
      04-v0.0.2-远程可达版产品目标.md
    执行计划/
      03-Relay-v0.0.2-远程可达版TDD执行计划.md
  .env.example
  README.md
```

说明：

- 密码认证逻辑放在 `apps/web` 内完成即可
- 不需要修改 `local-bridge` 的业务协议
- 对 `local-bridge` 的保护通过 `web` 的 API proxy 与 middleware 完成

### 2.1 移动 H5 代码路径

移动端不是单独再建一个 App，也不是单独再建一套 `mobile-web` 工程。

当前建议架构是：

- 仍然使用同一个 `Next.js` Web 工程
- 通过路由级页面复用 + 组件拆分 + 响应式布局，交付移动 H5

具体代码路径建议如下：

```text
/Users/ruska/project/web-cli/apps/web/src/
  app/
    page.tsx                       # 桌面主入口，后续也可做设备判断后重定向
    mobile/
      page.tsx                    # 移动 H5 主入口
    login/
      page.tsx                    # 登录页，桌面/移动共用
    api/
      auth/
        login/route.ts
        logout/route.ts
        session/route.ts
      bridge/
        ...                       # 继续复用现有 bridge 代理
  components/
    workspace-client.tsx          # 当前桌面工作台，继续服务桌面
    mobile/
      mobile-shell.tsx            # 移动 H5 整体骨架
      mobile-header.tsx           # 顶部状态栏
      mobile-session-drawer.tsx   # session 抽屉
      mobile-workspace-drawer.tsx # workspace 抽屉
      mobile-thread.tsx           # 中间消息流
      mobile-composer.tsx         # 底部固定输入区
  lib/
    auth/
      session.ts
      password.ts
    api/
      bridge.ts                   # 桌面/移动共用 API client
```

### 2.2 移动 H5 架构原则

为避免架构混乱，本阶段采用以下原则：

1. 页面层分开
   - 桌面继续使用当前 `/`
   - 移动 H5 先单独使用 `/mobile`
   - 这样能避免在一个组件里同时塞过多桌面/移动分支

2. 数据层共用
   - `bridge` API 调用逻辑继续共用
   - `auth` 逻辑继续共用
   - `session` / `runtime` 数据结构继续共用

3. 视图层分开
   - 桌面保留当前三栏工作台思路
   - 移动单独做“远程对话工作台”
   - 这样不会把 `workspace-client.tsx` 改成一个巨大的条件分支组件

4. 认证入口共用
   - 登录页仍然只有一套
   - 登录成功后根据入口决定跳到 `/` 或 `/mobile`

### 2.3 为什么不建议一开始只做响应式硬改

虽然技术上可以在当前 `workspace-client.tsx` 里直接写很多 media query 和条件渲染，但不建议这样开始，原因很直接：

- 当前桌面工作台已经有较多交互状态
- 移动端的信息结构与桌面不同，不只是宽度变窄
- 如果在一个组件里同时塞：
  - 三栏桌面
  - 抽屉式手机
  - 登录保护
  - 远程状态
  后续会很快失控

因此本阶段最清晰的架构是：

- 同一个 Next.js Web 工程
- 同一套后端 API
- 两套页面骨架
- 共用一套数据和认证层

---

## 3. 配置约定

本版本建议新增以下环境变量：

```bash
RELAY_ACCESS_PASSWORD=replace-with-a-strong-password
RELAY_SESSION_SECRET=replace-with-a-random-secret
RELAY_PUBLIC_BASE_URL=https://relay.example.com
```

用途：

- `RELAY_ACCESS_PASSWORD`
  - 访问 Relay 的强密码
- `RELAY_SESSION_SECRET`
  - 用于签名认证 cookie
- `RELAY_PUBLIC_BASE_URL`
  - 用于文档与远程访问提示

当前版本中：

- 如果 `RELAY_ACCESS_PASSWORD` 未配置，则远程模式视为不可用

---

## 4. TDD 阶段拆分

## 阶段 01：认证核心工具

### 目标

先建立服务端可验证的最小认证能力。

### 先写测试

- `apps/web/tests/integration/auth-routes.test.ts`
  - 正确密码返回成功
  - 错误密码返回 `401`
  - 成功后设置 cookie
- `apps/web/tests/unit/session-auth.test.ts`
  - 可签发 session token
  - 可验证 session token
  - 无效 token 会被拒绝

### 再实现

- `apps/web/src/lib/auth/password.ts`
- `apps/web/src/lib/auth/session.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/api/auth/session/route.ts`

### 验收标准

- 正确密码可以拿到有效登录态
- 错误密码不会进入系统
- session cookie 为 `httpOnly`

---

## 阶段 02：页面访问保护

### 目标

未登录用户不能看到主工作区。

### 先写测试

- `apps/web/tests/integration/auth-guard.test.ts`
  - 未登录访问 `/` 被重定向到 `/login`
  - 已登录访问 `/login` 被重定向到 `/`
  - 未登录访问 `/api/bridge/sessions` 被拒绝

### 再实现

- `apps/web/src/middleware.ts`
- 认证判断逻辑复用 `lib/auth/session.ts`

### 验收标准

- 未登录无法访问工作区页面
- 未登录无法访问 bridge API
- 已登录状态下页面可正常加载

---

## 阶段 03：登录页与退出

### 目标

补齐用户可操作的最小登录体验。

### 先写测试

- `apps/web/tests/unit/login-form.test.tsx`
  - 输入密码并提交
  - 错误时展示错误提示
  - 成功时跳转

### 再实现

- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/login-form.tsx`

### 页面要求

- 风格延续当前 Relay 克制暗色设计
- 不做复杂说明
- 只有：
  - password input
  - submit
  - error state
  - logout state（可选）

### 验收标准

- 手机端可正常输入密码
- 登录失败提示明确
- 登录成功后进入 workspace

---

## 阶段 04：远程模式文档与配置

### 目标

让开发者或用户知道如何把 Relay 暴露到公网。

### 先写验证清单

不是自动化测试优先，而是写可执行操作清单：

- Cloudflare Tunnel 安装
- 登录 Cloudflare
- 创建 tunnel
- 将公网域名指向 `http://localhost:3000`
- 启动 Relay
- 用手机访问并验证登录

### 再实现

- 在 `README.md` 中补充：
  - 远程访问章节
  - 环境变量说明
  - Cloudflare Tunnel 示例命令
- 视情况新增：
  - `workflow/设计/05-Cloudflare-Tunnel-部署说明.md`

### 验收标准

- 新接手者能按文档把公网访问跑通

---

## 阶段 05：手机端基础可用性修正

### 目标

确保在手机上“能用”，而不是仅仅能打开。

### 手机端页面策略

本阶段不复刻桌面三栏布局。

手机端优先采用：

- 一个远程对话工作台

页面结构建议为：

1. 顶部状态栏
   - `Relay`
   - 当前设备名
   - 在线状态
   - 当前 workspace 名
2. 中间消息流
   - 当前 session 的对话内容
   - 工具状态 / 运行状态以轻量系统块插入
3. 底部固定输入区
   - 输入框
   - `run`
4. 抽屉式二级入口
   - session 列表
   - workspace 切换
   - settings / logout

明确不做：

- 桌面三栏直接缩放到手机
- 默认常驻文件树
- 默认常驻右侧预览面板
- 手机端 memory 深度编辑

原因：

- `v0.0.2` 的手机端价值在于远程继续对话，不在于完整承载桌面所有信息密度。

### 先写验证项

- 登录页在窄屏可用
- workspace 输入区在窄屏始终可见
- session 列表和中间消息区不会完全溢出
- 最小可发送一条消息并看到流式返回

建议额外验证：

- session 列表通过抽屉展开，而不是侧栏常驻
- 底部输入区在手机键盘弹出后仍可操作
- 顶部状态信息不会挤压主要消息区

### 再实现

- `apps/web/src/app/globals.css`
- `apps/web/src/components/workspace-client.tsx`
- 只做必要的手机端收敛，不做完整新设计

### 验收标准

- iPhone 常见宽度下可完成一次登录与一次对话

---

## 阶段 06：联调与最终验收

### 目标

把本地、认证、远程访问串成一条真实链路。

### 联调清单

1. 本地启动 Relay：
   - `pnpm dev:up`
2. 设置环境变量：
   - `RELAY_ACCESS_PASSWORD`
   - `RELAY_SESSION_SECRET`
3. 启动 Cloudflare Tunnel
4. 在手机上打开公网地址
5. 输入密码登录
6. 打开 session
7. 发送一条 prompt
8. 看到流式返回

### 必须验收通过的场景

- 错误密码被拒绝
- 正确密码能进入
- 未登录不能直接访问主页面
- 手机端能完成一轮真实对话
- bridge 掉线时页面有错误提示

---

## 5. 文件级实施清单

优先新增或修改这些文件：

- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/api/auth/session/route.ts`
- `apps/web/src/lib/auth/session.ts`
- `apps/web/src/lib/auth/password.ts`
- `apps/web/src/components/login-form.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/workspace-client.tsx`
- `README.md`
- `.env.example`

测试文件：

- `apps/web/tests/unit/login-form.test.tsx`
- `apps/web/tests/integration/auth-routes.test.ts`
- `apps/web/tests/integration/auth-guard.test.ts`

---

## 6. 实施顺序建议

严格按以下顺序执行：

1. 认证工具与 cookie
2. 页面 / API 访问保护
3. 登录页
4. 远程访问文档
5. 手机端最小适配
6. Cloudflare Tunnel 真实联调

原因：

- 没有认证就不该先暴露公网
- 没有访问保护就不该先接 tunnel
- 没有手机端基本可用性，远程访问价值不成立

---

## 7. 风险与约束

### 7.1 主要风险

- 直接暴露公网存在真实安全风险
- 只有单密码，没有用户级权限隔离
- Cloudflare Tunnel 稳定性与用户网络环境相关

### 7.2 当前应对策略

- 所有页面和 `/api/bridge/*` 必须做认证拦截
- cookie 必须服务端签名
- README 明确标注本版本是个人远程访问原型，不是企业级安全方案

### 7.3 明确延期的能力

- 多用户
- 账号系统
- 细粒度权限
- 云端设备中心
- session / memory 云同步

---

## 8. 完成标准

当以下条件同时成立时，可以认为 `v0.0.2` 完成：

1. 手机可在不同网络下打开 Relay
2. 必须先通过密码验证
3. 登录后可继续与本地 Codex 对话
4. 流式返回正常
5. README 中已有明确的启动与 tunnel 配置说明
