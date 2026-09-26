// Wai probe: reads every sensor it has and inserts a row into Supabase `readings` over Wi-Fi
// every few seconds. level_cm is the one processed value the app uses today; everything else
// goes unprocessed into the `raw` jsonb column, to be turned into data points later.
// The app picks new rows up through Supabase Realtime.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <algorithm>

#include "config.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill it in"
#endif

static TinyGPSPlus gps;

static void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Wi-Fi: connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf(" ok, %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    Serial.println(" failed, retrying next loop");
}

// ---- HC-SR04 ----

// One ping: echo pulse width in us, 0 if no echo within ~5 m.
static unsigned long pingUs() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(20); // 10 us is the spec minimum; this board needs longer
  digitalWrite(PIN_TRIG, LOW);
  return pulseIn(PIN_ECHO, HIGH, 30000);
}

// 5 pings. Raw widths go in `raw`; the median distance (cm) is returned, NAN if none echoed.
static float readUltrasonic(JsonObject raw) {
  JsonArray pings = raw["echo_us"].to<JsonArray>();
  float v[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    unsigned long us = pingUs();
    pings.add(us);
    if (us) v[n++] = us / 58.0f;
    delay(60); // let echoes die down
  }
  raw["echo_ok"] = n;
  if (!n) return NAN;
  std::sort(v, v + n);
  float d = v[n / 2]; // median ignores the HC-SR04's outliers
  raw["distance_cm"] = roundf(d * 10) / 10;
  return d;
}

// ---- Soil ----

static void readSoil(JsonObject raw) {
  int adc = analogRead(PIN_SOIL);
  raw["soil_adc"] = adc;
  raw["soil_mv"] = analogReadMilliVolts(PIN_SOIL);
  raw["soil_pct"] = constrain(map(adc, SOIL_DRY, SOIL_WET, 0, 100), 0, 100);
}

// ---- Board ----

static void readBoard(JsonObject raw) {
  raw["uptime_s"] = millis() / 1000;
  raw["rssi"] = WiFi.RSSI();
  raw["wifi_ch"] = WiFi.channel();
  raw["mac"] = WiFi.macAddress();
  raw["free_heap"] = ESP.getFreeHeap();
  raw["chip_temp_c"] = roundf(temperatureRead() * 10) / 10; // die temperature, not air
  raw["fw"] = FW_VERSION;
}

// ---- GPS (XC3710, optional) ----

// NMEA arrives continuously; feed the parser from loop() so no sentences are dropped.
static void feedGps() {
  while (Serial2.available()) gps.encode(Serial2.read());
}

// Adds GPS fields only once a module has sent a valid sentence (a floating RX pin reads noise),
// so rows without GPS stay clean.
static void readGps(JsonObject raw) {
  if (!gps.passedChecksum()) return;
  JsonObject g = raw["gps"].to<JsonObject>();
  g["chars"] = gps.charsProcessed();
  g["sats"] = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;
  g["fix"] = gps.location.isValid() && gps.location.age() < 5000;
  if (gps.location.isValid()) {
    g["lat"] = serialized(String(gps.location.lat(), 6));
    g["lng"] = serialized(String(gps.location.lng(), 6));
    g["age_ms"] = gps.location.age();
  }
  if (gps.hdop.isValid()) g["hdop"] = gps.hdop.hdop();
  if (gps.altitude.isValid()) g["alt_m"] = gps.altitude.meters();
  if (gps.speed.isValid()) g["speed_kmh"] = gps.speed.kmph();
  if (gps.date.isValid() && gps.time.isValid()) {
    char utc[21];
    snprintf(utc, sizeof utc, "%04d-%02d-%02dT%02d:%02d:%02dZ", gps.date.year(), gps.date.month(),
             gps.date.day(), gps.time.hour(), gps.time.minute(), gps.time.second());
    g["utc"] = utc;
  }
}

// ---- Level (the one processed value the app uses) ----

static float levelCm(float distance) {
#if SIMULATE
  // Drains 1 cm per reading from 25 cm to 5 cm, then refills. Low level shows up as an alert.
  static float level = 25;
  level -= 1;
  if (level < 5) level = 25;
  return level + random(-20, 21) / 100.0f;
#else
  if (isnan(distance)) return NAN;
  return constrain(TANK_DEPTH_CM - distance, 0.0f, TANK_DEPTH_CM);
#endif
}

static bool send(JsonDocument &doc) {
  WiFiClientSecure tls;
  tls.setInsecure(); // demo only: skips certificate checks
  HTTPClient http;
  http.begin(tls, String(SUPABASE_URL) + "/rest/v1/readings");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  if (code != 201) Serial.printf("Supabase: HTTP %d %s\n", code, http.getString().c_str());
  http.end();
  return code == 201;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED, OUTPUT);
  analogReadResolution(12);
  Serial2.setRxBufferSize(4096); // holds NMEA while we ping and post
  Serial2.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  Serial.printf("\nWai probe %s, fw %s, %s mode\n", PROBE_ID, FW_VERSION, SIMULATE ? "SIMULATE" : "sensor");
  connectWifi();
}

void loop() {
  feedGps();
  static unsigned long last = 0;
  if (last && millis() - last < SEND_INTERVAL_S * 1000UL) return;
  last = millis();

  connectWifi();

  JsonDocument doc;
  doc["probe_id"] = PROBE_ID;
  JsonObject raw = doc["raw"].to<JsonObject>();
  float distance = readUltrasonic(raw);
  readSoil(raw);
  readBoard(raw);
  readGps(raw);
  float level = levelCm(distance);
  if (!isnan(level)) doc["level_cm"] = roundf(level * 10) / 10;
  if (SIMULATE) raw["simulated"] = true;

  serializeJson(doc, Serial);
  Serial.println();

  if (WiFi.status() == WL_CONNECTED && send(doc)) {
    digitalWrite(PIN_LED, HIGH); // blink on every successful send
    delay(100);
    digitalWrite(PIN_LED, LOW);
  }
}
