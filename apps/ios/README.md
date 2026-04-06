# Relay iOS

This directory is reserved for the native iPhone client of Relay.

## Positioning

- `apps/web` remains the web control surface, settings shell, and public deployment target.
- `apps/ios` becomes the primary mobile product for App Store distribution.
- The repo stays on a single mainline (`main`). Release states are managed by app targets, environments, TestFlight, and App Store versions, not by long-lived branches.

## v0.1 Scope

The first iPhone release should stay narrow:

- account sign-in
- Relay connection status
- current / recent session access
- message sending to the user's active local Codex route
- minimal recovery states

Out of scope for the first release:

- full settings parity with web
- advanced device management
- memory management UI
- automation management UI
- watchOS app

See the execution plan:

- [`workflow/执行计划/10-Relay-iPhone-v0.1-原生移动端最小可用版执行计划.md`](/Users/ruska/project/web-cli/workflow/执行计划/10-Relay-iPhone-v0.1-原生移动端最小可用版执行计划.md)

See the multi-version roadmap:

- [`workflow/设计/11-iOS-v0.x-产品路线图.md`](/Users/ruska/project/web-cli/workflow/设计/11-iOS-v0.x-产品路线图.md)

## Current M1 Scaffold

The first execution module creates two layers:

- `RelayIOS`
  - native SwiftUI app source skeleton
  - app shell, auth gate, home shell, session shell
- `RelayIOSKit`
  - shared models and API-facing state mapping
  - unit-testable outside a full Xcode app target

This keeps the repo on a single mainline while giving the next module a clean place to add:

- auth/session persistence
- route status fetching
- session loading and message sending

## Modern iOS Baseline

Before merging new iOS work, run:

```bash
./apps/ios/scripts/check-modern-ios.sh
```

The baseline and review method live here:

- [`workflow/rule/02-iOS-现代Swift与SwiftUI规范.md`](/Users/ruska/project/web-cli/workflow/rule/02-iOS-现代Swift与SwiftUI规范.md)

## Local Run

The minimal iPhone app project is generated from:

- [`apps/ios/project.yml`](/Users/ruska/project/web-cli/apps/ios/project.yml)

Regenerate the Xcode project when the app target structure changes:

```bash
cd apps/ios
xcodegen generate
```

Build from the terminal:

```bash
xcodebuild -project apps/ios/RelayIOS.xcodeproj -scheme RelayIOS -destination 'generic/platform=iOS Simulator' build
```

Open in Xcode:

```bash
open apps/ios/RelayIOS.xcodeproj
```

Current auth status:

- The app already supports persisted Relay session restoration once it has valid Supabase access and refresh tokens.
- Native iOS OAuth sheet acquisition is not wired yet.
- v0.1 currently uses a temporary token bridge screen so the rest of the Relay handoff, route-state, session loading, and message streaming path can already be tested end to end.
