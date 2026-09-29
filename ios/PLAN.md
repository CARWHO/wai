# Swift port plan

Goal: the Next.js app in `src/` as a native SwiftUI app on the same Supabase backend. Same screens, same
numbers, same look. The AI route stays on Vercel (`https://wai-olive.vercel.app/api/ai`); the app calls it.

## Constraint on this machine

Only Command Line Tools are installed (Swift 6.2.4, macOS SDK). No Xcode, so no iOS SDK, simulator, XCTest or
swift-testing. What can be verified here:

- `swift build` of every target for macOS. SwiftUI, MapKit, Charts, CoreLocation and supabase-swift all compile.
- `swift run WaiKitCheck`: the domain port checked against fixtures generated from the TypeScript code.
- `swift run WaiMac`: the same screens in a macOS window, against the real Supabase project.
- `xcodegen generate`: the iOS Xcode project, ready to open once Xcode is installed.

## Layout

```
ios/
  Package.swift            WaiKit (domain + store), WaiUI (screens), WaiMac (dev runner), WaiKitCheck (checks)
  Sources/WaiKit/          Models, Metrics, Derive, Demo, Farm (computeFarm), FarmStore, Session, AIClient
  Sources/WaiUI/           Theme, Components/, Screens/, RootView
  Sources/WaiiOS/          @main App for the iOS target (project.yml)
  Sources/WaiMac/          @main App for macOS
  Sources/WaiKitCheck/     check harness + fixture checks
  Fixtures/                JSON from scripts/fixtures.ts (run with `npx tsx ios/scripts/fixtures.ts`)
  project.yml              XcodeGen spec for the iOS app
```

## Phases

1. Skeleton, model contract, harness (done).
2. In parallel: domain port with fixtures; Supabase store, auth, location, AI client; theme and components.
3. In parallel: screens (Home + tab bar + login; Alerts + detail; Probe + controls + map; Insights + report).
4. Integrate: build, checks, run WaiMac against Supabase, xcodegen, code review, README.

## Mapping

| Web | Swift |
|---|---|
| React context `FarmProvider` | `@Observable FarmStore` |
| `localStorage` | `UserDefaults` |
| `sessionStorage` AI cache | in-memory dictionary on `AIClient` |
| `navigator.geolocation` | `CLLocationManager` |
| Supabase realtime channel | `supabase.channel(...).postgresChange(...)` |
| Leaflet + Esri tiles | MapKit `.imagery` |
| Recharts / Spark / Ring | Swift Charts / `Path` |
| Tailwind tokens | `Theme` colours and fonts (Chivo, Chivo Mono, Archivo bundled) |
| Next routes | `NavigationStack` + `TabView` |
