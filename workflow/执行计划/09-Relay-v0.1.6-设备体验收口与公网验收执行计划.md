# 09 Relay v0.1.6 设备体验收口与公网验收执行计划

> **ADSF 风格版本**：本计划按 `Architect & Draft → Synthesize → Finalize` 三阶段组织，强调 Traceability、Runtime 声明、测试同步生成和最终闭环验收。

---

## 0. ADSF 执行元信息

- EP 编号：`09`
- 目标版本：`v0.1.6`
- 当前阶段：`A+D（Architect & Draft）`
- 执行口令：待人类确认 `Approved` / `Go`
- 计划性质：体验收口版，不新增大型业务线

### 0.1 Scope

本轮只做以下范围：

- 设置页整合与简化
- 首次登录自动绑定与自动设默认设备
- 工作区错误态与恢复态优化
- 历史设备治理
- 移动端接力体验收口
- 公网 / Render 稳定验收

本轮不做：

- 多用户团队协作
- 跨账号共享设备
- 复杂设备标签系统
- 独立设备管理后台
- 新的自动化产品线

### 0.2 Runtime 声明

本轮在 Runtime 层可能涉及的变更类型：

- 数据库迁移：
  - 当前计划默认 **不新增 schema**
  - 若执行中发现必须新增字段或索引，必须补写 Supabase migration，并同步文档
- 环境变量：
  - 当前默认 **不新增必要 env**
  - 若 Render / 本地 production 验收发现缺项，必须回写 `.env.example` 和部署文档
- 构建 / 启动方式：
  - 固化 production 启动方式
  - 固化 Render build/start 命令
- 外部依赖：
  - GitHub OAuth
  - Supabase
  - Render
  - Cloudflare Tunnel（仅作为本地公网验收工具）

### 0.3 Traceability Check

本轮 E2E 影响半径如下：

1. 登录链路
- `/login`
- `/auth/callback`
- `/api/auth/*`

2. 设备链路
- `/settings`
- `/api/cloud/devices`
- `/api/cloud/default-device`
- `/api/bridge/device`
- `/api/bridge/route-status`

3. 工作区主链路
- `/workspace`
- `/api/bridge/workspaces`
- `/api/bridge/sessions`
- `/api/bridge/runtime/*`

4. 移动端链路
- `/mobile`
- 移动端工作区与会话入口

5. 部署链路
- 本地 production 启动
- Render 部署
- tunnel 外网访问

### 0.4 风险点

- 自动绑定逻辑可能在异常情况下误触发，需要严格限制“仅当前本机且账号一致时”
- 默认设备自动设定若语义不清，可能让用户误解“系统改了我的连接目标”
- 工作区自动回退若提示不足，会造成“为什么还能用 / 为什么没连默认设备”的认知混乱
- Render 验收若继续使用开发模式，会掺入 HMR 噪音，导致误判

### 0.5 回滚原则

- 若自动绑定逻辑出现歧义，优先回滚为“只自动检测，不自动写入”
- 若自动默认设备引发误操作风险，优先回滚为“仅首次无默认设备时自动设定”
- 若移动端接力体验不稳定，优先保证桌面端主链路不受影响

## 1. 目标

把 Relay 从“账号、设备、默认设备、工作区链路已经打通”推进到“用户在电脑端登录一次后，移动端可以直接接力使用”的产品体验阶段。

这一版不是继续扩展新能力，而是收口体验、减少配置、压低理解成本。

本计划聚焦：

- 设置页整合与简化
- 首次登录自动绑定与自动设默认设备
- 工作区错误态与恢复态优化
- 历史设备治理
- 移动端接力体验收口
- 公网 / Render 稳定验收

---

## 2. 本轮版本目标

用户体验上的目标应该变成：

1. 用户在电脑端打开 Relay Web
2. 用 GitHub 登录
3. 系统自动识别当前本机 Relay
4. 如果当前设备未绑定，则自动绑定
5. 如果当前账号还没有默认设备，则自动把当前设备设为默认设备
6. 用户之后在手机端登录同一账号，可直接接力使用
7. 只要本地电脑开着、本地 Relay 开着，就可以继续使用本地 Codex

