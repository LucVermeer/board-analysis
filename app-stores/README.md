# App store assets

Submission assets and listing copy for the `packages/mobile` React Native app,
grouped by store. (This is **not** the old Capacitor app under the top-level
`mobile/` directory.)

```
app-stores/
  apple/
    app-store-submission-guide.md   # how to submit to App Store Connect
    app-store-metadata.md           # listing copy: name, subtitle, keywords, description
    screenshots/<device>/           # e.g. iphone-16-pro-max/00-home.png …
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
