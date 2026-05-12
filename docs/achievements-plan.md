# Achievements System Plan

**Status:** Draft proposal — 2026-05-12
**Owner:** TBD
**Source data:** Read-only analysis of prod Postgres (snapshot 2026-05-12)

---

## 1. Why we're building this

The hardware boards and Aurora's stock app both treat climbing as a sequence of disconnected sends. Boardsesh already has a richer object — the **session** (party + inferred) — and a session feed where users can vote, comment, and follow each other. Achievements turn that feed into something users want to come back to: a personal record of progress that surfaces *during* a session and gets shared *after* it.

Concretely, achievements should:

1. Make the in-app session experience feel like more than a logger — climbers leave with something to show for the day even if nothing dramatic happened.
2. Give the social feed durable, discrete moments to share (a "first V8" card beats "logged 12 climbs").
3. Pull lapsed climbers back. A weekly rhythm achievement that's almost-complete is a gentler nudge than a notification.
4. Reward exploration the stock Kilter app can't see — angle variety, multi-board use, projecting, comeback sessions.

**Non-goals:**

- A point/XP economy or leaderboard. We don't want to optimize for whales or invite cheating via fake ticks.
- Aurora-style "training plan" prescriptions. Achievements describe what happened, they don't dictate what to do.
- Anything that requires synchronous heavy computation on the hot path. Achievement evaluation must never block tick save.

---

## 2. Design principles

These exist because the prod data analysis (§3) showed each of them mattering:

1. **Calibrate to the median user, not the power user.** P50 user has 84 lifetime ticks and 39 lifetime sessions. The first achievement tier must unlock fast — within a session or two — or 70% of users will never see one fire.
2. **Streaks are weeks, not days.** Only **22 users have ever had a 5-day climbing streak**, and 5 users a 7-day streak. Climbers rest. Use *sessions per calendar week* (a much more reachable signal: 252 users have logged 3+ sessions in a single week).
3. **Aurora-imported flash counts are unreliable.** 70% of all ticks have status=`flash`, vs 16% `send`, 14% `attempt`. This is because Aurora's data import treats default ascents as flashes. **Scope flash-based achievements to ticks that originated in Boardsesh** (or to the most recent N days where users are actively logging the difference) — otherwise we hand "Flash Master" badges to anyone with a synced history.
4. **Reward grinding, not just sending.** 7,074 sessions contain a send of a climb the user previously attempted in a different session — that "I came back and got it" moment is core to bouldering and almost no app honors it.
5. **Stable IDs, idempotent awards.** Every achievement award must be replayable. Inferred sessions already use deterministic UUIDv5 — we'll lean on that to recompute history without dupes.
6. **No notification spam.** A user who imports years of Aurora history will trigger hundreds of achievements. The first computation per user is silent (or a single "Welcome to your achievements" digest); only achievements earned *after* enrollment fire notifications.
7. **Session-bound first, lifetime second.** Most awards should resolve at session close so the session detail page is the natural celebration surface. Lifetime/cross-session awards are a smaller secondary set.
8. **Boring names, generous criteria.** "First V6" is fine. Avoid the gamification voice ("LEGENDARY!" "BEAST MODE!"). Match the existing CLAUDE.md copy guidance.

---

## 3. What the data says

All numbers from prod snapshot 2026-05-12.

### 3.1 Population

| Metric                             | Count   |
| ---------------------------------- | ------- |
| Users (table)                      | 1,007   |
| Users with ≥1 tick                 | 574     |
| Active last 7d / 30d / 90d         | 169 / 356 / 542 |
| Total ticks                        | 252,891 |
| Inferred sessions                  | 34,530  |
| Party (board) sessions             | 1,559   |

Tick volume is heavily long-tailed:

| Bucket          | Users | Total ticks |
| --------------- | ----- | ----------- |
| <10             | 162   | 627         |
| 10–49           | 89    | 1,962       |
| 50–99           | 51    | 3,805       |
| 100–499         | 134   | 37,476      |
| 500–999         | 62    | 46,187      |
| 1000–4999       | 73    | 142,242     |
| 5000+           | 3     | 20,593      |

P50 = 84 ticks, P90 = 1,275, P99 = 3,998, max = 7,960.

### 3.2 Session shape

