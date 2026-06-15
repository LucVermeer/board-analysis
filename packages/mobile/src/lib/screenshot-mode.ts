import {
  isThemeOverride,
  isUiVariantPreference,
  type ThemeOverride,
  type UiVariantPreference,
} from '@boardsesh/key-value-storage';

/**
 * Build-time screenshot mode. The dedicated screenshots build (see
 * `scripts/mobile-screenshots.ts`) is compiled with
 * `EXPO_PUBLIC_SCREENSHOT_MODE=1`; every normal build leaves the var unset, so
 * `SCREENSHOT_MODE` is `false` and the branches that read it dead-strip. This is
 * the native analogue of the web app-store flow's `sessionStorage` flags
 * (`boardsesh:e2e-bluetooth-picker`, `boardsesh:e2e-suppress-install-card`): a
 * presentation-stability switch, not a data-mocking layer — the seeded backend
 * stays the source of truth.
 */
export const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';

/**
 * Theme the screenshots build locks to so a capture can't flip mid-run when
 * SecureStore hydrates. Defaults to light; override per run with
 * `EXPO_PUBLIC_SCREENSHOT_THEME=dark`.
 */
const screenshotThemeEnv = process.env.EXPO_PUBLIC_SCREENSHOT_THEME;
export const SCREENSHOT_THEME_OVERRIDE: ThemeOverride = isThemeOverride(screenshotThemeEnv)
  ? screenshotThemeEnv
  : 'light';

/**
 * UI variant the screenshots build locks to. Defaults to `'auto'`, which already
 * resolves to Liquid Glass on iOS and Material on Android — the platform-native
 * look we want for store listings. Force one explicitly (e.g. to shoot the
 * Material skin on iOS) with `EXPO_PUBLIC_SCREENSHOT_VARIANT=material`.
 */
const screenshotVariantEnv = process.env.EXPO_PUBLIC_SCREENSHOT_VARIANT;
export const SCREENSHOT_VARIANT_PREFERENCE: UiVariantPreference = isUiVariantPreference(screenshotVariantEnv)
  ? screenshotVariantEnv
  : 'auto';
