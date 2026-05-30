import type { BoardName, HoldState, LitUpHoldsMap } from '@boardsesh/shared-schema';

export type HoldCode = number;
export type HoldColor = string;
export type HoldRenderStyle = 'circle' | 'above-marker';

export type HoldStateInfo = {
  name: HoldState;
  color: HoldColor;
  displayColor?: HoldColor;
  renderStyle?: HoldRenderStyle;
};

// Canonical mapping of board-specific hold role codes to their state and LED colors.
// Each board product has its own set of role codes.
export const HOLD_STATE_MAP: Record<BoardName, Record<HoldCode, HoldStateInfo>> = {
  kilter: {
    // Product 1 – Kilter Board Original
    12: { name: 'STARTING', color: '#00FF00' },
    13: { name: 'HAND', color: '#00FFFF' },
    14: { name: 'FINISH', color: '#FF00FF' },
    15: { name: 'FOOT', color: '#FFAA00' },
    // Product 2 – JUUL
    20: { name: 'STARTING', color: '#00FF00' },
    21: { name: 'HAND', color: '#00FFFF' },
    22: { name: 'FINISH', color: '#FF00FF' },
    23: { name: 'FOOT', color: '#FFA500' },
    // Product 3 – Demo Board
    24: { name: 'STARTING', color: '#00FF00' },
    25: { name: 'HAND', color: '#00FFFF' },
    26: { name: 'FINISH', color: '#FF00FF' },
    27: { name: 'FOOT', color: '#FFA500' },
    // Product 4 – BKB Board
    28: { name: 'STARTING', color: '#00FF00' },
    29: { name: 'HAND', color: '#00FFFF' },
    30: { name: 'FINISH', color: '#FF00FF' },
    31: { name: 'FOOT', color: '#FFA500' },
    // Product 5 – Spire
    32: { name: 'STARTING', color: '#00FF00' },
    33: { name: 'HAND', color: '#00FFFF' },
    34: { name: 'FINISH', color: '#FF00FF' },
    35: { name: 'FOOT', color: '#FFA500' },
    // Product 6 – Tycho (color mode, no start/finish semantics)
    36: { name: 'HAND', color: '#00FFFF' },
    37: { name: 'HAND', color: '#FF00FF' },
    38: { name: 'HAND', color: '#FFFF00' },
    39: { name: 'HAND', color: '#00FF00' },
    40: { name: 'HAND', color: '#FF0000' },
    41: { name: 'HAND', color: '#0000FF' },
    // Product 7 – Kilter Board Homewall
    42: { name: 'STARTING', color: '#00FF00' },
    43: { name: 'HAND', color: '#00FFFF' },
    44: { name: 'FINISH', color: '#FF00FF' },
    45: { name: 'FOOT', color: '#FFAA00' },
  },
  tension: {
    1: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    2: { name: 'HAND', displayColor: '#4444FF', color: '#0000FF' },
    3: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    4: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
    5: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    6: { name: 'HAND', displayColor: '#4444FF', color: '#0000FF' },
    7: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    8: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
  },
  // MoonBoard hold states (no foot holds in standard climbs)
  // Values 42-44 are used by saved MoonBoard climbs.
  // Values 45-48 are additional live-BLE preview roles emitted by the ESP32 dev firmware.
  moonboard: {
    42: { name: 'STARTING', color: '#00FF00', displayColor: '#44FF44' },
    43: { name: 'HAND', color: '#0000FF', displayColor: '#4444FF' },
    44: { name: 'FINISH', color: '#FF0000', displayColor: '#FF3333' },
    45: { name: 'FOOT', color: '#00FFFF', displayColor: '#66F0FF' },
    46: { name: 'AUX', color: '#FFE066', displayColor: '#FFE066', renderStyle: 'above-marker' },
    47: { name: 'HAND', color: '#8B5CF6', displayColor: '#C084FC' },
    48: { name: 'HAND', color: '#FF4FA3', displayColor: '#FF7DBB' },
  },
  // New Aurora boards use the same 1/2/3/4 role codes as Tension-style layouts.
  decoy: {
    1: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    2: { name: 'HAND', displayColor: '#0000FF', color: '#0000FF' },
    3: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    4: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
  },
  touchstone: {
    1: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    2: { name: 'HAND', displayColor: '#4444FF', color: '#0000FF' },
    3: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    4: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
  },
  grasshopper: {
    1: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    2: { name: 'HAND', displayColor: '#4455FF', color: '#0000FF' },
    3: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    4: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
  },
  soill: {
    1: { name: 'STARTING', displayColor: '#00DD00', color: '#00FF00' },
    2: { name: 'HAND', displayColor: '#4444FF', color: '#0000FF' },
    3: { name: 'FINISH', displayColor: '#FF0000', color: '#FF0000' },
    4: { name: 'FOOT', displayColor: '#FF00FF', color: '#FF00FF' },
  },
};

