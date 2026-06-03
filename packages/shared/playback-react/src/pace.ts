/**
 * Default per-frame pace when a climb does not specify `framesPace`. The
 * Aurora encoding leaves this at 0 for static climbs and the unit is not
 * documented anywhere in this repo; QA can tune the constant once we have
 * a known multi-frame climb to calibrate against.
 */
export const DEFAULT_PACE_MS = 750;

/**
 * Lower bound on per-frame pace. The BLE transport chunks payloads at 20
 * bytes with a 5 ms inter-chunk delay, so the worst-case packet (13
 * chunks, ~260-byte climb) spends ~65 ms in inter-chunk gaps alone before
 * the GATT round-trip on top. A 50 ms floor was below physical throughput
 * and produced "GATT operation already in progress" errors on Android.
 * 200 ms gives every realistic packet headroom to flush while still
 * looking fast on a route.
 */
export const MIN_PACE_MS = 200;
