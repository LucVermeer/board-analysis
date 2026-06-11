export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://ws.boardsesh.com';
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.boardsesh.com';

// Whether session recording is ON by default. Only builds that opt in set this —
// the open TestFlight beta does, via ios-testflight-rn.yml. Production App Store
// builds leave it unset, so recording stays opt-in there. The shipped value is
// inlined at build time (EXPO_PUBLIC_* vars bake into the JS bundle).
export const SESSION_RECORDING_DEFAULTS_ON = process.env.EXPO_PUBLIC_SESSION_RECORDING_DEFAULT_ON === 'true';