---

## 3. 本轮验收标准

### 3.1 设置页

- 设置页只保留两个 tab：
  - `账号与设备`
  - `外观`
- 旧的 `总览 / 设备 / 访问` 不再作为三套并列主 tab 暴露
- 账号与设备页默认只展示用户真正关心的信息：
  - 当前是否已登录 GitHub
  - 当前连接的是哪台电脑
  - 默认设备是哪台
  - 当前设备是否已自动接管
  - 是否存在其他设备 / 历史设备
- `user id / device id / localDeviceId / bindingStatus` 等工程字段默认折叠到高级信息区
- 设置页结构应进一步收口为：
  - 登录状态卡片
  - 当前连接电脑卡片
  - 默认设备卡片
  - 其他设备列表
  - 历史设备折叠区
  - 高级信息折叠区
- 设置页主文案必须从“工程状态描述”改为“用户结果描述”：
  - 已连接当前电脑
  - 当前设备已自动接管
  - 默认设备离线
  - 请重新登录 GitHub
- 设置页主区域不再默认展示这些工程字段：
  - `userId`
  - `deviceId`
  - `localDeviceId`
  - `bindingStatus`
  - `cloud relay channel` 内部实现描述
- 设置页按钮语义必须收口为少量主动作：
  - `登录 GitHub`
  - `设为默认设备`
  - `清理历史记录`
  - `退出登录`

### 3.2 自动化

- 电脑端首次 GitHub 登录后：
  - 若本机 Relay 可读，系统自动检查本机是否已绑定
  - 若未绑定，自动完成绑定
  - 若当前账号没有默认设备，自动把当前设备设为默认设备
- 默认设备离线但当前本机可用时：
  - 系统自动回退到当前本机
  - 页面明确提示“当前设备已自动接管”

### 3.3 工作区

- `/workspace` 顶部状态条能够明确表达：
  - 已连接默认设备
  - 当前本机已自动接管
  - 默认设备离线
  - GitHub 云端会话失效
- 每种状态都给出恢复建议，不再直接暴露原始工程错误

### 3.4 历史设备治理

- 同一台电脑历史遗留的离线设备记录可以被识别为“历史记录”
- 历史离线设备支持清理
- 历史设备不再抢占主信息层级

### 3.5 移动端

- 手机端登录同一账号后：
  - 默认设备在线时可以直接使用
  - 不需要继续理解复杂设备配置
- 移动端优先保留最核心能力：
  - 当前工作区
  - 最近工作区
  - 收藏工作区
  - 会话查看与发消息

### 3.6 公网 / Render

- 本地 production 模式 + tunnel 验收通过
- Render 部署命令固定并可稳定启动
- Render 上以下路径可用：
  - `/login`
  - `/settings`
  - `/workspace`
  - `/mobile`

---

## 4. 设计原则

### 4.1 用户不应该理解工程内部概念

不应让普通用户在主流程中理解这些概念：

- bind code
- localDeviceId
- 云端 Relay 通道
- route status
- device directory
- realtime channel internals

用户只需要理解三件事：

- 我是否已登录
- 我现在连接的是哪台电脑
- 如果出问题，我该做什么

### 4.2 设置页不是后台管理页，而是连接状态页

设置页应该优先回答：

- 当前账号是什么
- 当前这台电脑是否可用
- 默认连接电脑是哪台
- 当前是否已经自动接管
- 是否有历史设备需要清理

设置页不应该优先回答：

- 当前数据库里有哪些字段
- 设备内部 ID 是什么
- 设备绑定过程的内部实现细节
- 云端实时通道是如何接起来的

### 4.3 自动化优先于暴露配置

原则上应优先系统自动完成：

- 首次绑定
- 默认设备选择
- 当前本机接管

只有自动化失败时，才展示需要用户手动干预的入口。

---

## 5. 模块图（Module Map）

本计划的执行拆分采用“ADSF 外层治理 + 模块化内层执行”：

