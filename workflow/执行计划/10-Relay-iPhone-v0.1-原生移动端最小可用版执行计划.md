# 10 Relay iPhone v0.1 原生移动端最小可用版执行计划

> **ADSF 风格版本**：本计划按 `Architect & Draft → Synthesize → Finalize` 三阶段治理，内层实现严格按模块拆分，不采用长期移动端分支。

---

## 0. ADSF 执行元信息

- EP 编号：`10`
- 目标版本：`Relay iPhone v0.1`
- 当前阶段：`S（Synthesize）`
- 执行口令：待人类确认 `Approved` / `Go`
- 计划性质：原生 iPhone 客户端起步版

### 0.1 Scope

本轮只做以下范围：

- 在 monorepo 中新增 `apps/ios`
- 建立原生 iPhone App 的工程骨架与运行规范
- 定义与现有 Web / Relay Cloud / Local Codex 的边界
- 落地 iPhone 端最小闭环：
  - 登录
  - 设备接力状态
  - 当前会话查看
  - 发送消息
  - 最小恢复态
- 为未来 watchOS companion 预留共享模型与会话状态能力

本轮不做：

- 完整的 iPad 大屏体验
- 完整 watchOS 独立产品
- iPhone 端复杂设置页
- iPhone 端设备管理后台
- iPhone 端记忆管理
- iPhone 端自动化管理
- Android 版本
- 多账号切换

### 0.2 Runtime 声明

本轮 Runtime / 工程形态可能涉及：

- 新工程形态：
  - 新增 `apps/ios`
  - 默认采用原生 `SwiftUI`
- 构建体系：
  - Xcode 工程或 Swift Package 辅助结构
  - CI 后续需支持 iOS build / test
- 环境与配置：
  - iOS 客户端需要自己的 `Base URL`
  - 需要安全存储会话信息（如 Keychain）
- 外部依赖：
  - Apple Developer
  - App Store Connect
  - 现有 Relay Web / API
  - Supabase Auth
- 部署与发布：
  - TestFlight
  - App Store 上架

### 0.3 Traceability Check

本轮 E2E 影响半径如下：

1. 账号链路
- iPhone 登录页
- 现有 `/login`
- `/auth/callback`
- `/api/auth/session`
- `/api/auth/supabase-session`

2. 设备接力链路
- `/api/bridge/route-status`
- `/api/cloud/devices`
- `/api/cloud/default-device`
- `/api/realtime/device/status`

3. 会话链路
- `/api/bridge/sessions`
- `/api/bridge/sessions/[id]`
- `/api/bridge/runtime/run`
- `/api/bridge/runtime/events`

4. 部署链路
- Render 公网 Web
- iPhone 对公网 API 的访问
- 后续 TestFlight 分发

5. 未来扩展链路
- watchOS companion
- 推送或状态刷新机制

### 0.4 风险点

- 如果直接复用当前移动 Web 语义而不收口为 iOS 原生状态模型，产品会继续显得像调试壳
- 如果 iPhone 端继续暴露设备目录、默认设备等工程概念，会破坏消费级产品感
- 如果认证方案不提前按 App Store 约束设计，后续上架会返工
- 如果 iOS 客户端直接依赖当前松散 API 语义，未来 Web 迭代可能拖垮客户端稳定性
- 如果一开始就同时做 iPhone 和 watch，执行面会发散

### 0.5 回滚原则

- 若原生 iOS 客户端推进受阻，仍保留 `/mobile` 作为过渡移动入口
- 若 iPhone v0.1 登录方案在审核或实现上阻力过大，先保留最小受控 beta 分发，不强行上架
- 若 API 语义不稳定，优先冻结 iOS 使用的最小接口集合，而不是在客户端层做大量补丁

### 0.6 现代 iOS 规范基线

本计划的 iOS 实现必须同步遵守以下仓库内规则：

- [`workflow/rule/02-iOS-现代Swift与SwiftUI规范.md`](/Users/ruska/project/web-cli/workflow/rule/02-iOS-现代Swift与SwiftUI规范.md)

