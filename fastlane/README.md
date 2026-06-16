# fastlane

One lane: upload the native App Store screenshots to App Store Connect.

```bash
cd fastlane && bundle exec fastlane ios screenshots
```

It uploads the PNGs in `app-stores/apple/screenshots/iphone-16-pro-max/`
(captured by `vp run mobile:screenshots`) as **screenshots only** — no binary,
no text metadata, no review submission. deliver routes each image to its display
slot by pixel dimensions; the `NN-` filename prefixes set the display order.

Auth is an App Store Connect API key, read from the environment (same key as the
TestFlight workflows):

| Env var                        | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `APP_STORE_CONNECT_API_KEY_ID` | ASC API key id                        |
| `APP_STORE_CONNECT_ISSUER_ID`  | ASC API issuer id                     |
| `ASC_KEY_PATH`                 | path to the decoded `.p8` private key |

In CI this runs from the `Mobile Screenshots (Native)` workflow when dispatched
with `upload = true` (it's never on the nightly cron). The upload targets the
currently **editable** App Store version — see the "Automated screenshot upload"
section of `../app-stores/apple/app-store-submission-guide.md` for the
editable-version caveat and the full flow.