- `A+D`：完成本计划、Traceability、Runtime 声明、人类确认
- `S`：按模块推进实现、测试、修正
- `F`：整体验收、文档同步、runtime 收尾

本轮模块如下：

- `M1` 设置页信息架构重构
- `M2` 自动绑定与默认设备自动化
- `M3` 工作区状态语义与恢复态
- `M4` 历史设备治理
- `M5` 移动端接力体验
- `M6` 公网 / Render 稳定验收

### 5.1 模块依赖

- `M1` 与 `M3` 可以相对独立推进，但最终文案语义要保持一致
- `M2` 为 `M3` 提供正确的设备路由语义基础
- `M4` 依赖设备目录与设置页展示已经稳定
- `M5` 依赖 `M2 / M3` 的状态语义已经清晰
- `M6` 依赖前述模块达到可用状态后再做最终闭环验收

### 5.2 可并行推进关系

- `M1` 可与 `M2` 并行推进
- `M3` 可在 `M2` 基本语义稳定后快速收口
- `M4` 可独立推进
- `M5` 可在桌面端语义收口后推进
- `M6` 作为最终集成与部署验收模块

---

## 6. 模块定义

### 模块 M1：设置页简化重构

#### 目标

把 `总览 + 设备 + 访问` 合并为一个 `账号与设备` tab。

#### 具体改动

1. 新设置页结构
- `账号与设备`
- `外观`

2. `账号与设备` 信息层级
- 登录状态区
- 当前设备区
- 默认设备区
- 其他设备区
- 历史设备折叠区
- 高级信息折叠区

3. 弱化或隐藏工程信息
- 默认隐藏 `userId`
- 默认隐藏 `deviceId`
- 默认隐藏 `localDeviceId`
- 默认隐藏技术内部状态词

4. 历史设备展示
- 默认折叠
- 有历史设备时显示分组或提示
- 每项支持清理

5. 主视觉和交互收口
- 登录状态、当前设备、默认设备都使用统一卡片样式
- 当前设备和默认设备在视觉上必须一眼可区分
- 历史设备不再和当前设备使用同等视觉权重
- 重要提示使用单条清晰状态文案，不堆多段解释

6. 高级信息区
- 默认折叠
- 只有需要排查问题时再展开
- 承载：
  - `userId`
  - `deviceId`
  - `localDeviceId`
  - 平台 / 架构等调试信息

7. `外观` 页保持纯净
- 不混入账号与设备信息
- 只放主题、颜色、未来 UI 偏好

#### 涉及文件

- `apps/web/src/components/settings-page-client.tsx`
- `apps/web/src/config/messages.ts`
- `apps/web/src/app/globals.css`

#### 本阶段必须补齐的单元测试

- `settings-page-client.test.tsx`
  - 只渲染两个主 tab
  - `账号与设备` 为默认主视图
  - 登录状态卡片、当前设备卡片、默认设备卡片按预期出现
  - 历史设备默认弱化展示
  - 高级信息默认折叠
  - 工程字段不在主区域默认直出
  - 主按钮只保留核心动作

#### 模块完成定义

- UI 结构已经从 3 tab 收口到 2 tab
- 页面主文案改为用户结果导向
- 单元测试通过

---

### 模块 M2：首次登录自动绑定与默认设备自动化

#### 目标

把当前已有的绑定与默认设备机制，从“用户可手动完成”推进到“系统默认自动完成”。

#### 具体改动

1. 登录后自动检查本机
- 读取本机 `GET /api/bridge/device`
- 检查当前设备与当前 GitHub 账号的关系

2. 自动绑定
- 当前设备未绑定时自动触发绑定逻辑
- 已绑定到别的账号时给明确阻断提示

3. 自动设默认设备
- 当前账号没有默认设备时自动设当前设备为默认

4. 当前本机自动接管
- 默认设备缺失但当前本机可用
- 默认设备离线但当前本机可用
- 两种情况都自动回退到当前设备

#### 涉及文件

