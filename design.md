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

## Demo

- **Primary**: real iPhone, app added to home screen, mirrored to Windows laptop via AeroMirror (AirPlay). Bad Wi-Fi → USB + Personal Hotspot.
- **Backup**: Chrome DevTools device mode (iPhone frame).
- **Last resort**: recorded video.