- Median inferred session: **5 unique climbs, 7 ticks, 40 minutes**.
- P90 inferred session: 14 climbs, 113 minutes.
- Median user has 39 lifetime sessions, P90 has 205, max = 631.
- **Multi-board sessions are essentially nonexistent** (5 / 34,530). Multi-board exploration achievements will be aspirational/niche, not core.
- **Party mode is mostly used solo** (avg 1.04 distinct participants per party session, max 3, only 90 named, only 16 with a goal). Don't over-index on party-only achievements.

### 3.3 Climb status mix

| Status  | Count   | Note                                          |
| ------- | ------- | --------------------------------------------- |
| flash   | 176,065 | 70% — heavily inflated by Aurora import       |
| send    | 41,711  | 16%                                           |
| attempt | 35,116  | 14%                                           |

Repeat behaviour per (user, climb) pair:

- 105,008 climbs touched once
- 37,342 with 2–5 attempts
- 6,031 with 6–20 attempts
- 318 with 20+ attempts
- **2,548 climbs sent after >10 cumulative attempts**, 97 after 50+, 14 after 100+.

### 3.4 Grades

Distribution of each user's hardest sent grade on Kilter:

| Hardest grade  | Users |
| -------------- | ----- |
| ≤ V2           | 21    |
| V3             | 26    |
| V4             | 32    |
| V5             | 51    |
| V6             | 37    |
| V7             | 46    |
| V8             | 104   |
| V9             | 49    |
| V10            | 23    |
| V11+           | 33    |

Useful for tiering: V6 is roughly the median ceiling, V8 is the bulge, V10+ is rare.

### 3.5 Boards & angles

- Kilter 225,789 (89%), Tension 26,482 (10%), Decoy 554, MoonBoard 56, Grasshopper 11.
- **45 users have logged on 2 boards, 4 on 3+**. Multi-board achievements will land for ~10% of the active base.
- 40° is the dominant angle (108k ticks), then 50° (34k) and 30° (27k).
- **266 of 574 users (46%) are angle loyalists** (>80% of ticks on one angle). Angle-variety achievements have real headroom.

### 3.6 Rhythm

Day-of-week peaks Tuesday > Wednesday > Monday; weekend dips. Hour-of-day double peak at 10–13 and 17–20 — gym schedule. **PR sessions: 1,166** (sessions where the user hit their lifetime hardest send).

---

## 4. Achievement taxonomy

