#pragma once

// Copy this file to secrets.h and fill it in. secrets.h is gitignored.

// 2.4 GHz only. A phone hotspot works.
#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"

// Same values as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the app.
#define SUPABASE_URL "https://your-project.supabase.co"
#define SUPABASE_KEY "sb_publishable_..."

// Row id in the probes table this device reports as (e.g. "Trough A").
#define PROBE_ID "00000000-0000-0000-0000-000000000000"
