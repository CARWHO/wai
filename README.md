# Wai

The health monitor for your farm. It does the checking for you.

2nd at the [OpenAI Hackathon](https://saasathon.dev). Mobile app, web app and the hardware, all demoed live. [trywai.now](https://trywai.now)

<img src="docs/unit.jpg" width="360" alt="Wai sensor unit" />

## Problem

- 2 h a day driving round the farm to check water and soil.
- +43% on fertiliser costs.
- $1M fine for run-off from fertilising before the rain.

## How it works

Probe → LoRa (no SIM) → gateway → cloud → AI.

Every reading lands live. The AI works out the cause, the fix and how long you've got.

<img src="docs/pipeline.png" width="720" alt="Probe, LoRa, gateway, cloud, AI, app" />

## App

<p>
  <img src="docs/app-home.png" width="240" alt="Home: alerts, Wai AI guidance and farm health score" />
  <img src="docs/app-alert.png" width="240" alt="Alert: what's happening, what to do next, what happens if nothing changes" />
  <img src="docs/app-insights.png" width="240" alt="Insights: fertiliser timing, water, soil and farm summary" />
</p>

- Farm health score
- Wai AI: suggestions and insights on each probe's current readings
- Alerts: what changed, why, what to do, what it costs if you wait
- Map of probes, with health and battery
- Live readings from the real hardware

The app is SwiftUI on Supabase. The original Next.js web app is in the git history before the `swift-primary` branch.

## Code

| Path | Contents |
|---|---|
| `Sources/WaiKit` | `Models`, `Metrics`, `Derive`, `Demo`, `Farm` (domain), `FarmStore`, `SessionStore`, `Location`, `CommandsStore`, `AIClient` |
| `Sources/WaiUI` | `Theme`, `Fonts` (Chivo, Chivo Mono, Archivo, bundled), `Components/`, `Screens/`, `Router`, `RootView` |
| `Sources/WaiiOS` | `@main` for the iOS app (Xcode project generated from `project.yml`) |
| `Sources/WaiMac` | `@main` for the macOS dev runner |
| `Sources/WaiKitCheck` | fixture checks against `Fixtures/` |
| `Sources/WaiLiveCheck` | live Supabase smoke check |
| `api/ai.ts` | Vercel function for the AI text (`https://wai-olive.vercel.app/api/ai`). The app calls it. |
| `hardware/` | firmware, wiring and enclosure |

### Open in Xcode

```sh
xcodegen generate     # only after editing project.yml; Wai.xcodeproj is committed
open Wai.xcodeproj    # scheme Wai, run on a simulator or a phone
```

Set your team under Signing before running on a phone. Location permission text is in `project.yml`.

### Without Xcode (Command Line Tools only)

```sh
swift build                          # every target, macOS
swift run WaiKitCheck                # domain checks against Fixtures/
swift run WaiLiveCheck               # loads the real farm from Supabase and prints the scores
WAI_SKIP_LOGIN=1 swift run WaiMac    # the app in a 390×844 macOS window, anonymous reads
swift run WaiMac                     # with the login screen
```

Command Line Tools ship neither XCTest nor swift-testing, so `WaiKitCheck` is an executable that exits 1 on any failure.
The fixtures were generated from the TypeScript domain code before it was retired. They are the frozen reference.

### AI function

`api/ai.ts` runs on Vercel with `OPENAI_API_KEY` (and optional `OPENAI_MODEL`) set in the project. Without a key it answers
with the rule-based fallback. Deploy with `vercel deploy` from the repo root. `vercel.json` sets no framework.

## Pricing

$99/month for the software, per device. Hardware is $0 upfront.

## Hardware

<img src="docs/unit-in-hand.jpg" width="360" alt="Holding the unit at the hackathon" />

Probes chain over LoRa. Each one reaches 1 to 3 km to the next, so a string of them covers a whole farm with one gateway.

- ESP32
- LoRa radio, 923 MHz
- GPS
- Ultrasonic water level sensor
- Soil moisture probe
- 3D printed case
