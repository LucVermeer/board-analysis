# Mobile OTA updates (production: self-hosted expo-open-ota)

How JS/TS-only fixes reach the `packages/mobile` app without a new native build.

`expo-updates` speaks an open protocol, so we self-host the manifest + asset server with
[expo-open-ota](https://github.com/axelmarciano/expo-open-ota) instead of paying for EAS Update
hosting. The only thing we keep from Expo is a **free** account/token — the server uses Expo's
API for channel↔branch metadata, but serves manifests and bundles from our own storage, so
there's no MAU/bandwidth billing.

## Two hosting paths (don't mix them up)

|                | Preview / dev                            | Production                                                                                                                       |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Built by       | `eas build` (`mobile:preview-build`)     | bare `expo prebuild` + xcodebuild/gradle (the `ios-testflight-rn` / `android-apk-rn` workflows)                                  |
| Hosting        | EAS free tier (`u.expo.dev`)             | self-hosted expo-open-ota                                                                                                        |
| Channel source | `channel` in `eas.json`                  | `expo-channel-name` request header baked in by `expo prebuild`                                                                   |
| Publish        | `vp run mobile:publish` (→ `eas update`) | auto on push to `main` (`mobile-ota-production.yml`); manual: `vp run mobile:publish -- --channel production` (→ `eoas publish`) |

The split is decided in `packages/mobile/app.config.ts` (`resolveUpdatesConfig`): when
`EAS_BUILD` is set it returns the EAS URL; otherwise it uses the self-hosted server — but **only
when both `EXPO_UPDATES_URL` and the signing cert `certs/certificate.pem` are present** (fail
closed). Until both exist it falls back to the EAS URL so builds still succeed and OTA is simply
inert. The cert gate matters: baking the self-hosted update URL into a binary _without_ code
signing would let a compromised manifest host (or a network MITM) push arbitrary JS to every
install, since the device couldn't verify the manifest came from us.

## How the production path works

1. **Build time** (`expo prebuild`): `EXPO_UPDATES_CHANNEL=production` →
   `updates.requestHeaders['expo-channel-name'] = 'production'` is injected into `Expo.plist`
   (`EXUpdatesRequestHeaders`) and `AndroidManifest.xml`. `updates.url` points at our server. The
   public code-signing cert (`certs/certificate.pem`) is embedded.
2. **Runtime**: on launch the app asks `<server>/manifest` with its channel + runtimeVersion
   headers. The server returns the latest signed update on the branch mapped to that channel; the
   app verifies the signature against the embedded cert and applies it on next launch.
3. **runtimeVersion** uses the **`fingerprint`** policy — a hash of the native project (deps,
   config plugins, entitlements, native dirs), resolved by Expo's bundled `@expo/fingerprint`. An
   update only reaches a binary with the **same** fingerprint, so a JS-only change keeps the same
   fingerprint (the OTA lands) while **any native change yields a new fingerprint** — the OTA is
   intrinsically incompatible with old binaries and isn't delivered (they keep their embedded
   bundle until a store build with the new fingerprint ships). This removes the `appVersion`
   footgun where a native change without a manual `version` bump could push JS to a binary lacking
   the native capability it needs. The `version` field (`2.0.0`) is now just the store/marketing
   version, decoupled from OTA compatibility. Resolve the current value with
   `bunx expo-updates runtimeversion:resolve --platform ios|android` (from `packages/mobile/`).

## Publishing a production update

**Automatic.** Every push to `main` that touches the mobile app runs
`.github/workflows/mobile-ota-production.yml`, which publishes a production OTA. Because
runtimeVersion is a fingerprint, this is safe to run on every push: a native change publishes an
OTA whose fingerprint no current binary has yet, so it only lands once the matching store build
ships. Until the server is wired (no `EXPO_UPDATES_URL` variable or committed cert), the workflow
skips with a green no-op.

**Manual** (one branch, ad hoc) — once the server is deployed and you're logged in (`bunx eas
login`, or `EXPO_TOKEN` set):

```sh
EXPO_UPDATES_URL=https://ota.boardsesh.com/manifest \
  vp run mobile:publish -- --channel production --message "fix: <what>"