本计划的每个 iOS 模块在合并前都必须执行：

```bash
./apps/ios/scripts/check-modern-ios.sh
```

该检查用于防止在 `apps/ios` 中继续引入旧式 `ObservableObject`、`NavigationView`、`DispatchQueue.main.async`、`XCTestCase` 单元测试等模式，并对 `RelayIOSKit` 执行 Swift 6 严格并发编译与测试。

## 1. 目标

把 Relay 从“桌面优先 + Web 移动壳”推进到“有资格成为 App Store 产品”的阶段。

这一版的目标不是把全部能力搬到手机，而是先把 iPhone 变成一个真正可用、可上手、可解释的对话接力产品。

用户体验目标：

1. 用户在电脑端完成一次账号接入与本机绑定
2. 用户在 iPhone 登录同一账号
3. iPhone 明确告诉用户当前连接的是哪台电脑
4. 用户可以直接查看当前会话并发送消息
5. 如果默认设备离线或会话失效，iPhone 只给最小恢复提示

## 2. 本轮验收标准

### 2.1 仓库与工程

- 新增 `apps/ios`
- 不创建长期 `ios` 分支
- `main` 继续作为单主干
- iOS 发布状态通过 App target / 环境 / TestFlight 管理，而不是长期分支管理

### 2.2 iPhone App 功能

- 只支持 iPhone
- 首页即连接状态 / 当前会话入口
- 支持登录
- 支持读取当前设备接力状态
- 支持当前会话查看
- 支持发送消息

### 2.3 用户认知

- iPhone 端不默认暴露：
  - `device id`
  - `localDeviceId`
  - `bindingStatus`
  - 复杂设备列表
  - 内部 route status 原始值
- 用户只需要理解：
  - 我是否已登录
  - 我当前连的是哪台电脑
  - 现在是否可以继续对话
  - 如果不行，我该做什么

### 2.4 异常与恢复态

- 默认设备在线：直接可用
- 当前电脑自动接管：明确提示但不制造恐慌
- 默认设备离线：提示让那台电脑上线
- 账号会话失效：提示重新登录
- 当前没有默认设备：提示先在电脑端完成初次绑定

### 2.5 发布准备

- 明确 iOS v0.1 的 TestFlight 验收清单
- 明确上架前必须补齐的认证 / 合规项
- 明确 watchOS 不进入本轮交付

## 3. 设计原则

### 3.1 iPhone 端是产品，不是后台

iPhone App 不是 Web 设置页的缩小版。

它应该优先回答：

- 现在能不能用
- 连接的是哪台电脑
- 当前会话在哪里
- 我能不能继续说一句话

它不应该优先回答：

- 云端设备目录里有哪些行
- 默认设备内部 ID 是什么
- 绑定过程如何实现

### 3.2 单主干，不做长期移动端分支

版本状态应由以下方式管理：

- `main`
- feature branch
- TestFlight build
- App Store 版本号
- Render / API 环境

而不是：

- 长期 `ios` 分支
- 长期 `mobile` 分支
- 长期 `release-ios` 分支

### 3.3 原生优先

既然目标明确是：

- App Store
- iPhone 优先
- 未来 watchOS

则默认技术路线应为：

- `SwiftUI`
- Apple 原生导航、认证、存储与状态管理能力

而不是先用 Web 包装再长期背负桥接成本。

### 3.4 Web 与 iOS 边界清晰

Web 保留：

- 设置
- 设备视图
- 历史设备治理
- 复杂工作区管理
- 开发 / 验收 / 公网壳

iPhone 保留：

- 登录
- 当前连接状态
- 当前会话
- 最近会话
- 发送消息
- 最小恢复提示

## 4. 模块图（Module Map）

本轮拆成以下模块：

- `M1` iOS 工程基础与 monorepo 接入
- `M2` iPhone 认证与会话落地
- `M3` 设备接力状态壳层
- `M4` 会话列表与消息发送最小闭环
- `M5` 发布约束、TestFlight 与 App Store 准备

模块依赖：

