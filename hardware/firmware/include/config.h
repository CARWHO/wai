#pragma once

// 1 = no sensors attached: sends a fake trough level that drains and refills.
// 0 = read the real HC-SR04 and soil sensor.
#define SIMULATE 1

// Pins
#define PIN_TRIG 5    // HC-SR04 Trig
#define PIN_ECHO 18   // HC-SR04 Echo, through a 1k/1.8k divider (5 V -> 3.3 V)
#define PIN_SOIL 34   // soil sensor S pin; ADC1 only, ADC2 doesn't work with Wi-Fi on
#define PIN_LED 2     // onboard LED on most ESP32 core boards

// Sensor to trough floor, in cm. Water level = this minus the measured distance.
#define TANK_DEPTH_CM 30.0f

// Soil sensor calibration: raw ADC in dry air and in a glass of water.
#define SOIL_DRY 3200
#define SOIL_WET 1300

// Seconds between readings. Short for the demo.
#define SEND_INTERVAL_S 5
