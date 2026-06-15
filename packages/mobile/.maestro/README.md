# Maestro screenshot flows

Native App Store / onboarding screenshot capture for the Boardsesh mobile app.
Driven by [Maestro](https://maestro.mobile.dev). Don't run these by hand — the
orchestrator (`scripts/mobile-screenshots.ts`, exposed as `vp run
mobile:screenshots`) boots the simulator, applies a clean status bar, builds and
installs a clean Release app with `EXPO_PUBLIC_SCREENSHOT_MODE=1`, then runs the
flow below and collects the PNGs into `mobile/screenshots/<platform>/<device>/`.

## Flows

- `login.yaml` — reusable subflow. Fills the seeded test credentials and waits
  for the redirect out of the auth screen. Requires the test account to exist on
  whatever backend the build points at (locally: the seeded dev DB).
- `app-store.yaml` — logs in, then captures each main tab (+ the search filter
  sheet) for the store listing.
- `onboarding.yaml` — logs in, then captures the app screens we embed as
  onboarding-card illustrations (`--flow onboarding`).

## Required env (passed by the orchestrator via `maestro test -e`)

- `SCREENSHOT_USER_EMAIL` — test account email (default `test@boardsesh.com`).
- `SCREENSHOT_USER_PASSWORD` — test account password (default `test`).

## Notes

- Navigation uses custom-scheme deep links (`com.boardsesh.app://<route>`); Expo
  Router maps tab routes with the `(tabs)` group stripped (`://climbs`, `://home`,
  …). Verify a route with `xcrun simctl openurl <udid> "com.boardsesh.app://climbs"`.
- testIDs the flows rely on: `auth-email-input`, `auth-password-input`,
  `auth-submit-button`, `home-screen`, `climbs-screen`, `climb-list`. The filter
  button is matched by its "Filters" accessibility label.
- Screenshot mode (build-time flag) locks the theme to light + the platform
  variant and stops the onboarding gate from auto-presenting the tour, so the
  app-store flow lands on the tabs.