```

This runs `eoas publish --branch production`, which does an `expo export` and uploads the bundle
to our storage via the server. `eoas` reads the server URL from `updates.url` in `app.config.ts`,
so `EXPO_UPDATES_URL` must be present.

### Fingerprint parity — the one rule that matters

The published fingerprint must equal the one the native build baked into the binary, or the OTA
silently never lands. The fingerprint hashes the **resolved Expo config** and native files — **not**
the JS bundle — so the publish must resolve `app.config.ts` to the same config the native
`expo prebuild` did. The config-affecting env that must match is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
(drives the google-signin plugin's native `iosUrlScheme`), `GOOGLE_MAPS_API_KEY` (drives
`android.config`), and — once the committed cert activates the self-hosted `updates` block —
`EXPO_UPDATES_URL` + `EXPO_UPDATES_CHANNEL`. The other `EXPO_PUBLIC_*` are inlined into the JS
bundle (not the fingerprint); they must still match so the OTA points at the right backend and
analytics, but drift there is a runtime bug, not a delivery failure. Two mechanisms, both
enforced/handled in CI:

- **Env parity.** `mobile-ota-production.yml` declares the same `EXPO_PUBLIC_*` + `EXPO_UPDATES_*`
  env as `ios-testflight-rn.yml` / `android-apk-rn.yml`. `scripts/mobile-ci-env-parity.test.ts`
  fails the build if they drift.
- **Per-platform publish.** `GOOGLE_MAPS_API_KEY` is set only on the Android prebuild (iOS uses
  Apple Maps) and it changes the resolved config — hence the fingerprint — for **both** platforms.
  So the workflow publishes iOS **without** the key and Android **with** it, in separate steps. A
  single `--platform all` publish with one env could only ever match one side.

## One-time setup (infra — done outside this repo)

`vp run mobile:ota-setup` scripts the in-repo phases (cert generation, the Railway env block, the
Expo channel/branch, the GitHub variable); the cloud actions (bucket, server, DNS) stay manual.
Run `vp run mobile:ota-setup` with no argument for the ordered runbook.

1. **Storage bucket** — reuse the existing S3-compatible provider (the one
   `packages/backend/src/storage/s3.ts` uses) with a dedicated `boardsesh-ota` bucket + a scoped
   token. Keep it portable (see the Railway/object-storage rules in `CLAUDE.md`).
2. **Code-signing keys** — `vp run mobile:ota-setup keys` (runs `bunx eoas@2 generate-certs` in
   `packages/mobile/` and prints the Railway env block with the base64 keys filled in). Produces
   `certs/certificate.pem` (commit — already whitelisted in `.gitignore`) plus the gitignored
   `certs/private-key.pem` and `certs/public-key.pem` (**never commit** — these go to the server).
   The committed cert is what flips production builds onto the self-hosted path:
   `resolveUpdatesConfig` stays on EAS until the cert exists, so generate and commit it before
   relying on the `EXPO_UPDATES_URL` variable.
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
5. **GitHub config** — `vp run mobile:ota-setup github --url https://ota.boardsesh.com/manifest`
   sets the repo **variable** `EXPO_UPDATES_URL` (consumed by the two native build workflows + the
   OTA publish workflow) and confirms the `EXPO_TOKEN` secret exists. `GOOGLE_MAPS_API_KEY` must
   also exist as a secret (already used by the Android build).
6. **Channel/branch** — `vp run mobile:ota-setup expo` creates the `production` channel + branch on
   the Expo project (the server reads the mapping from Expo's API) and maps channel `production` →
   branch `production`.

## Verify end to end

1. Local config check (the cert gate means you must generate certs first, else the config falls
   back to EAS and injects no channel header): `cd packages/mobile && bunx eoas@2 generate-certs`,
   then `EXPO_UPDATES_URL=https://example.test/manifest EXPO_UPDATES_CHANNEL=production bunx expo
prebuild --platform ios --clean --no-install`, then confirm `ios/Boardsesh/Supporting/Expo.plist`
   has `EXUpdatesRequestHeaders` → `expo-channel-name=production` and an `EXUpdatesCodeSigning*`
   entry. Repeat `--platform android` and grep `AndroidManifest.xml`.
2. **Fingerprint parity (the critical check)** — the fingerprint the publish CI computes (Linux)
   must equal the one the native build embedded (macOS for iOS). Resolve it the same way the build
   does: `cd packages/mobile && bunx expo-updates runtimeversion:resolve --platform ios` with the
   **same env the native build uses** (`EXPO_UPDATES_URL`, `EXPO_UPDATES_CHANNEL=production`, the
   `EXPO_PUBLIC_*` set; no `GOOGLE_MAPS_API_KEY` for iOS, with it for android), and confirm it
   matches the binary's `EXUpdatesRuntimeVersion`. If they differ, OTAs for that platform never
   land — recheck env parity (`scripts/mobile-ci-env-parity.test.ts`) and the per-platform
   `GOOGLE_MAPS_API_KEY` split.
3. Ship one native TestFlight build from `main` (bakes in the fingerprint runtimeVersion + server
   URL + cert). Existing `appVersion`-era installs won't receive fingerprint OTAs — they update
   from the store once.
4. Make a trivial JS change, push to `main` (or `vp run mobile:publish -- --channel production`),
   relaunch the TestFlight app, and confirm the OTA downloads and applies.

## Deferred

- **Native-build gating** — record each shipped fingerprint as a git tag on a successful native
  build, then skip the ~60-min `ios-testflight-rn` / `android-apk-rn` builds on `main` when the
  current fingerprint already has a tag (OTA-only) and run them otherwise. The self-hosted
  equivalent of Expo's `continuous-deploy-fingerprint` action; lands after the basic pipeline is
  proven. Today both the native builds and the OTA publish fire on every mobile push to `main`.
- **`beta` channel**: TestFlight on `beta`, App Store on `production`, promote at GA.
- **Migrate the preview/dev-branch flow + in-app `BranchSwitcher`** (`src/lib/eas-api.ts`) off EAS
  hosting onto expo-open-ota, to drop the Expo dependency entirely.
