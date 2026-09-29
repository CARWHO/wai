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

## Known gaps

See the "Not ported" section at the end of this file, kept current by the porting log.