- `apps/web/src/lib/auth/device-bootstrap.ts`
- `apps/web/src/lib/realtime/bridge-target.ts`
- `apps/web/src/lib/api/bridge-route-status.ts`
- `apps/web/src/components/settings-page-client.tsx`
- `apps/web/src/components/workspace-client.tsx`

#### 本阶段必须补齐的单元测试

- `device-bootstrap.test.ts`
  - 当前设备未绑定时自动绑定
  - 当前账号无默认设备时自动设默认
  - 当前设备已绑定到当前账号时不重复绑定
  - 当前设备已绑定到其他账号时阻断
- `bridge-route-status.test.ts`
  - 默认设备缺失但当前本机可用时返回 local fallback
  - 默认设备离线但当前本机可用时返回 local fallback
  - 默认设备在线且属于其他本机时返回 remote

#### 模块完成定义

- 电脑端首次登录时，当前本机可自动补齐绑定 / 默认设备
- 本机 fallback 语义稳定
- 单元测试通过

---

### 模块 M3：工作区错误态与恢复态优化

#### 目标

让 `/workspace` 在所有设备相关状态下都“可理解、可恢复”。

#### 具体改动

1. 状态语义收口
- 已连接默认设备
- 当前本机已自动接管
- 默认设备离线
- 默认设备未设置
- GitHub 会话失效

2. 恢复文案
- 告诉用户当前发生了什么
- 告诉用户下一步应该做什么
- 尽量避免只展示底层报错字符串

3. 回退策略
- 当前本机可用时优先回退
- 当前本机不可用时再明确报不可用

#### 涉及文件

- `apps/web/src/components/workspace-client.tsx`
- `apps/web/src/config/messages.ts`
- `apps/web/src/app/api/bridge/_lib.ts`

#### 本阶段必须补齐的单元测试

- `workspace-client.test.tsx`
  - 显示“当前已连接默认设备”
  - 显示“当前本机已自动接管”
  - 显示恢复建议文案
  - GitHub 会话失效时提示重新登录
  - 默认设备离线但本机可用时不直接报死错误
- `bridge-proxy-lib.test.ts`
  - fallback 场景优先走本地
  - 真正 unavailable 场景返回明确业务错误

#### 模块完成定义

- `/workspace` 不再直接向用户暴露底层原始错误
- 关键恢复提示文案已落地
- 单元测试通过

---

### 模块 M4：历史设备治理

#### 目标

把“同一台电脑历史上生成过多个 localDeviceId”这类遗留问题产品化处理掉。

#### 具体改动

1. 历史设备识别
- hostname 相同
- 设备名相同
- 当前在线设备与旧离线设备同时存在

2. 清理能力
- 仅允许删除：
  - 非默认
  - 非当前
  - 离线
  的历史设备

3. 展示规则
- 当前设备优先
- 默认设备次优先
- 历史设备弱化展示

#### 涉及文件

- `apps/web/src/app/api/cloud/devices/[deviceId]/route.ts`
- `apps/web/src/lib/api/cloud-devices.ts`
- `apps/web/src/components/settings-page-client.tsx`

#### 本阶段必须补齐的单元测试

- `cloud-devices.test.ts`
  - 可删除历史设备
  - 默认设备不可删除
  - 删除后目录状态正确更新
- `settings-page-client.test.tsx`
  - 历史设备显示“历史记录”
  - 历史设备支持清理
  - 当前设备 / 默认设备不出现清理按钮

#### 模块完成定义

- 历史设备识别、展示、清理闭环完成
- 单元测试通过

---

### 模块 M5：移动端接力体验收口

#### 目标

把移动端定位成“直接接力用”的入口，而不是设备管理后台。

#### 具体改动

1. 登录后直接可用
- 默认设备在线时，直接进入可用态

2. 保持最小能力集
- 当前工作区
- 最近工作区
- 收藏工作区
- 会话查看与发消息

3. 异常状态最小提示
- 当前没有默认设备
- 默认设备离线
- 当前账号未绑定设备
- GitHub 会话失效

#### 涉及文件

- `apps/web/src/components/mobile/*`
- `apps/web/src/app/mobile/*`
- `apps/web/src/config/messages.ts`

