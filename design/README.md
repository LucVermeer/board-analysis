# Boardsesh asset pack

Generated from the V11/V12/V13/V15 black-circle icon variant.
Mark uses existing V-grade tokens directly, ascending in reading order from top-left:
TL=V11 #9C27B0 · TR=V12 #7B1FA2 · BL=V13 #6A1B9A · BR=V15 #4A148C.

Regenerate the canonical web, iOS, legacy Android, and social PNGs from
`svg/icon-master.svg` with `bun scripts/rasterise-brand-assets.ts`.

Exception: `mobile-rn-logo/` contains the user-created raster logo used by the
React Native/Expo rewrite in `packages/mobile/assets/`. That artwork was
provided as a PNG rather than an editable SVG, so it has its own documented
ImageMagick workflow and provenance in `mobile-rn-logo/README.md`. The
`scripts/rasterise-brand-assets.ts` pipeline does not regenerate those Expo
assets.

## Contents

- `svg/` — vector sources for every asset (use these for further editing)
- `web/` — favicon PNGs at every standard size + manifest
- `ios/` — iOS app icon PNGs
- `android/` — Android launcher PNGs (legacy) + adaptive icon SVGs
- `social/` — Open Graph / Twitter share image (1200×630 PNG)
- `mobile-rn-logo/` — raster source, transparent master, and workflow for the
  React Native/Expo app assets in `packages/mobile/assets/`

## HTML head snippet

See the "HTML drop-in" section on the assets page or the manifest below.

## Notes

- Except for the documented React Native/Expo raster-logo exception, PNGs are
  rasterised from the same canonical SVG so they're pixel-consistent.
- For PWA, use the 192px and 512px PNGs in `manifest.webmanifest`.
- Android adaptive icon: combine `ic_launcher_foreground.svg` + `ic_launcher_background.svg` per Android docs.
