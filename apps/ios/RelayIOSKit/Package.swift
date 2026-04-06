// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "RelayIOSKit",
  platforms: [
    .iOS(.v18),
    .watchOS(.v11),
    .macOS(.v15),
  ],
  products: [
    .library(
      name: "RelayIOSKit",
      targets: ["RelayIOSKit"]
    ),
  ],
  targets: [
    .target(
      name: "RelayIOSKit"
    ),
    .testTarget(
      name: "RelayIOSKitTests",
      dependencies: ["RelayIOSKit"]
    ),
  ]
)
