// localStorage mirror key for the saved colour mode. IndexedDB
// ('boardsesh-user-preferences') stays the source of truth, but it can't be
// read synchronously before first paint — this mirror can. color-mode-provider
// writes it through on every change; the pre-paint script below reads it.
export const COLOR_MODE_MIRROR_KEY = 'boardsesh:colorMode';

// Inline script that runs in <head> before first paint to set data-theme on
// <html>, killing the dark flash for light-theme users and honouring the OS
// preference for new visitors. Kept as a string (not a real function) so the
// same source feeds the root layout and the global-error boundary, and so it
// can be unit-tested by evaluating it with stubbed globals.
//
// Order: saved mirror value wins; anything else (missing, garbage, or a
// storage exception in private mode) falls back to prefers-color-scheme, light
// when the OS is light. The whole body is try/catch-wrapped so a failure here
// can never block the page from rendering.
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(
  COLOR_MODE_MIRROR_KEY,
)});}catch(e){}if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
