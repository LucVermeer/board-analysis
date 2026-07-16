/**
 * Module-scope cache for `Intl.DateTimeFormat` / `Intl.NumberFormat` instances,
 * keyed by locale + options (#3155).
 *
 * On Hermes-with-ICU, constructing an `Intl` formatter calls
 * `Intl.getCanonicalLocales` internally, which showed up as ~95–118ms self-time
 * when the You/Profile tab mounted (Pixel 8 Pro profiling session). The worst
 * offender was a fresh `Intl.DateTimeFormat` built **per logbook row** on every
 * render; the You-page stat cards paid the same cost via `toLocaleString()`,
 * which is sugar for `new Intl.NumberFormat(locale).format(value)`.
 *
 * `Intl.DateTimeFormat` / `Intl.NumberFormat` are safe to use on Hermes (unlike
 * `Intl.RelativeTimeFormat` / `Intl.ListFormat`, which are lint-blocked
 * repo-wide for `packages/mobile` — see the `no-restricted-properties` block in
 * the root `vite.config.ts`).
 */

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function cacheKey(locale: string | string[] | undefined, options: object | undefined): string {
  return JSON.stringify([locale ?? null, options ?? {}]);
}

/** Cached `Intl.DateTimeFormat` for the given locale + options. */
export function getCachedDateTimeFormat(
  locale: string | string[] | undefined,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = cacheKey(locale, options);
  const cached = dateTimeFormatCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormatCache.set(key, formatter);
  return formatter;
}

/** Cached `Intl.NumberFormat` for the given locale + options. */
export function getCachedNumberFormat(
  locale: string | string[] | undefined,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = cacheKey(locale, options);
  const cached = numberFormatCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  numberFormatCache.set(key, formatter);
  return formatter;
}
