// Lazy per-namespace catalog loader. Authoring the dynamic import *inside* this
// package means the bundler (Next webpack/turbopack) builds its require context
// over this package's `locales/` directory, so web loads one namespace at a time
// instead of bundling every locale. Used via i18next-resources-to-backend.
export function loadCatalog(locale: string, namespace: string) {
  return import(`../locales/${locale}/${namespace}.json`);
}
