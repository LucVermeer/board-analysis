# App store assets

Submission assets and listing copy for the `packages/mobile` React Native app,
grouped by store. (This is **not** the old Capacitor app under the top-level
`mobile/` directory.)

```
app-stores/
  apple/
    app-store-submission-guide.md   # how to submit to App Store Connect
    app-store-metadata.md           # listing copy: name, subtitle, keywords, description
    screenshots/<device>/           # generated on demand, gitignored (not committed)
  google/
    play-store-submission-guide.md
    play-store-metadata.md
    screenshots/<device>/           # populated when the Android capture lands
```

## Screenshots

The screenshots are captured from the real native app by the Maestro pipeline:

```bash
vp run mobile:screenshots -- --platform ios --backend prod --theme dark
```

It writes to `app-stores/<store>/screenshots/<device>/` (`ios` → `apple`,
`android` → `google`). Dark is the default; pass `--theme light` for a light set.
See `packages/mobile/.maestro/README.md` for prerequisites and how it works.

The captured PNGs are **gitignored** — they're regenerated on demand and uploaded
to App Store Connect by the `Mobile Screenshots (Native)` workflow (run it with
`upload = true`). See `apple/app-store-submission-guide.md` for the upload flow.
