// Wai probe: reads trough water level (HC-SR04) and soil moisture,
// and inserts a row into Supabase `readings` over Wi-Fi every few seconds.
// The app picks new rows up through Supabase Realtime.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <algorithm>

#include "config.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill it in"
#endif

static void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Wi-Fi: connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf(" ok, %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    Serial.println(" failed, retrying next loop");
}

// One HC-SR04 ping, in cm. NAN if no echo within ~5 m.
static float pingCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 30000);
  return us ? us / 58.0f : NAN;
}

// Median of 5 pings. The HC-SR04 jumps around, the median ignores the outliers.
static float distanceCm() {
  float v[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    float d = pingCm();
    if (!isnan(d)) v[n++] = d;
    delay(60); // let echoes die down
  }
  if (!n) return NAN;
  std::sort(v, v + n);
  return v[n / 2];
}

static float levelCm() {
#if SIMULATE
  // Drains 1 cm per reading from 25 cm to 5 cm, then refills. Low level shows up as an alert.
  static float level = 25;
  level -= 1;
  if (level < 5) level = 25;
  return level + random(-20, 21) / 100.0f;
#else
  float d = distanceCm();
  if (isnan(d)) return NAN;
  return constrain(TANK_DEPTH_CM - d, 0.0f, TANK_DEPTH_CM);
#endif
}

// 0-100 %. Not stored yet: the readings table has no soil column.
static int soilPercent() {
#if SIMULATE
  return 40 + random(-3, 4);
#else
  int raw = analogRead(PIN_SOIL);
  return constrain(map(raw, SOIL_DRY, SOIL_WET, 0, 100), 0, 100);
#endif
}

static bool send(float level) {
  WiFiClientSecure tls;
  tls.setInsecure(); // demo only: skips certificate checks
  HTTPClient http;
  http.begin(tls, String(SUPABASE_URL) + "/rest/v1/readings");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument doc;
  doc["probe_id"] = PROBE_ID;
  if (!isnan(level)) doc["level_cm"] = roundf(level * 10) / 10;
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
  Serial.printf("\nWai probe %s, %s mode\n", PROBE_ID, SIMULATE ? "SIMULATE" : "sensor");
  connectWifi();
}

void loop() {
  static unsigned long last = 0;
  if (last && millis() - last < SEND_INTERVAL_S * 1000UL) return;
  last = millis();

  connectWifi();
  float level = levelCm();
  int soil = soilPercent();
  Serial.printf("level %.1f cm, soil %d %%, up %lus, RSSI %d dBm\n",
                level, soil, millis() / 1000, WiFi.RSSI());

  if (WiFi.status() == WL_CONNECTED && send(level)) {
    digitalWrite(PIN_LED, HIGH); // blink on every successful send
    delay(100);
    digitalWrite(PIN_LED, LOW);
  }
}
