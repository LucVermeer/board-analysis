#include "led_controller.h"

// FastLED needs the chipset, data pin, and color order as compile-time tokens,
// so they are resolved from build flags here rather than passed at runtime.
// Defaults match the original Aurora/Kilter wiring; per-board build variants
// override them (e.g. the GLEDOPTO GL-C-015WL-D drives WS2811 nodes on GPIO16).
#ifndef LED_CHIPSET
#define LED_CHIPSET WS2812B
#endif
#ifndef LED_COLOR_ORDER
#define LED_COLOR_ORDER GRB
#endif

#if defined(TDISPLAY_LED_PIN)
#define LED_DATA_PIN TDISPLAY_LED_PIN
#elif defined(WAVESHARE_LED_PIN)
#define LED_DATA_PIN WAVESHARE_LED_PIN
#elif defined(WAVESHARE_AMOLED_LED_PIN)
#define LED_DATA_PIN WAVESHARE_AMOLED_LED_PIN
#elif defined(GLEDOPTO_LED_PIN)
#define LED_DATA_PIN GLEDOPTO_LED_PIN
#else
#define LED_DATA_PIN 5
#endif

LedController LEDs;

LedController::LedController() : numLeds(0), brightness(128), initialized(false) {
    memset(leds, 0, sizeof(leds));
}

void LedController::begin(uint8_t pin, uint16_t count) {
    numLeds = min(count, (uint16_t)MAX_LEDS);

    // FastLED.addLeds requires compile-time constants; chipset, pin, and color
    // order are resolved from build flags at the top of this file. The runtime
    // `pin` argument is retained for API compatibility but does not select the
    // pin (FastLED templates it).
    FastLED.addLeds<LED_CHIPSET, LED_DATA_PIN, LED_COLOR_ORDER>(leds, numLeds);

    FastLED.setBrightness(brightness);

    clear();
    show();

    initialized = true;
}

void LedController::setLed(int index, CRGB color) {
    if (index >= 0 && index < numLeds) {
        leds[index] = color;
    }
}

void LedController::setLed(int index, uint8_t r, uint8_t g, uint8_t b) {
    setLed(index, CRGB(r, g, b));
}

void LedController::setLeds(const LedCommand* commands, int count) {
    for (int i = 0; i < count; i++) {
        if (commands[i].position >= 0 && commands[i].position < numLeds) {
            leds[commands[i].position] = CRGB(commands[i].r, commands[i].g, commands[i].b);
        }
    }
}

void LedController::clear() {
    FastLED.clear();
}

void LedController::show() {
    FastLED.show();
}

void LedController::setBrightness(uint8_t b) {
    brightness = b;
    FastLED.setBrightness(brightness);
}

uint8_t LedController::getBrightness() {
    return brightness;
}

uint16_t LedController::getNumLeds() {
    return numLeds;
}

void LedController::blink(uint8_t r, uint8_t g, uint8_t b, int count, int delayMs) {
    for (int i = 0; i < count; i++) {
        for (int j = 0; j < numLeds; j++) {
            leds[j] = CRGB(r, g, b);
        }
        show();
        delay(delayMs);
        clear();
        show();
        delay(delayMs);
    }
}
