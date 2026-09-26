// HC-SR04 diagnostic: Trig IO5, Echo IO18. Prints hit rate per 10 pings.
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  pinMode(5, OUTPUT);
  pinMode(18, INPUT);
  digitalWrite(5, LOW);
}

void loop() {
  int hits = 0;
  String s;
  for (int i = 0; i < 10; i++) {
    digitalWrite(5, HIGH); delayMicroseconds(20); digitalWrite(5, LOW);
    unsigned long us = pulseIn(18, HIGH, 60000);
    if (us) hits++;
    s += String(us / 58.0, 1) + " ";
    delay(70);
  }
  Serial.printf("hits %d/10: %s| soil ADC %d\n", hits, s.c_str(), analogRead(34));
}
