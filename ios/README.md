# Wai for iOS

SwiftUI port of the app in `../src`, on the same Supabase project. The AI route stays on Vercel
(`https://wai-olive.vercel.app/api/ai`); the app calls it. `/sim` is web only.

## Open in Xcode

```sh
cd ios
xcodegen generate     # only after editing project.yml; Wai.xcodeproj is committed
open Wai.xcodeproj    # scheme Wai, run on a simulator or a phone
```

Set your team under Signing before running on a phone. Location permission text is in `project.yml`.

## Without Xcode (Command Line Tools only)

```sh
cd ios
swift build                          # every target, macOS
swift run WaiKitCheck                # domain port vs fixtures generated from the TypeScript
swift run WaiLiveCheck               # loads the real farm from Supabase and prints the scores
WAI_SKIP_LOGIN=1 swift run WaiMac    # the app in a 390×844 macOS window, anonymous reads
swift run WaiMac                     # with the login screen
```

Command Line Tools ship neither XCTest nor swift-testing, so `WaiKitCheck` is an executable that
exits 1 on any failure. Regenerate its fixtures from the TypeScript with:

```sh
npx tsx ios/scripts/fixtures.ts      # from the repo root; fetches live rows, needs network
```

## Layout

| Target | Contents |
|---|---|
| `WaiKit` | `Models`, `Metrics`, `Derive`, `Demo`, `Farm` (pure port of `src/lib`), `FarmStore`, `SessionStore`, `Location`, `CommandsStore`, `AIClient` |
| `WaiUI` | `Theme`, `Fonts` (Chivo, Chivo Mono, Archivo, bundled), `Components/`, `Screens/`, `Router`, `RootView` |
| `WaiiOS` | `@main` for the iOS app (built by Xcode via `project.yml`) |
| `WaiMac` | `@main` for the macOS dev runner |
| `WaiKitCheck` | fixture checks |
| `WaiLiveCheck` | live Supabase smoke check |

## Web to Swift

| Web | Swift |
|---|---|
| `FarmProvider` context | `FarmStore` (`@Observable`, in the environment) |
| `useSession` | `SessionStore` |
| `useAI` + `sessionStorage` | `AIClient.shared.ask` with an in-memory cache |
| `useFarmTip` | `FarmTip` |
| `localStorage` handled / snoozed / demo | `UserDefaults`, same keys |
| `navigator.geolocation` | `Location` (`CLLocationManager`) |
| Next routes and `TabBar` links | `Router` (`Tab` + per-tab `[Route]` stacks) |
| Leaflet + Esri tiles | MapKit `.imagery` / `.standard` |
| Recharts | Swift Charts (`TrendChart`), `Path` (`Spark`, `Ring`, `Bars`) |
| `?demo=1` | none; demo mode is the in-app toggle only |

## Not ported, or different

- **Print / Save PDF** on the report: the port shares plain text through the system share sheet. No PDF.
- **`?demo=1`** URL switch: demo mode is the in-app toggle only (Insights).
- **Map tiles**: Apple imagery and standard map instead of Esri World Imagery and OSM. Apple's logo cannot be hidden.
- **Icons**: SF Symbols close to the web's strokes, not identical. The pin is `mappin.and.ellipse`.
- **CSV download** on the probe menu: a `ShareLink`; the menu stays open after sharing.
- **Dates**: "27 Sep" where the browser writes "27 Sept" (en-NZ). Everything else uses fixed formats matching the web.
- **Legend** wraps with a private layout; **tables** use `Grid`, so column widths are close, not exact.
- **iOS-only code** (`#if os(iOS)`) compiled nowhere yet. Check first in a simulator: the hidden system nav bar and edge-swipe back, `waiSheet` detent height on first show, `ShareLink` from inside a sheet, the number-pad interval field (no return key), the tab bar riding above the keyboard, the map's top safe-area padding.
- **Close and Back** pop the current tab's stack. The web links to fixed pages, so Live → Open probe → Close lands on Home here, not Live.
- **Tab state**: switching tabs rebuilds the tab's root view (selected metric, range, open Insights section reset). Navigation paths persist.
- **Realtime INSERT** path was subscribed but never exercised by a live insert during checks.

## Verified on this machine

- `swift build`: every target.
- `swift run WaiKitCheck`: 133,428 fixture checks, 0 failures (metrics, derive, demo, views, alerts, scores vs the TypeScript).
- `swift run WaiLiveCheck`: 3 probes, 3,126 rows, farm score and alerts from the live project.
- `WAI_SKIP_LOGIN=1 WaiMac` ran for 25 s without output or crash.
- Offscreen renders of every screen with fixture data are in `ios/renders/` (not committed).
