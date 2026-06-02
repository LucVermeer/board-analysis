// Shared BLE scan timing constants. Kept in one place so the platform adapters
// (capacitor, native iOS) and their tests can't drift apart.

// How long a reconnect-by-serial waits for the stored board to advertise before
// falling back to the picker. Short enough that a missing board surfaces the
// picker quickly; long enough that a present board (which advertises within a
// second or two) reconnects silently without the picker ever flashing.
export const SERIAL_RECONNECT_GRACE_MS = 4_000;
