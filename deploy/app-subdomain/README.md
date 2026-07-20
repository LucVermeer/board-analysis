# `deploy/app-subdomain/` — Cloudflare Pages config for app.boardsesh.com

These two files (`_redirects`, `_headers`) are copied into the standalone Expo
web export at deploy time and shipped to the `boardsesh-app` Cloudflare Pages
project. They are **not** part of the export itself — the export recipe
(`scripts/build-expo-web-export.sh --subdomain`) emits a `baseUrl /` static SPA;
this directory adds the host-level SPA fallback and caching rules Pages needs.

The deploy pipeline that consumes them is
`.github/workflows/app-web-deploy.yml`.

## `_redirects` — SPA fallback

```
/*    /index.html    200
```

Expo Router is a single-page app. Any path that is not a real file (deep links
like `/climbs`, `/auth/callback?transferToken=…`) has to serve the exported
`index.html` shell with a `200`. Cloudflare Pages matches real files first, so
`_expo/*`, `assets/*`, `wasm/*`, and `index.html` serve directly; everything
else falls through to the shell.

## `_headers` — security + caching

- `X-Robots-Tag: noindex` — this is an authenticated utility surface, kept out of
  search indexes (mirrors the `/app` surface's `noindex`, see docs/expo-web.md).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  — standard hardening.
- `/_expo/*` and `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`.
  These paths are **content-hashed** (the filename changes whenever the content
  does), so they're safe to cache forever.
- `index.html` and `wasm/*` get **no** cache override — they have fixed
  filenames, so they must revalidate. A cached `index.html` would mask a deploy;
  a cached WASM binary would pin an old renderer.

## The one hard rule: no CSP `script-src`

**Never add a `Content-Security-Policy` with a `script-src` to `_headers`.** The
`@boardsesh/board-renderer-wasm` glue instantiates the WASM module via
`new Function(...)`, so the renderer depends on `unsafe-eval` /
`wasm-unsafe-eval` being permitted. A strict `script-src` (without those
allowances) breaks board rendering outright. This is the same constraint the
`/app` surface documents — see the "WASM glue needs `Function()`" note in
`docs/expo-web.md`.

## Why `EXPO_PUBLIC_WEB_URL` is www, not app

The production export bakes `EXPO_PUBLIC_WEB_URL=https://www.boardsesh.com` — the
**auth origin**, deliberately www and not app.boardsesh.com. The SPA does
credentialed cross-origin auth against www; app.boardsesh.com is only where the
static shell is served. See `docs/expo-web-deployment.md`.
