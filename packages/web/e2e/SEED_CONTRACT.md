# Seed Contract for e2e tests

This file documents the database state every Playwright spec assumes. It is the
single source of truth for what the seeded `boardsesh-dev-db` Docker image must
provide. **Anything not listed here is fair game to break** — if a spec
implicitly depends on data outside this contract, the spec needs to either pin
the data explicitly or move the requirement into this contract.

`global-setup.ts` validates the high-level contract entries before any worker
starts and fails fast with a precise error message if a check trips.

## Test user

- **Email:** `test@boardsesh.com` (override with `TEST_USER_EMAIL`)
- **Password:** `test` (override with `TEST_USER_PASSWORD`)
- Must exist as an active, non-deleted user.
- Login via `/auth/login` must succeed and redirect to `/`.

## Default test board

The board most specs land on:

- URL: `/kilter/original/12x12-square/screw_bolt/40/list`
- Must render at least one element matching `#onboarding-climb-card` or
  `[data-testid="climb-card"]` within 30 s of a cold load.
- Must expose at least two onboarding-tagged rows (`#onboarding-climb-card` and
  `#onboarding-climb-card-2`) so `app-store-screenshots.spec.ts:04-queue` can
  populate three queue items.

## Per-spec assumptions

| Spec | Additional data needed | Status |
| --- | --- | --- |
| `grid-mode-ascent-badge.spec.ts` | Test user has ≥1 ascent (flash or send) on a climb returned by `?showOnlyCompleted=true` at angle 40 on `kilter/original/12x12-square/screw_bolt`. The seed currently distributes ~2000 random ticks across ~10k climb/angle combos — this is **non-deterministic** and the source of the recurring flake. Will become deterministic in a follow-up PR that pins specific climb UUIDs. | ⚠️ flaky (PR follow-up) |
| `bottom-tab-bar.spec.ts` | Default test board contract (above). | ✅ |
| `queue-persistence.spec.ts` | Default test board contract (above). `/playlists` and `/feed` reachable for the warmup. | ✅ |
| `help-screenshots.spec.ts` (unauthenticated) | Default test board contract. | ✅ |
| `help-screenshots.spec.ts` (authenticated) | Test user contract. The `party mode active session` test additionally creates a real party session against the local backend — this is timing-sensitive and slated for follow-up to use the dummy sesh mount instead. | ⚠️ |
| `app-store-screenshots.spec.ts` | Default test board contract. The `06-party-mode` test requires `OnboardingDummySeshMount` to be globally mounted; it dispatches `onboarding:open-dummy-sesh` and expects a swipeable drawer to open. | ✅ (with retry-dispatch from PR 2) |
| `layout-screenshots.spec.ts` | One climb card present on every supported Kilter/Tension layout URL. | ✅ |
| `climb-setter-zoom.spec.ts` | `/create` route reachable; board renderer mounts an SVG inside `[data-testid="climb-setter-board"]`. | ✅ |
| `i18n-locale-routing.spec.ts`, `i18n-locale-navigation.spec.ts` | English and Spanish locale catalogs present (covered by the in-repo `packages/web/i18n/locales/` checked into git). | ✅ |
| `activity-feed-infinite-scroll.spec.ts` | `/feed` returns more than one page of activity items for the test user. | ⚠️ (data assumption not yet enforced) |

## Updating the contract

When adding a new spec:

1. List the data it depends on in this file.
2. If the dependency is novel (a specific climb UUID, a specific user state),
   add a deterministic insertion to the seed script (path TBC, currently
   `packages/db/scripts/`) and bump the dev-DB Docker image version.
3. If the contract entry is broad enough that `global-setup.ts` could verify
   it cheaply, add the check there too.

The dev-DB image is rebuilt automatically when files in `packages/db/docker/`,
`packages/db/scripts/`, `packages/db/src/schema/`, `packages/db/drizzle/`, or
`packages/db/package.json` change on `main` (see CLAUDE.md → "Pre-built
database image").
