# Design

## Stack

| Layer | Choice |
|---|---|
| App | Next.js + Konsta UI (iOS theme) + Tailwind, installable PWA |
| Hosting | Vercel (auto-deploy on push) |
| Backend | Supabase: Postgres, auth, Realtime |
| Hardware | ESP32 + sensors → Supabase REST over Wi-Fi |
| AI | OpenAI API via Next.js API routes |
| Later | SwiftUI port on Mac, same Supabase backend |

## Data flow

ESP32 → Supabase (insert reading) → Realtime → app updates live → API route calls OpenAI → diagnosis / prediction / suggestion

## Inspiration

**Farm**
- [Halter](https://apps.apple.com/nz/app/halter/id1453448841): collars + app; virtual fences, AI health alerts
- [Farmbot](https://farmbot.com.au/): tank, bore, dam, rain monitoring; 10k+ AU producers
- [Farmdeck](https://www.farmdeck.com/features/water-level-monitoring/): real-time water levels
- [Intelli-Tank](https://apps.apple.com/us/app/intelli-tank/id1381515840): tank level + temperature app
- [Aqvify](https://aqvify.com/): well and tank level app

**Fitness (health score pattern)**
- [Oura Readiness Score](https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score): one 0–100 score from many signals
- [WHOOP vs Oura vs Garmin scores](https://www.kygo.app/post/recovery-scores-compared-whoop-oura-garmin): how recovery scores are built

## Demo

- **Primary**: real iPhone, app added to home screen, mirrored to Windows laptop via AeroMirror (AirPlay). Bad Wi-Fi → USB + Personal Hotspot.
- **Backup**: Chrome DevTools device mode (iPhone frame).
- **Last resort**: recorded video.