// The canonical role code used when *writing* frame strings for each board.
// Boards with multiple products (e.g., Kilter Products 1-7) share the same
// state names but use different numeric codes per product. This map picks a
// single canonical code per state that matches what the Aurora API and BLE
// protocol expect. These cannot be derived from HOLD_STATE_MAP automatically
// because "which product is canonical" varies by board.
export const STATE_TO_PRIMARY_CODE: Record<BoardName, Partial<Record<HoldState, HoldCode>>> = {
  // Product 7 – Kilter Board Homewall (current canonical product)
  kilter: { STARTING: 42, HAND: 43, FINISH: 44, FOOT: 45 },
  // Product 1 – Tension (canonical)
  tension: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
  // MoonBoard (codes 42-44 are the saved-climb codes; 45-48 are BLE preview only)
  moonboard: { STARTING: 42, HAND: 43, FINISH: 44 },
  decoy: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
  touchstone: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
  grasshopper: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
  soill: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
};

// Warned hold states to avoid log spam
const warnedHoldStates = new Set<string>();

/**
 * Split a comma-separated frames string into one snapshot per index.
 * The Aurora frames format encodes multi-frame animations as
 * `p<hold>r<role>p<hold>r<role>,p<hold>r<role>,...`. Each comma-separated
 * segment is a self-contained snapshot suitable for the BLE encoder
 * (`getAuroraBluetoothPacket`), which itself never splits on commas.
 *
 * Returns an empty array for the empty string. Strips empty segments so
 * trailing commas don't produce phantom frames.
 */
export function splitFramesString(frames: string): string[] {
  if (!frames) return [];
  return frames.split(',').filter((segment) => segment.length > 0);
}

/**
 * Convert lit up holds string to a map of frames.
 * Each frame maps hold IDs to their state, color, and display color.
 */
export function convertLitUpHoldsStringToMap(litUpHolds: string, board: BoardName): Record<number, LitUpHoldsMap> {
  return litUpHolds
    .split(',')
    .filter((frame) => frame)
    .reduce(
      (frameMap, frameString, frameIndex) => {
        const frameHoldsMap = Object.fromEntries(
          frameString
            .split('p')
            .filter((hold) => hold)
            .map((holdData) => holdData.split('r').map((str) => Number(str)))
            .map(([holdId, stateCode]) => {
              const stateInfo = HOLD_STATE_MAP[board]?.[stateCode];
              if (!stateInfo) {
                const warnKey = `${board}:${stateCode}`;
                if (!warnedHoldStates.has(warnKey)) {
                  warnedHoldStates.add(warnKey);
                  console.warn(
                    `HOLD_STATE_MAP is missing values for ${board} status code: ${stateCode} (this warning is only shown once per status code)`,
                  );
                }
                return [
                  holdId || 0,
                  {
                    state: `${holdId}=${stateCode}` as HoldState,
                    color: '#FFF',
                    displayColor: '#FFF',
                  },
                ];
              }
              const { name, color, displayColor } = stateInfo;
              return [holdId, { state: name, color, displayColor: displayColor || color }];
            }),
        );
        frameMap[frameIndex] = frameHoldsMap as LitUpHoldsMap;
        return frameMap;
      },
      {} as Record<number, LitUpHoldsMap>,
    );
}
