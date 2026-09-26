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

### Hardware (demo)

- Board: [Duinotech ESP32, Wi-Fi + Bluetooth (Jaycar XC3800)](https://www.jaycar.co.nz/duinotech-esp32-main-board-with-wi-fi-and-bluetooth/p/XC3800)
- Water level: [HC-SR04 ultrasonic (Jaycar XC4442)](https://www.jaycar.co.nz/arduino-compatible-dual-ultrasonic-sensor-module/p/XC4442), mounted above the trough. Echo is 5V: use a voltage divider to the 3.3V ESP32 pin.
- Soil moisture (optional): [Jaycar XC4604](https://www.jaycar.co.nz/duinotech-arduino-compatible-soil-moisture-sensor-module/p/XC4604), analogue into an ADC pin.
- Power: USB from a laptop (micro-USB data cable).