We split by **scope** (when/where it resolves) and **family** (what it's about). All awards resolve to a single canonical event with a stable ID; the same achievement can fire at multiple tiers (Bronze → Silver → Gold → Platinum) without distinct definitions.

### 4.1 Session achievements (resolve at session close)

These fire when an inferred session "closes" — i.e. 4-hour gap elapses since the last tick, or the user explicitly ends a party session. They appear inline on the session detail page and become shareable feed cards.

| ID                       | Name                  | Trigger                                                                  | Calibration |
| ------------------------ | --------------------- | ------------------------------------------------------------------------ | ----------- |
| `session.first_send`     | First send            | Any send/flash in this session, only when the user has 0 prior sessions  | Universal   |
| `session.send_count.{n}` | Volume                | Tiers at 5 / 10 / 20 / 30 sends in one session                           | T1=57% sess, T4=1% |
| `session.flash_count.{n}`| Flash run             | 3 / 5 / 10 in-app flashes in one session (Aurora ticks excluded)         | TBD post-launch |
| `session.pr_session`     | New personal best     | Session contained a send at the user's all-time hardest grade            | 1,166 historical |
| `session.redpoint`       | Stuck the project     | Sent a climb in this session that you'd attempted in an earlier session  | 7,074 historical |
| `session.long_haul`      | Long session          | ≥120 minutes between first and last tick                                 | ~10% of sessions |
| `session.angle_explorer` | Angle hop             | ≥3 distinct angles in one session                                        | Niche |
| `session.board_hop`      | Two-board day         | ≥2 board types in one session                                            | Very rare (5 historical) — keep but advertise as legendary |
| `session.with_a_friend`  | Logged together       | Inferred session overlaps in time/location with another user's session   | Computable when geofence + friendship exists |

### 4.2 Lifetime / cumulative achievements

Resolve whenever the running total crosses a threshold. Computed on each tick save *and* on session close.

| Family               | Tiers (count)                       | Notes                                                                             |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Total sends          | 10 / 50 / 100 / 500 / 1000 / 5000   | Reachable by all tiers (P50 user has 84 ticks → first two tiers feasible).        |
| Distinct climbs sent | 25 / 100 / 500 / 1000 / 2500        | P90 user has 714 distinct climbs.                                                 |
| Sessions logged      | 1 / 10 / 50 / 100 / 250 / 500       | Median 39 → first three tiers reachable in a season.                              |
| Hours on the wall    | 5 / 25 / 100 / 500                  | Sum of (lastTickAt − firstTickAt) per session. Excludes single-tick sessions.     |
| Hardest grade        | One award per V-grade unlocked      | "First V3", "First V4" … one row per (user, grade, board_type).                   |

### 4.3 Rhythm / streak achievements (week-based)

| ID                          | Trigger                                                  | Reachable by today |
| --------------------------- | -------------------------------------------------------- | ------------------ |
| `rhythm.weekly_x3`          | 3 sessions in a single ISO week                          | 252 users (~44% of active) |
| `rhythm.weekly_x4`          | 4 sessions in a single ISO week                          | 147 users (~26%)   |
| `rhythm.month_active`       | ≥1 session in 4 consecutive ISO weeks                    | TBD                |
| `rhythm.comeback`           | First session in ≥30 days after a previous session       | High recall, high meaning |
| `rhythm.year_in_review`     | Annual auto-summary on user's account anniversary        | Triggered yearly   |

We deliberately do **not** ship a "7-day streak" achievement because only 5 users have ever earned it. Day-streaks reward people who don't rest, which is bad climbing advice.

### 4.4 Grade & projecting achievements

| ID                          | Trigger                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `grade.first.{V}`           | First send at each V-grade (per board_type)                        |
| `grade.flash.{V}`           | First flash at each V-grade (in-app ticks only, see §2 principle 3) |
| `grade.repeat.{V}`          | 10 / 50 sends at the same V-grade — "Solid at V6"                  |
| `project.long_grind`        | Sent a climb after ≥10 cumulative attempts                         |
| `project.epic_grind`        | Sent a climb after ≥50 attempts                                    |
| `project.spite_send`        | Sent a climb 30+ days after first attempt                          |

### 4.5 Exploration achievements

| ID                          | Trigger                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `explore.angles_5`          | Sent climbs at 5 distinct angles                                   |
| `explore.angle_extreme`     | Send at angle ≥60° **and** ≤20°                                    |
| `explore.boards_2`          | Logged on 2 board types (Kilter + Tension etc.)                    |
| `explore.boards_3`          | Logged on 3 board types                                            |
| `explore.layouts_3`         | Logged on 3 distinct layout/size combos                            |
| `explore.benchmark_set`     | Sent the full benchmark set at a given grade                       |

### 4.6 Social achievements

These align with the existing social tables (`comments`, `feed_items`, `board_follows`, `inferred_sessions` member overrides):

| ID                          | Trigger                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `social.first_follow`       | Followed your first climber                                        |
| `social.session_added`      | Got added to another climber's session via `session_member_overrides` |
| `social.crew_session`       | Session has ≥3 distinct participants (party or override)           |
| `social.beta_giver`         | Posted a comment on 5 different climbs                             |
| `social.first_party`        | Created your first party-mode session                              |
| `social.public_session`     | Made a discoverable session that someone else joined               |

### 4.7 Hidden / easter-egg achievements

Small, opt-out, never-loud. A few examples:

- `hidden.crack_of_dawn` — session starting between 04:00–06:00 local (5,914 ticks happen at 03:00 — early-bird crowd exists).
- `hidden.tuesday_loyalist` — 10 sessions on a Tuesday (Tuesday is the most-climbed day in the data).
- `hidden.midnight_send` — send recorded between 23:00 and 02:00.

Display these without the criteria spelled out; they show up in the user's collection only after firing.

---

## 5. Schema design

### 5.1 New tables

```sql
-- Static catalog of achievement definitions. Kept in code (TS file)
-- and synced into this table at startup so UI/queries can JOIN against it.
-- Tiers live in a single row using a JSONB array for thresholds.
CREATE TABLE achievement_definitions (
  id              TEXT PRIMARY KEY,            -- e.g. 'session.send_count'
  family          TEXT NOT NULL,               -- 'session' | 'lifetime' | 'rhythm' | 'grade' | 'explore' | 'social' | 'hidden'
  scope           TEXT NOT NULL,               -- 'session' | 'lifetime' | 'periodic'
  display_name    TEXT NOT NULL,               -- i18n key, not raw text
  description_key TEXT NOT NULL,
  hidden          BOOLEAN NOT NULL DEFAULT false,
  tier_thresholds JSONB,                       -- e.g. [5,10,20,30] for tiered counts
  metadata        JSONB,                       -- evaluator config, icon hints
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per (user, achievement, tier). Idempotent: UNIQUE constraint.
CREATE TABLE user_achievements (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id        TEXT NOT NULL REFERENCES achievement_definitions(id),
  tier                  INT NOT NULL DEFAULT 1, -- 1=bronze, 2=silver, 3=gold, 4=platinum
  earned_at             TIMESTAMP NOT NULL,    -- the *climb* time, not the compute time
  granted_at            TIMESTAMP NOT NULL DEFAULT now(),
  -- Provenance: which session/tick caused this award. Enables "view the moment".
  source_session_id     TEXT,                  -- COALESCE(party, inferred)
  source_tick_id        BIGINT REFERENCES boardsesh_ticks(id) ON DELETE SET NULL,
  -- Per-grade / per-board specifiers stored here so 'grade.first.V6.kilter'
  -- and 'grade.first.V6.tension' are different rows of the same definition.
  variant               TEXT,                  -- e.g. 'V6', 'V6:kilter'
  -- Snapshot of the relevant counter at award time, for display.
  metric_value          INT,
  CONSTRAINT user_achievements_unique
    UNIQUE (user_id, achievement_id, tier, COALESCE(variant, ''))
);

CREATE INDEX user_achievements_user_idx
  ON user_achievements (user_id, granted_at DESC);
CREATE INDEX user_achievements_session_idx
  ON user_achievements (source_session_id);
CREATE INDEX user_achievements_feed_idx
  ON user_achievements (granted_at DESC);
```

Notes:

- `achievement_definitions` is a thin DB mirror of a TS catalog (`packages/shared-schema/src/achievements/catalog.ts`). The catalog is the source of truth — the table exists so `feed_items` and Postgres-side queries can JOIN cleanly.
- `earned_at` is the climb time (the wall-clock moment the achievement *would have* unlocked), `granted_at` is when our evaluator wrote the row. They diverge during backfill.
- Tier is a small int rather than per-tier rows-with-different-IDs because it makes "show me my highest tier per achievement" a one-line query.

### 5.2 Reuse existing rows

We do not need new aggregate columns on `inferred_sessions` — the existing `total_sends`, `total_flashes`, `total_attempts`, `tick_count`, `first_tick_at`, `last_tick_at` carry everything the session-scope evaluators need. For lifetime achievements, we recompute the relevant counter at evaluation time (cheap with the existing `boardsesh_ticks_user_climbed_at_idx` index).

### 5.3 Feed/notification integration

Achievements get a new `feed_item_type` value (`'achievement'`) and a new `social_entity_type` (`'achievement'`). When an achievement is granted post-enrollment, we:

1. Insert a `feed_items` row recipient = followers of the user, entity = the `user_achievements.id`.
2. Insert a `notifications` row to the user themselves (read-once, like ticks).
3. Hide all of the above when the achievement is from backfill (see §6.4).

---

## 6. Computation architecture

### 6.1 Evaluator interface

```ts
// packages/backend/src/achievements/evaluators/types.ts
export type AchievementContext = {
  user: { id: string; createdAt: Date };
  trigger: { kind: 'tick_saved'; tick: Tick }
         | { kind: 'session_closed'; session: InferredSession }
         | { kind: 'periodic'; weekStart: Date };
  // Read-only DB handle. Evaluators query freely; the framework enforces
  // a per-evaluator timeout and short-circuits on failure.
  db: ReadOnlyDb;
};

export type EvaluatorResult = {
  achievementId: string;
  tier: number;
  variant?: string;
  earnedAt: Date;
  metricValue?: number;
  sourceSessionId?: string;
  sourceTickId?: number;
};

export type Evaluator = {
  id: string;
  triggers: Array<'tick_saved' | 'session_closed' | 'periodic'>;
  evaluate(ctx: AchievementContext): Promise<EvaluatorResult[]>;
};
```

Each evaluator owns one definition (or one family of tiers). They're pure functions of context plus DB reads, return zero or more "I should have this" results, and the framework writes `user_achievements` rows with `ON CONFLICT DO NOTHING`. Idempotency falls out of the unique constraint.

### 6.2 Trigger points

| Trigger        | Where                                                                   | Evaluators run                            |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `tick_saved`   | `saveTick` in backend, after `assignInferredSession` writes inferred_session_id | Lifetime counters, grade firsts, projecting wins |
| `session_closed` | New job: when `inferred_sessions.last_tick_at < now() - 4h` and not yet `endedAt`. Runs every 30 min as a Vercel cron + on demand from `buildInferredSessionsForUser`. | Session-scope evaluators (volume, PR, redpoint, long_haul, angle_explorer, board_hop) |
| `periodic`     | Daily cron, end of week / month / year                                  | Rhythm achievements, year-in-review       |

Evaluation never blocks tick save — it runs after the transactional write is committed, in a fire-and-forget queue (existing pattern: see how feed/notification writes already work). A failure logs and retries on the next trigger but never bubbles back to the user request.

### 6.3 Performance budget

- Per-tick evaluation budget: **50 ms wall** for all evaluators combined. Lifetime counters that need a full-table scan must use the existing `boardsesh_ticks_user_climbed_at_idx` (already exists, hits within ~5 ms even for the heaviest user with 7,960 ticks).
- Per-session evaluation budget: **200 ms**, since this runs out-of-band.
- All evaluators must be expressible as Drizzle queries (per CLAUDE.md). No raw SQL unless a CTE or window function is genuinely required.

### 6.4 Backfill & enrollment

When a user first gains an account or imports Aurora data:

1. Mark them as `enrolled_at = now()` in a `user_achievement_settings` row.
2. Walk their full history once, oldest-first, running session-close + lifetime evaluators against each closed session. Write all earned rows with `granted_at = now()` but `earned_at = (the historical session date)`.
3. **Suppress feed/notification side-effects** for any achievement whose `earned_at < enrolled_at`. The user sees them on their profile (with historical dates) but no feed dump and no "23 new achievements!" notification.
4. From `enrolled_at` forward, normal real-time evaluation kicks in and side-effects fire.

This is the difference between "delightful" and "spammy" for the 73 users with 1000+ historical ticks.

### 6.5 Failure modes

| Failure                                | Effect                                                  | Recovery                                         |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Evaluator throws                       | Logged with `user_id` + `evaluator.id`, others continue | Backfill job re-runs nightly                     |
| Race: same achievement evaluated twice | `ON CONFLICT DO NOTHING` on UNIQUE constraint           | None needed                                      |
| Tick deleted (`deleteTick`)            | Source-of-truth counters change. Achievement stays.     | We do **not** revoke earned achievements.       |
| Session merged via `addUserToSession`  | New session boundaries. Re-evaluate the affected sessions for the affected users. | Mutation handler enqueues re-evaluation. |
| Aurora bulk re-sync                    | Could re-trigger same evaluators on already-evaluated ticks. | Idempotent by design. |

---

## 7. Session feature integration

This is the core deliverable — achievements should make the existing session UI feel different on day one, not just add a new "/achievements" page.

### 7.1 Session detail page (`packages/web/app/session/[sessionId]/`)

Above the existing climb list, add an **Achievements strip**: horizontal row of any badges earned in this session, with the metric value ("V7 — your hardest yet", "12 sends, your top 5%"). Tap = expand to a small dialog with the criteria. Strip is empty-state friendly — if no achievements fired, show nothing rather than an empty placeholder.

Threading achievements through `SessionDetailContent` means the GraphQL `SessionDetail` type gains a `achievements: SessionAchievement[]` field, fetched in the same query the page already runs. No extra round-trip.

### 7.2 Session summary dialog (`session-summary-view.tsx`)

This is the modal that pops up at the end of a party session today. It already shows totals + grade pyramid. We add a **"What you earned today"** section between header stats and the grade chart. New achievements get a brief animation; already-earned-but-still-relevant tier progress gets a quieter "8/10 sends toward Volume Silver" progress bar.

### 7.3 Session feed card (`session-feed-card.tsx`)

The compact card on the activity feed already shows participants and grade chart. Add up to 3 achievement chips below the grade chart. If a session contained a `pr_session` or `grade.first.*` award, it gets a subtle visual treatment — not a glowing border, just a small icon next to the title. This is the moment the social loop closes: a friend sees "Marco hit his first V8" without us writing a separate "achievement post" feed item.

### 7.4 "You" page (`packages/web/app/you/`)

Add a new tab `/you/achievements` next to logbook + sessions. Default view: grouped by family, tier-progress bars for in-progress ones, recently-earned at top. Hidden achievements show only after they fire.

### 7.5 OG image / share card

`/api/og/session/...` already renders a social card. Inject the top achievement (highest tier, most recent) into the bottom strip of the OG image when present. Most shareable moment becomes the headline.

### 7.6 Profile page (`/profile/[user_id]`)

Show top 6 highest-tier achievements as a row near the top, with a "See all" link to the user's `/achievements`. Respects the existing public/private visibility model.

---

## 8. Phased rollout

Each phase ships behind a single boolean flag in `community_settings` so we can dark-launch and pull the chain.

### Phase 1: foundation (1–2 weeks)

- Migration: `achievement_definitions`, `user_achievements`, indexes.
- TS catalog file + sync-on-boot.
- Evaluator framework (interface, trigger registry, queue, idempotent writes).
- 5 evaluators: `lifetime.total_sends`, `lifetime.sessions_logged`, `grade.first.{V}`, `session.first_send`, `session.send_count`.
- Backfill script (silent, no notifications).
- `/you/achievements` page (read-only, no UI elsewhere).

Success criterion: the 73 users with 1000+ ticks each see a coherent achievement collection, no feed pollution.

### Phase 2: session integration (1 week)

- Session detail strip + summary dialog section + feed card chips.
- Add 4 more session evaluators: `pr_session`, `redpoint`, `long_haul`, `angle_explorer`.
- OG image integration.

Success criterion: every active user (213 in last 30d) sees ≥1 achievement on their next session detail page.

### Phase 3: rhythm + social (1 week)

- Periodic trigger + weekly cron.
- Rhythm evaluators (`weekly_x3`, `weekly_x4`, `comeback`).
- Social evaluators (`first_follow`, `session_added`, `crew_session`).
- Notifications + feed_items writes (post-enrollment only).

### Phase 4: exploration + hidden + polish (1 week)

- Remaining evaluators (`explore.*`, `hidden.*`, `project.*`).
- Year-in-review generator.
- Profile achievements row.

### Phase 5: instrumentation + iteration (ongoing)

- PostHog event for every achievement granted (`{achievement_id, tier, source: 'realtime'|'backfill'}`).
- Dashboard: grant rate per achievement, time-to-first-grant per cohort, opt-out rate.
- Quarterly review: any achievement granted to <2% or >95% of active users gets re-tiered.

---

## 9. Open questions

1. **In-app vs Aurora flash distinction.** Do we add a `source` column to `boardsesh_ticks` (`'aurora'|'app'|'manual'`)? Or infer from `aurora_synced_at IS NOT NULL`? The latter is free but drift-prone. Worth a small data audit before committing.
2. **Should achievements ever be revoked?** If a user deletes a tick that earned them an award, do we keep, demote, or delete the row? Soft proposal: keep it — climbers don't want to "un-earn" things, and the deletion is usually a typo fix.
3. **Privacy.** Do public profiles show all achievements, only top N, or none unless the user opts in? Default proposal: top 6 visible, full list private. Mirror existing follower-graph privacy.
4. **Localization.** Display names and descriptions are i18n keys per CLAUDE.md. Variant strings (V6, V8 …) need format helpers — the existing `useGradeFormat` hook covers this.
5. **HealthKit hand-off.** Sessions already optionally write to HealthKit (`healthKitWorkoutId`). Should achievements get a HealthKit metadata field too, or stay app-internal? Suggest app-internal until there's user demand.
6. **Cross-board grade scaling.** A "First V8 on Tension" should probably count differently from a "First V8 on Kilter" because the grading scales differ. Variant = `V8:kilter` keeps them separate by construction; if we want a unified "Hardest V-grade" achievement we'd need a board-grade calibration table. Out of scope for v1.
7. **Anti-cheating.** Anyone can write a tick. Do we need rate limits, "achievement granted but unverified" badges, or anything? For v1, no — the social cost of fake sends in a friend graph is enough deterrent. Revisit if leaderboards ever exist.

---

## 10. What we're explicitly not doing

- **Points / XP / levels.** No "Climber Level 27." Achievements are categorical, not numeric.
- **Global leaderboards.** Closest thing is the existing follower feed; we won't add ranking screens.
- **Daily-streak push notifications.** See §2 principle 2 — bad climbing advice.
- **Per-user custom goals as achievements.** Goals already exist on `board_sessions.goal` and `inferred_sessions.description`. Merging them with the achievements system muddles "I described what I wanted" with "the system noticed something happened."
- **Aurora-synced achievement state.** Achievements are a Boardsesh primitive; we don't push them back to Aurora.

---

## Appendix A — sample evaluator (illustrative)

```ts
// packages/backend/src/achievements/evaluators/grade-first.ts
import { eq, and, lt, sql } from 'drizzle-orm';
import { boardseshTicks, boardDifficultyGrades } from '@boardsesh/db/schema';
import type { Evaluator } from './types';

export const gradeFirstEvaluator: Evaluator = {
  id: 'grade.first',
  triggers: ['tick_saved'],

  async evaluate({ user, trigger, db }) {
    if (trigger.kind !== 'tick_saved') return [];
    const tick = trigger.tick;
    if (tick.status !== 'send' && tick.status !== 'flash') return [];
    if (tick.difficulty == null) return [];

    // Was anything at this difficulty (or harder) sent before this tick?
    const earlier = await db
      .select({ id: boardseshTicks.id })
      .from(boardseshTicks)
      .where(
        and(
          eq(boardseshTicks.userId, user.id),
          eq(boardseshTicks.boardType, tick.boardType),
          sql`${boardseshTicks.difficulty} >= ${tick.difficulty}`,
          sql`${boardseshTicks.status} IN ('send','flash')`,
          lt(boardseshTicks.climbedAt, tick.climbedAt),
        ),
      )
      .limit(1);

    if (earlier.length > 0) return [];

    const [grade] = await db
      .select({ name: boardDifficultyGrades.boulderName })
      .from(boardDifficultyGrades)
      .where(
        and(
          eq(boardDifficultyGrades.boardType, tick.boardType),
          eq(boardDifficultyGrades.difficulty, tick.difficulty),
        ),
      );

    return [{
      achievementId: 'grade.first',
      tier: 1,
      variant: `${grade?.name ?? tick.difficulty}:${tick.boardType}`,
      earnedAt: tick.climbedAt,
      sourceTickId: tick.id,
      sourceSessionId: tick.inferredSessionId ?? tick.sessionId ?? undefined,
      metricValue: tick.difficulty,
    }];
  },
};
```

---

## Appendix B — analysis queries used

These can be re-run against any prod replica to refresh tier calibrations:

```sql
-- Tick volume per user (for tier calibration)
SELECT user_id, COUNT(*) FROM boardsesh_ticks GROUP BY 1;

-- Per-grade "hardest send" distribution per board
WITH user_max AS (
  SELECT user_id, board_type, MAX(difficulty) AS d
  FROM boardsesh_ticks WHERE status IN ('send','flash')
  GROUP BY 1,2
)
SELECT board_type, d, COUNT(*) FROM user_max GROUP BY 1,2 ORDER BY 1,2;

-- Sessions per ISO week per user (rhythm tier calibration)
SELECT user_id, DATE_TRUNC('week', last_tick_at::timestamp) AS wk, COUNT(*)
FROM inferred_sessions GROUP BY 1,2;

-- Day-streak distribution (validation that day-streaks are a bad signal)
WITH days AS (SELECT user_id, DATE(climbed_at) d FROM boardsesh_ticks GROUP BY 1,2),
     g AS (SELECT user_id, d, d - (DENSE_RANK() OVER (PARTITION BY user_id ORDER BY d))::int AS grp FROM days),
     runs AS (SELECT user_id, COUNT(*) r FROM g GROUP BY user_id, grp)
SELECT MAX(r), AVG(r) FROM runs GROUP BY user_id;

-- "Sent after attempting earlier" — redpoint achievement reachability
WITH first_attempt AS (
  SELECT user_id, climb_uuid, MIN(climbed_at) AS first_at
  FROM boardsesh_ticks WHERE status='attempt' GROUP BY 1,2
)
SELECT COUNT(DISTINCT t.inferred_session_id)
FROM boardsesh_ticks t
JOIN first_attempt fa USING (user_id, climb_uuid)
WHERE t.status IN ('send','flash') AND t.climbed_at > fa.first_at;
```
