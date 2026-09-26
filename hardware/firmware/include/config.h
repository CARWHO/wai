#pragma once

// 1 = no sensors attached: sends a fake trough level that drains and refills.
// 0 = read the real HC-SR04 and soil sensor.
#define SIMULATE 0

// Pins
#define PIN_TRIG 5    // HC-SR04 Trig
#define PIN_ECHO 18   // HC-SR04 Echo, through a 1k/1.8k divider (5 V -> 3.3 V)
#define PIN_SOIL 34   // soil sensor S pin; ADC1 only, ADC2 doesn't work with Wi-Fi on
#define PIN_LED 2     // onboard LED on most ESP32 core boards
#define PIN_GPS_RX 16 // ESP32 RX <- GPS TX (XC3710, optional)
#define PIN_GPS_TX 17 // ESP32 TX -> GPS RX
#define GPS_BAUD 9600

#define FW_VERSION "0.2.0"

// Sensor to trough floor, in cm. Water level = this minus the measured distance.
#define TANK_DEPTH_CM 30.0f

// Soil sensor calibration: raw ADC in dry air and in a glass of water.
#define SOIL_DRY 0      // XC4604 reads 0 in air
#define SOIL_WET 1500   // and ~1300-1500 in a cup of water

// Seconds between readings. Short for the demo.
#define SEND_INTERVAL_S 5
