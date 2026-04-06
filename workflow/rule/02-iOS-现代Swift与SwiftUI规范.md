# 02 iOS 现代 Swift 与 SwiftUI 规范

## 1. 目的

本规范用于约束 `apps/ios` 的新增代码，避免继续引入已经被 Apple / Swift 官方更新路径替代的旧范式。

本规范的当前基线确认时间为 `2026-04-06`，基于以下本地工具链：

- `Xcode 26.2`
- `Apple Swift 6.2.3`
- `iOS 18+` / `watchOS 11+` 目标平台

如果后续升级到新的 Xcode / Swift 主版本，必须重新核对官方文档并更新本规范与检查脚本。

## 2. 官方基线来源

- Apple SwiftUI Model Data:
  - [https://developer.apple.com/documentation/swiftui/model-data](https://developer.apple.com/documentation/swiftui/model-data)
- Apple SwiftUI Observation migration:
  - [https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- Apple SwiftUI NavigationStack guidance:
  - [https://developer.apple.com/documentation/swiftui/bringing_robust_navigation_structure_to_your_swiftui_app](https://developer.apple.com/documentation/swiftui/bringing_robust_navigation_structure_to_your_swiftui_app)
- Apple `@Bindable`:
  - [https://developer.apple.com/documentation/swiftui/bindable](https://developer.apple.com/documentation/swiftui/bindable)
- Swift Testing:
  - [https://www.swift.org/packages/testing/](https://www.swift.org/packages/testing/)
- Swift concurrency / Sendable adoption:
  - [https://www.swift.org/documentation/server/guides/libraries/concurrency-adoption-guidelines.html](https://www.swift.org/documentation/server/guides/libraries/concurrency-adoption-guidelines.html)

## 3. 强制规则

### 3.1 状态管理

- 新增共享可观察模型时，优先使用 Observation：
  - `@Observable`
  - `@State`
  - `@Bindable`
  - `@Environment(Type.self)` 或等价的现代注入方式
- 对于 iOS 18+ 新代码，默认不再引入以下旧式状态包装：
  - `ObservableObject`
  - `@Published`
  - `@ObservedObject`
  - `@StateObject`
  - `@EnvironmentObject`

说明：

- 纯值类型状态直接使用 `struct` + `@State` / 参数传递即可，不需要为了“看起来现代”而强行变成引用类型。
- 只有在 Apple 官方能力仍要求旧桥接时，才允许例外，并且必须在代码旁注释说明原因。

### 3.2 导航

- 新增导航容器统一使用：
  - `NavigationStack`
  - `NavigationSplitView`
- 新代码不再引入 `NavigationView`。

### 3.3 并发与主线程语义

- 网络、IO、流式事件统一优先使用 Swift 并发：
  - `async/await`
  - `AsyncSequence` / `AsyncStream`
- UI 相关状态更新优先使用 actor 隔离：
  - `@MainActor`
  - `await MainActor.run { ... }`
- 新代码不应再使用 `DispatchQueue.main.async` 作为常规 UI 回主线程手段。
- 跨并发域传递的模型应显式满足 `Sendable`，不能依赖隐式侥幸通过。
- `@unchecked Sendable` 只能作为例外使用，并且必须在旁边写清风险和理由。

### 3.4 测试

- 新增领域层 / Swift Package 单元测试优先使用 Swift Testing：
  - `import Testing`
  - `@Test`
  - `#expect(...)`
- UI 自动化仍允许使用 `XCTest` / `XCUITest`，但需要限定在 UI test target 内。
- 不应在新的 Swift Package 单元测试里继续默认写 `XCTestCase`。

### 3.5 响应式与兼容层

- 新增业务数据流默认优先采用 Swift 并发原生能力，不默认引入 `Combine`。
- 如果第三方 SDK 或系统 API 只提供 Combine，再做局部桥接，不要让 Combine 成为全局状态管理主干。

## 4. 本仓库的自动检查方法

统一执行：

```bash
./apps/ios/scripts/check-modern-ios.sh
```

该检查当前包含：

1. 输出本地 Xcode / Swift 版本
2. 对 `apps/ios` 扫描已禁用的旧范式
3. 对 `RelayIOSKit` 执行 Swift 6 严格并发编译与测试
4. 对需要人工判断的模式输出 warning

## 5. 人工 Review 要点

脚本通过不等于设计已经足够现代。Code review 仍需人工判断以下问题：

1. 新的共享状态是否应该抽成 `@Observable` 模型
2. 是否误把工程状态原样暴露给用户，而不是先压缩成产品语义
3. 是否把恢复态、离线态、登录失效态做成了可理解的用户语言
4. 是否把 streaming / polling / reconnect 设计成了符合移动端资源约束的实现

## 6. 当前已知边界

- 在 `apps/ios` 仍未形成完整 Xcode app target 前，脚本对 `RelayIOS` App 壳层主要做静态规则扫描。
- `RelayIOSKit` 已具备 Swift Package 级别的可编译与可测试约束，因此严格并发检查先落在这里。
- 等 `M2/M3` 建立正式 iOS target 后，应补充：
  - `xcodebuild test`
  - iOS Simulator UI tests
  - 真机 / TestFlight 验收