- `M1` 是基础模块
- `M2` 依赖 `M1`
- `M3` 依赖 `M2`
- `M4` 依赖 `M2` 与 `M3`
- `M5` 依赖前四个模块的接口与交互边界基本稳定

可并行性：

- `M1` 与 `M5` 的文档/策略部分可并行推进
- `M3` 与 `M4` 在共享 API 模型稳定后可部分并行

## 5. 模块定义

### 模块 M1：iOS 工程基础与 monorepo 接入

#### 目标

让仓库具备原生 iPhone 客户端的正式落点，而不是临时目录。

#### 边界

- 只建立工程骨架、目录规范、共享模型约束
- 不在本模块追求完整功能

#### 输入 / 输出

- 输入：
  - 现有 monorepo
  - 现有 Relay Web/API 结构
- 输出：
  - `apps/ios`
  - iOS 工程结构说明
  - 环境注入规范
  - 现代 iOS 基线检查脚本
  - 现代 iOS 规则文档

#### 显式依赖

- 无前置功能依赖

#### 涉及文件

- `apps/ios/*`
- `README.md`
- `workflow/*`

#### 完成定义

- `apps/ios` 目录结构明确
- iOS 工程创建方式明确
- 单主干策略写入文档
- `./apps/ios/scripts/check-modern-ios.sh` 可执行
- M1 新增代码通过现代 iOS 基线检查

### 模块 M2：iPhone 认证与会话落地

#### 目标

让 iPhone 客户端可以稳定建立自身会话，而不是借助浏览器临时态。

#### 边界

- 只覆盖 iPhone v0.1 必需认证链路
- 不做多账号切换

#### 输入 / 输出

- 输入：
  - 现有 Relay 会话接口
  - Supabase 登录能力
- 输出：
  - iPhone 登录态
  - 安全会话存储
  - 启动时会话恢复

#### 显式依赖

- 依赖 `M1`

#### 涉及文件

- `apps/ios/*`
- 可能需要新增 `packages/relay-api-client`

#### 完成定义

- 冷启动可判定登录状态
- 重新打开 app 可恢复会话
- 失效状态可回到登录

### 模块 M3：设备接力状态壳层

#### 目标

把“当前连的是哪台电脑、是否可继续”压缩成消费级状态模型。

#### 边界

- 不做复杂设备管理
- 只做接力状态展示与恢复提示

#### 输入 / 输出

- 输入：
  - `/api/auth/session`
  - `/api/bridge/route-status`
  - 必要时的最小设备信息
- 输出：
  - iPhone 顶部状态壳
  - 接力状态卡片
  - 恢复态提示

#### 显式依赖

- 依赖 `M2`

#### 完成定义

- 能明确区分：
  - 已连接默认电脑
  - 当前电脑已接管
  - 默认电脑离线
  - 尚未设置默认电脑
  - 需要重新登录

### 模块 M4：会话列表与消息发送最小闭环

#### 目标

让 iPhone 真正具备“打开就能继续说一句话”的能力。

#### 边界

- 只做最小闭环
- 不做完整工作区浏览
- 不做记忆/自动化 UI

#### 输入 / 输出

- 输入：
  - `/api/bridge/sessions`
  - `/api/bridge/sessions/[id]`
  - `/api/bridge/runtime/run`
  - `/api/bridge/runtime/events`
- 输出：
  - 当前会话
  - 最近会话
  - 发消息
  - 流式返回

#### 显式依赖

- 依赖 `M2`
- 状态提示部分依赖 `M3`

#### 完成定义

- 用户可查看当前会话
- 用户可发送一条消息
- 用户能看到响应返回
- 无可用路由时给恢复提示而不是原始错误

### 模块 M5：发布约束、TestFlight 与 App Store 准备

#### 目标

避免做完 iPhone 原型后，才发现上架路径和合规策略不成立。

#### 边界

- 本模块以策略、配置、验收为主
- 不要求在本模块完成正式上架

#### 输入 / 输出

- 输入：
  - iPhone v0.1 功能边界
  - Apple 分发流程
