# Wai

A fitness tracker for farms. Cheap sensors in the field; AI monitors, diagnoses, predicts and reports.

## Problem

Farmers spend hours on manual checks (ponds, troughs, streams) and still find problems too late: fines, sick stock, wasted inputs.

## How it works

1. **Hardware**: ESP32 sensor probes (water level, quality, more) stream readings to the cloud.
2. **SaaS**: AI turns the data into actions: alerts, predictions, compliance-ready reports.

## Mobile app

- Farm health score
- Suggestions and predictions
- Map of devices
- Device health and battery
- Overview of all data
- Live readings from connected hardware

## Value

- Safety for farmers and animals
- More production
- Time saved on manual checks
- Fines avoided, compliance proof
- Less wasted material

## Pricing

Subscription per acre per month. Farmers pay for the outcome, not the hardware.

## Stack

- Next.js (iOS-style PWA) on Vercel
- Supabase: database, auth, realtime
- ESP32 → Supabase REST
