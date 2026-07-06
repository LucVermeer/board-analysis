#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H

#include "version.h"

// Device identification
#define DEVICE_NAME "Boardsesh Controller"

// LED configuration
// Note: GPIO 5 conflicts with LCD_RST on T-Display-S3.
// Use TDISPLAY_LED_PIN, WAVESHARE_LED_PIN, WAVESHARE_AMOLED_LED_PIN, or
// GLEDOPTO_LED_PIN build flags to override the data pin per board variant.
// Keep this cascade in sync with led_controller.cpp's LED_DATA_PIN cascade.
#ifdef TDISPLAY_LED_PIN
#define LED_PIN TDISPLAY_LED_PIN
#elif defined(WAVESHARE_LED_PIN)
#define LED_PIN WAVESHARE_LED_PIN
#elif defined(WAVESHARE_AMOLED_LED_PIN)
#define LED_PIN WAVESHARE_AMOLED_LED_PIN
#elif defined(GLEDOPTO_LED_PIN)
#define LED_PIN GLEDOPTO_LED_PIN
#else
#define LED_PIN 5  // GPIO pin for LED data (default for non-display builds)
#endif

// Number of LEDs on the string. Override per variant with -D NUM_LEDS=<n>.
#ifndef NUM_LEDS
#define NUM_LEDS 200
#endif

// LED chipset + color order. The actual FastLED driver in led_controller.cpp
// consumes the LED_CHIPSET / LED_COLOR_ORDER build flags; these mirror them so
// the declarative config and the driver stay in agreement.
#ifndef LED_CHIPSET
#define LED_CHIPSET WS2812B
#endif
#ifndef LED_COLOR_ORDER
#define LED_COLOR_ORDER GRB
#endif
#define LED_TYPE LED_CHIPSET         // LED strip type
#define COLOR_ORDER LED_COLOR_ORDER  // Color order

// Default brightness (0-255)
#define DEFAULT_BRIGHTNESS 128

// Button configuration (T-Display-S3 built-in buttons)
// Waveshare uses touch instead of physical buttons, and GPIO14 is an RGB data pin
#if defined(ENABLE_DISPLAY) && !defined(ENABLE_WAVESHARE_DISPLAY)
#define BUTTON_1_PIN 0   // GPIO0 - Boot button
#define BUTTON_2_PIN 14  // GPIO14 - User button
#endif

// BLE configuration
// Match the Aurora/Kilter board name format so the official app discovers this
// debug controller as a test board.
#define BLE_DEVICE_NAME "Kilter Board#123456@3"

// Backend configuration (defaults)
#define DEFAULT_BACKEND_HOST "ws.boardsesh.com"
#define DEFAULT_BACKEND_PORT 443
#define DEFAULT_BACKEND_PATH "/graphql"
#ifndef DEFAULT_RENDER_BASE_URL
#define DEFAULT_RENDER_BASE_URL "https://www.boardsesh.com"
#endif

// Local BLE preview configuration for the 2.1" debug controller.
// These values can be overridden from the ESP32 configuration page.
#define DEFAULT_PREVIEW_BOARD_NAME "kilter"
#define DEFAULT_PREVIEW_LAYOUT_ID 8
#define DEFAULT_PREVIEW_SIZE_ID 25
#define DEFAULT_PREVIEW_SET_IDS "26,27,28,29"

// Web server
#define WEB_SERVER_PORT 80

// Debug options
#define DEBUG_SERIAL true
#define DEBUG_BLE true

#endif