- 输出：
  - TestFlight 验收清单
  - App Store 必补事项清单
  - 版本元数据准备清单

#### 显式依赖

- 依赖 `M1` 到 `M4` 的边界基本稳定

#### 完成定义

- TestFlight 路线明确
- 上架前缺口明确
- 不再把 App Store 约束留到最后一周处理

## 6. TDD 拆分

### M1. 工程基础测试

先补 / 维护：

- `apps/ios` 目录说明文档
- 工程初始化脚本或说明文档

至少覆盖：

- 目录存在
- 运行方式明确
- 环境变量来源明确
- 现代 iOS 基线检查脚本可运行
- `RelayIOSKit` 在 Swift 6 严格并发下可通过测试

### M2. 认证与会话测试

计划测试类型：

- iOS 单元测试
- iOS 集成测试

至少覆盖：

- 首次登录成功
- 冷启动恢复会话
- 会话失效回到登录
- 网络异常时给出明确错误

### M3. 设备接力状态测试

计划测试类型：

- iOS ViewModel 单元测试
- 状态映射测试

至少覆盖：

- 默认设备在线
- 当前电脑自动接管
- 默认设备离线
- 无默认设备
- GitHub / 账号会话失效

### M4. 会话最小闭环测试

计划测试类型：

- iOS 单元测试
- iOS UI 测试

至少覆盖：

- 加载当前会话
- 加载最近会话
- 发送一条消息
- 流式响应更新
- 路由不可用时显示恢复提示

### M5. 最终 E2E / 人工验收

至少定义以下闭环：

1. 用户在电脑端完成绑定与默认设备建立
2. 用户在 iPhone 登录同一账号
3. iPhone 显示当前连接电脑
4. iPhone 打开当前会话
5. iPhone 成功发出一条消息并收到回复
6. 默认设备离线时，iPhone 显示最小恢复提示
7. 账号会话失效时，iPhone 要求重新登录
8. TestFlight 安装包可安装并完成上述主路径

## 7. Finalize 收尾清单（ADSF · F）

### 7.1 文档同步

- 更新本执行计划状态
- 更新 `apps/ios/README.md`
- 更新 iOS 现代规范文档（如工具链主版本变化）
- 更新仓库根 README 中的客户端结构说明
- 如新增 iOS 环境变量，更新 `.env.example`

### 7.2 Runtime 收尾

- 固化 iOS base URL 配置方式
- 固化签名、Bundle Identifier、环境区分方式
- 固化 TestFlight 构建流程

### 7.3 人工验收

- 真机登录
- 真机查看当前会话
- 真机发消息
- 异常态验证
- 首轮 TestFlight 验收
- 每个合并模块都完成一次现代 iOS 基线检查

### 7.4 输出要求

- 变更摘要
- 已知风险
- 下一版本 follow-ups

## 8. 交付后的用户可见变化

完成后，用户将看到：

- Relay 不再只是一个带移动端页面的 Web 产品
- Relay 开始拥有真正的 iPhone 客户端形态
- 手机端产品目标从“查看壳”升级到“直接接力继续对话”

## 9. 本轮明确不做

- watchOS 正式版本
- iPad 专项布局优化
- 记忆页面原生化
- 自动化页面原生化
- 复杂设置页原生化
- 完整离线能力

## 10. 版本建议

建议版本节奏：

1. `iPhone v0.1`
   - 登录
   - 接力状态
   - 当前会话
   - 发消息

2. `iPhone v0.2`
   - 最近会话增强
   - 更稳定的恢复态
   - 收藏 / 当前工作区辅助信息

3. `iPhone v0.3`
   - 为 watch companion 提供共享状态层

## 11. 当前产品决策

本计划确定以下产品决策：

1. Relay 继续保持单主干开发，不创建长期 iOS 分支
2. iPhone App 使用原生路线，而不是长期依赖移动 Web 包装
3. Web 继续承担设置、设备治理、复杂管理能力
4. iPhone 只承担“随时接力继续对话”的核心任务
5. watchOS 不进入本轮交付，只做后续架构预留
