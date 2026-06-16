# fastlane

Two screenshot upload lanes: one for App Store Connect, one for Google Play.

```bash
cd fastlane && bundle exec fastlane ios screenshots
cd fastlane && bundle exec fastlane android screenshots
```

The iOS lane uploads PNGs in `app-stores/apple/screenshots/iphone-16-pro-max/`
to App Store Connect as **screenshots only** — no binary, no text metadata, no
review submission. `deliver` routes each image to its display slot by pixel
dimensions; the `NN-` filename prefixes set the display order.

The Android lane uploads PNGs in `app-stores/google/screenshots/pixel-2/` to the
Google Play phone screenshot slot as **screenshots only** — no APK/AAB and no
text metadata. It stages them into fastlane `supply`'s expected
`en-US/images/phoneScreenshots/` structure.

iOS auth is an App Store Connect API key, read from the environment (same key as
the TestFlight workflows):

| Env var                        | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `APP_STORE_CONNECT_API_KEY_ID` | ASC API key id                        |
| `APP_STORE_CONNECT_ISSUER_ID`  | ASC API issuer id                     |
| `ASC_KEY_PATH`                 | path to the decoded `.p8` private key |

Android auth is the Play service account JSON:

| Env var                            | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play Developer API service account |

In CI these lanes run from the `Mobile Screenshots (Native)` workflow when
dispatched with `upload = true` (never on the nightly cron).
