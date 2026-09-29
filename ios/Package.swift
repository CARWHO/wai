// swift-tools-version: 5.10
import PackageDescription

// WaiKit: models, derived values, scoring, alerts, Supabase store. Pure Swift, tested on macOS.
// WaiUI: SwiftUI screens and components, shared by the iOS app (project.yml) and the macOS dev runner.
let package = Package(
  name: "Wai",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "WaiKit", targets: ["WaiKit"]),
    .library(name: "WaiUI", targets: ["WaiUI"]),
  ],
  dependencies: [
    .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
  ],
  targets: [
    .target(name: "WaiKit", dependencies: [.product(name: "Supabase", package: "supabase-swift")]),
    .target(name: "WaiUI", dependencies: ["WaiKit"], resources: [.process("Resources")]),
    .executableTarget(name: "WaiMac", dependencies: ["WaiUI"]),
    // Command Line Tools ship neither XCTest nor swift-testing, so checks run as an executable: `swift run WaiKitCheck`
    .executableTarget(name: "WaiKitCheck", dependencies: ["WaiKit"]),
  ]
)
