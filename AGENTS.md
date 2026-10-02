# Wai

Swift package at the repo root. `WaiKit` is the domain and Supabase store, `WaiUI` the SwiftUI screens,
`WaiiOS` the iOS entry (Xcode project from `project.yml`), `WaiMac` the macOS dev runner.

- `swift build` builds every target on macOS. `swift run WaiKitCheck` runs the fixture checks and exits 1 on failure.
- `xcodegen generate` after editing `project.yml`. `Wai.xcodeproj` is committed.
- `api/ai.ts` is the only TypeScript: a Vercel function the app calls for AI text. It is not part of the Swift build.
- Fixtures in `Fixtures/` are the frozen reference from the retired TypeScript domain code. Do not regenerate them.
