# Wai probe firmware

ESP32 (Jaycar XC3800) reads the trough water level and posts it to Supabase `readings` every 5 s. The app updates live through Realtime.

## Setup

1. Install [PlatformIO](https://platformio.org/install/cli) (`pip install platformio`) or the VS Code extension.
2. `cp include/secrets.example.h include/secrets.h` and fill in Wi-Fi, Supabase URL, publishable key and the probe id.
3. Plug the ESP32 in over USB, then `pio run -t upload && pio device monitor`.

## Modes

`SIMULATE` in `include/config.h`:

- `1`: no sensors needed. Sends a fake level that drains from 25 cm to 5 cm and refills.
- `0`: reads the real HC-SR04. Set `TANK_DEPTH_CM` to the distance from the sensor to the trough floor.

## Wiring

| Part | Pin | ESP32 |
|---|---|---|
| HC-SR04 | VCC | V5 |
| | Trig | GPIO 5 |
| | Echo | GPIO 18, through 1k/1.8k divider (1k Echo→GPIO 18, 1.8k GPIO 18→GND) |
| | GND | GND |
| Soil sensor | + | 3V3 |
| | S | GPIO 34 |
| | − | GND |
| GPS (XC3710, optional) | VCC | 3V3 |
| | GND | GND |
| | TX | GPIO 16 |
| | RX | GPIO 17 |

## Data

Each row sets `level_cm` (the only value the app uses today) and puts everything the probe read, unprocessed, into the `raw` jsonb column:

- Ultrasonic: `echo_us` (5 raw pulse widths), `echo_ok`, `distance_cm` (median)
- Soil: `soil_adc`, `soil_mv`, `soil_pct`
- Board: `uptime_s`, `rssi`, `wifi_ch`, `mac`, `free_heap`, `chip_temp_c` (die, not air), `fw`
- GPS, once a module sends valid data: `gps.{sats, fix, lat, lng, hdop, alt_m, speed_kmh, utc, age_ms, chars}`

Turn these into data points (litres, use per day, time to empty, ...) later, on the app side.
