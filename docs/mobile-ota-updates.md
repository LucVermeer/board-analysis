# Mobile OTA updates (production: self-hosted expo-open-ota)

How JS/TS-only fixes reach the `packages/mobile` app without a new native build.

`expo-updates` speaks an open protocol, so we self-host the manifest + asset server with
[expo-open-ota](https://github.com/axelmarciano/expo-open-ota) instead of paying for EAS Update
hosting. The only thing we keep from Expo is a **free** account/token — the server uses Expo's
API for channel↔branch metadata, but serves manifests and bundles from our own storage, so
there's no MAU/bandwidth billing.

## Two hosting paths (don't mix them up)

|                | Preview / dev                            | Production                                                                                      |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Built by       | `eas build` (`mobile:preview-build`)     | bare `expo prebuild` + xcodebuild/gradle (the `ios-testflight-rn` / `android-apk-rn` workflows) |
| Hosting        | EAS free tier (`u.expo.dev`)             | self-hosted expo-open-ota                                                                       |
| Channel source | `channel` in `eas.json`                  | `expo-channel-name` request header baked in by `expo prebuild`                                  |
| Publish        | `vp run mobile:publish` (→ `eas update`) | `vp run mobile:publish -- --channel production` (→ `eoas publish`)                              |

The split is decided in `packages/mobile/app.config.ts` (`resolveUpdatesConfig`): when
`EAS_BUILD` is set it returns the EAS URL; otherwise it uses `EXPO_UPDATES_URL` (the self-hosted
server). Until `EXPO_UPDATES_URL` is set, it falls back to the EAS URL so builds still succeed and
OTA is simply inert.

## How the production path works

1. **Build time** (`expo prebuild`): `EXPO_UPDATES_CHANNEL=production` →
   `updates.requestHeaders['expo-channel-name'] = 'production'` is injected into `Expo.plist`
   (`EXUpdatesRequestHeaders`) and `AndroidManifest.xml`. `updates.url` points at our server. The
   public code-signing cert (`certs/certificate.pem`) is embedded.
2. **Runtime**: on launch the app asks `<server>/manifest` with its channel + runtimeVersion
   headers. The server returns the latest signed update on the branch mapped to that channel; the
   app verifies the signature against the embedded cert and applies it on next launch.
3. **runtimeVersion** uses the `appVersion` policy (= the `version` in `app.config.ts`, `2.0.0`).
   An update only reaches a binary with the **same** runtimeVersion. **Bumping `version` requires
   a fresh native build (TestFlight/Play) before OTAs for that version flow** — and any change to
   native code/deps always needs a new build, never OTA.

## Publishing a production update

From `main`, once the server is deployed and you're logged in (`bunx eas login`, or `EXPO_TOKEN`
set):

```sh
EXPO_UPDATES_URL=https://ota.boardsesh.com/manifest \
  vp run mobile:publish -- --channel production --message "fix: <what>"
```

This runs `eoas publish --branch production`, which does an `expo export` and uploads the bundle
to our storage via the server. `eoas` reads the server URL from `updates.url` in `app.config.ts`,
so `EXPO_UPDATES_URL` must be present. Kept manual on purpose: a `main` push already triggers the
~60-min native builds, and a JS-only fix shouldn't force a native rebuild.

## One-time setup (infra — done outside this repo)

1. **Storage bucket** — S3-compatible (Cloudflare R2 / S3 / Spaces). Keep it portable (see the
   Railway/object-storage rules in `CLAUDE.md`).
2. **Code-signing keys** — from `packages/mobile/`:
   ```sh
   bunx eoas generate-certs
   ```
   Produces `certs/certificate.pem` (commit — already whitelisted in `.gitignore`),
   `certs/private-key.pem` + `certs/public-key.pem` (**never commit** — gitignored; these go to
   the server).
3. **Deploy the server** — [Railway template](https://axelmarciano.github.io/expo-open-ota/docs/deployment/railway)
   or Docker/Helm. Required env (see the
   [env reference](https://axelmarciano.github.io/expo-open-ota/docs/reference/environment)):
   - `BASE_URL` = `https://ota.boardsesh.com`
   - `JWT_SECRET` = random string
   - `EXPO_APP_ID` = `87499648-655e-4fb8-9856-65da37e55fb1` (our Expo project id)
   - `EXPO_ACCESS_TOKEN` = an Expo token (same value as the `EXPO_TOKEN` CI secret)
   - `CACHE_MODE` = `local` (or `redis`)
   - `STORAGE_MODE` = `s3`, plus `S3_BUCKET_NAME`, `AWS_REGION`, `AWS_BASE_ENDPOINT` (R2), and
     `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
   - `KEYS_STORAGE_TYPE` = `environment`, plus `PUBLIC_EXPO_KEY_B64` / `PRIVATE_EXPO_KEY_B64`
     (base64 of the keys from step 2)
   - optional: `USE_DASHBOARD=true` + `ADMIN_PASSWORD` for the monitoring web UI
4. **DNS** — point `ota.boardsesh.com` at the deployed server (CDN-front if desired).
5. **GitHub config** — set repo **variable** `EXPO_UPDATES_URL=https://ota.boardsesh.com/manifest`
   (consumed by both release workflows) and confirm the `EXPO_TOKEN` secret exists.
6. **Channel/branch** — create the `production` channel + branch on the Expo project (the server
   reads the mapping from Expo's API) and map channel `production` → branch `production`.

## Verify end to end

1. Local config check: `cd packages/mobile && EXPO_UPDATES_URL=https://example.test/manifest
EXPO_UPDATES_CHANNEL=production bunx expo prebuild --platform ios --clean --no-install`, then
   confirm `ios/Boardsesh/Supporting/Expo.plist` has `EXUpdatesRequestHeaders` →
   `expo-channel-name=production`. Repeat `--platform android` and grep `AndroidManifest.xml`.
2. Ship one native TestFlight build from `main` (bakes in channel + server URL + cert).
3. Make a trivial JS change, run the publish command above, relaunch the TestFlight app, and
   confirm the OTA downloads and applies.

## Deferred

- **`beta` channel**: TestFlight on `beta`, App Store on `production`, promote at GA.
- **Migrate the preview/dev-branch flow + in-app `BranchSwitcher`** (`src/lib/eas-api.ts`) off EAS
  hosting onto expo-open-ota, to drop the Expo dependency entirely.