#### 本阶段必须补齐的单元测试

- `mobile-shell.test.tsx`
  - 登录后进入移动端主壳
  - 当前工作区 / 最近工作区 / 收藏工作区正常展示
  - 默认设备在线时可以直接进入可用态
  - 默认设备离线时显示最小提示而不是复杂配置说明
  - 不暴露桌面端设备管理式操作

#### 模块完成定义

- 手机端已从“管理入口”收口为“接力使用入口”
- 单元测试通过

---

### 模块 M6：公网 / Render 稳定验收

#### 目标

把当前本地最小可用链路推进到真实公网部署可验收状态。

#### 本地公网验收方式

1. 使用生产模式启动

```bash
pnpm --filter web build
pnpm --filter web exec next start --hostname 0.0.0.0 --port 3000
```

2. 再启动 tunnel

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

3. 验证路径
- `/login`
- `/settings`
- `/workspace`
- `/mobile`

#### Render 部署配置

Build Command:

```bash
pnpm install --frozen-lockfile && pnpm --filter web build
```

Start Command:

```bash
pnpm --filter web exec next start --hostname 0.0.0.0 --port $PORT
```

#### 环境变量校验

- `RELAY_SESSION_SECRET`
- `RELAY_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `RELAY_ACCESS_PASSWORD`（可选）

说明：

- 当前 GitHub 登录通过 Supabase GitHub Provider 完成
- 因此应用侧默认不再要求 `GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / GITHUB_REDIRECT_URI`
- 需要在 Supabase Provider 配置中把回调地址指向：`https://你的公网域名/auth/callback`

#### 本阶段必须补齐的集成 / 最终测试

- 本地 production 模式启动测试
- tunnel 生产模式访问测试
- Render 部署后真实路径访问测试

#### 模块完成定义

- production 模式可稳定启动
- Render 可稳定部署
- 最终公网访问路径可用

---

## 7. TDD 拆分

### M1. 设置页重构测试

先补测试：

- `settings-page-client.test.tsx`
  - 仅保留两个主 tab
  - 账号与设备页展示当前设备 / 默认设备 / 历史设备
  - 工程字段默认不在主视图直出
  - 历史设备默认弱化展示
  - 当前设备 / 默认设备 / 自动接管状态有明确主文案
  - 高级信息默认折叠

再实现：

- `apps/web/src/components/settings-page-client.tsx`
- `apps/web/src/config/messages.ts`

### M2. 自动绑定 / 自动默认设备测试

先补测试：

- `device-bootstrap.test.ts`
  - 当前设备未绑定时自动绑定
  - 当前账号无默认设备时自动设默认
  - 当前设备属于别的账号时阻断

再实现：

- `apps/web/src/lib/auth/device-bootstrap.ts`

### M3. route status 回退测试

先补测试：

- `bridge-route-status.test.ts`
  - 默认设备离线但当前本机可用时，返回 local fallback
  - 默认设备缺失但当前本机可用时，返回 local fallback

- `bridge-proxy-lib.test.ts`
  - fallback 场景优先走本地

再实现：

- `apps/web/src/lib/realtime/bridge-target.ts`
- `apps/web/src/app/api/bridge/_lib.ts`

### M3. 工作区错误态测试

先补测试：

- `workspace-client.test.tsx`
  - 显示“当前本机已接管”
  - 显示恢复建议
  - GitHub 会话失效时显示重新登录提示

再实现：

- `apps/web/src/components/workspace-client.tsx`

### M4. 历史设备清理测试

先补测试：

- `cloud-devices.test.ts`
  - 可删除历史设备
  - 默认设备不可删除

再实现：

- `apps/web/src/app/api/cloud/devices/[deviceId]/route.ts`
- `apps/web/src/lib/api/cloud-devices.ts`

### M5. 移动端接力测试

先补测试：

- `mobile-shell.test.tsx`
  - 默认设备在线时移动端可直接使用
  - 默认设备离线时显示最小恢复提示
  - 最近工作区和当前工作区状态正常

再实现：

