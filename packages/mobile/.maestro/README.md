# Maestro screenshot flows

Native App Store / onboarding screenshot capture for the Boardsesh mobile app.
Driven by [Maestro](https://maestro.mobile.dev). Don't run these by hand — the
orchestrator (`scripts/mobile-screenshots.ts`, exposed as `vp run
mobile:screenshots`) boots the simulator, applies a clean status bar, resets the
keychain, builds and installs a clean Release app with
`EXPO_PUBLIC_SCREENSHOT_MODE=1`, then runs the flow and collects the PNGs into
`mobile/screenshots/<platform>/<device>/`.

## Backend

App Store captures run against **prod** (`vp run mobile:screenshots -- --backend
prod`), signed in as a curated test user (real feed, sessions, boards). The
orchestrator builds with the prod `EXPO_PUBLIC_BACKEND_URL` and resets the
simulator keychain first so login authenticates cleanly against prod.
`--backend local` (the default) points at the seeded dev DB instead.

## Flows

- `login.yaml` — reusable subflow. Fills the test credentials, submits via the
  keyboard return key, and dismisses the iOS "Save Password" prompt. Only runs
  when the auth screen is showing (the Keychain token survives `clearState`).
- `app-store.yaml` — logs in, then captures Home, Discover, Profile, Climbs,
  Record, and the board view.
- `onboarding.yaml` — captures app screens for onboarding-card illustrations
  (`--flow onboarding`).

## Required env (passed by the orchestrator via `maestro test -e`)

- `SCREENSHOT_USER_EMAIL` — test account email (default `test@boardsesh.com`).
- `SCREENSHOT_USER_PASSWORD` — test account password. **Not committed** — pass it
  at runtime (prod differs from the local-DB `test`).

## Notes

- Navigation uses custom-scheme deep links (`com.boardsesh.app://<route>`); Expo
  Router maps tab routes with the `(tabs)` group stripped (`://climbs`, `://home`,
  `://boards`, …). Each `openLink` is followed by an optional `tapOn "Open"` to
  clear iOS's "Open in 'Boardsesh'?" confirmation.
- **Coordinate taps**: on this iOS 26 / RN Fabric build Maestro's accessibility
  tree only exposes native text inputs and system dialogs — plain Views, Text,
  reanimated pressables and gesture rows don't surface, so app buttons can't be
  matched by id/text. The board pick and the climb tap (board view) therefore use
  percentage `point:` taps **pinned to the iPhone 16 Pro Max**. Re-check them if
  the device changes. Login works because it drives `TextInput`s (by testID) and
  the keyboard return key, not buttons.
- Screenshot mode (build-time flag) locks the theme to light + the platform
  variant and stops the onboarding gate from auto-presenting the tour.