- `apps/web/src/components/mobile/*`
- `apps/web/src/config/messages.ts`

### M6. 最终 E2E 测试

先补 / 维护：

- `apps/web/playwright.config.ts`
- `apps/web/tests/e2e/*`

覆盖闭环：

1. 电脑端首次登录 GitHub
2. 自动识别本机设备
3. 自动绑定当前设备
4. 自动设当前设备为默认设备
5. 进入 `/settings` 能看到当前设备、默认设备、历史设备分层
6. 进入 `/workspace` 能正常打开工作区并发送一条消息
7. 默认设备切成离线设备后，工作区自动回退到当前本机并显示恢复提示
8. 清理历史离线设备后，设置页列表正确更新
9. 移动端登录后直接进入可用态
10. Render 部署后 `/login`、`/settings`、`/workspace`、`/mobile` 全部可访问

最终验收要求：

- 单元测试全部通过
- 关键集成测试通过
- Playwright E2E 闭环通过
- `pnpm --filter web build` 通过

---

## 8. Finalize 收尾清单（ADSF · F）

### 7.1 文档同步

- 更新本执行计划状态
- 更新版本状态梳理文档
- 如新增运行约束，更新 `.env.example`
- 如新增部署注意事项，更新 Render / tunnel 验收文档
- 当前文档已落地到 `docs/render-acceptance.md` 与 `render.yaml`

### 7.2 Runtime 收尾

- 若有 Supabase schema 变更：
  - 补 migration
  - 记录需要执行的 SQL / migration 步骤
- 若有 env 变更：
  - 同步 `.env.example`
  - 同步 Render 配置说明
- 若有路由 / 页面变更：
  - 重新执行 `pnpm --filter web build`

### 7.3 最终人工验收

1. 本地 production 模式
- 能启动
- `/login`、`/settings`、`/workspace`、`/mobile` 可访问

2. 电脑端登录闭环
- GitHub 登录成功
- 自动识别当前本机
- 自动绑定 / 自动默认设备生效

3. 工作区闭环
- 能打开工作区
- 能发送消息
- 能收到回复

4. 异常恢复闭环
- 默认设备离线时自动回退到当前本机
- GitHub 会话过期时有明确提示

5. 移动端闭环
- 登录后可直接接力使用
- 不出现复杂设备管理理解负担

### 7.4 输出要求

- 输出本轮变更摘要
- 输出测试结果摘要
- 输出剩余风险
- 输出下一步 recommended follow-ups

---

## 9. 交付后的用户可见变化

完成这一版后，用户应能实际感受到这些变化：

1. 电脑端首次登录后更少手动配置
2. 设置页更像“连接状态页”，而不是后台管理面板
3. 设备列表更清楚地区分：
- 当前设备
- 默认设备
- 历史设备
4. 默认设备离线时，系统更倾向于自动接管，而不是直接报错
5. 手机端更接近“登录即可接力使用”
6. 每个新增功能点都有对应单元测试
7. 最终有一套完整的 E2E 闭环验证

---

## 10. 本轮明确不做

这一版不做以下扩展性工作：

- 多用户团队协作
- 跨账号共享设备
- 复杂设备标签系统
- 设备分组 / 批量操作
- 独立的设备管理后台
- 完整的移动端设备管理功能

---

## 11. 版本建议

- 当前目标版本：`v0.1.6`
- 本版定位：`设备体验收口与公网验收前准备版`

之后建议版本路径：

- `v0.1.7`
  - 首次登录自动绑定与自动设默认设备最终收口
- `v0.1.8`
  - 移动端无感接力与异常恢复收口
- `v0.2.0`
  - Render 上稳定可用的公网版本

---

## 12. 当前产品决策

本计划按以下产品决策执行：

1. 电脑端首次登录后，系统默认自动绑定并自动设默认设备
- 默认不弹额外确认

2. 历史离线设备默认弱化展示
- 优先折叠或以历史分组展示

3. 设置页优先呈现业务结果，不优先呈现工程细节

4. 移动端优先是“接力使用入口”，不是“设备管理后台”
