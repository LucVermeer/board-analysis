# Power-User Analysis: Behaviour & How Their Data Can Help Everyone Else

What the strongest climbers on Boardsesh actually do with the app, and whether their
logbook data — quality stars and grade opinions in particular — can make the app better
for the ~85% of climbers who log below V10.

**Source:** read-only query against production (`boardsesh_readonly`), snapshot early July 2026.
**Cohort:** the 39 climbers with the most V10+ sends in the database (the "power-user cohort").
**Privacy:** this document is deliberately anonymous. It reports only cohort-level aggregates —
no names, emails, user IDs, or per-person rows. Do not add identifying detail to it. The cohort
is defined by a grade threshold (below), not a hand-picked list, so the analysis is reproducible
without naming anyone.

---

## TL;DR

- **The elite signal is almost entirely these 39 people.** They account for **99%** of every
  V10+ send in the database (7,474 of 7,552). Only 79 accounts have logged *any* V10+ send. If we
  want "what do strong climbers think," this cohort essentially *is* the answer.
- **They are import-and-sync users, not in-app socialites.** 99% of their 47,579 logged climbs
  arrived by syncing an existing Aurora (Kilter/Tension) logbook. They rate quality and suggest a
  grade on ~97% of climbs, but almost never use Boardsesh's own social features (2 of 39 follow
  anyone, 1 has commented, 0 have attached a beta video). Most *do* build playlists (31 of 39).
- **Their grade opinions are trustworthy.** Across 46,083 graded sends, their suggested grade sits
  essentially on top of the displayed grade (mean bias −0.04 of a grade, SD 0.64); 87% land within
  one grade. These are well-calibrated graders, not chest-beaters or downgraders.
- **Their quality data is gold but currently unreadable.** A data bug means **83% of the cohort's
  quality ratings are stored on the raw 1–3 scale, not 1–5.** A climb one of them flagged as a
  3-out-of-3 classic is saved as `3` and would render as **3 out of 5 (mediocre)**. Fixing this is
  the prerequisite to surfacing any of it. (See "The blocker" below — it affects ~235k rows
  across the whole app, not just this cohort.)
- **The audience that benefits is the majority.** Of 523 users with 5+ graded sends, **85.5% peak
  below V10.** A layer of strong-climber-vetted classics and grade confidence is aimed straight at
  them.

---

## 1. Who the cohort is (aggregate only)

| Measure | Value |
| --- | --- |
| Climbers in cohort | 39 |
| Total logged climbs (ticks) | 47,579 |
| Sends (send + flash) | 46,520 |
| Logged attempts (fails) | 1,059 |
| Distinct climbs touched | 15,357 |
| Board mix | Kilter 43,142 · Tension 4,437 |
| Date range of logs | 2019 → 2026 |
| Share of **all** V10+ sends in the DB | **99%** (7,474 / 7,552) |

For context, the whole database holds 2,436 users, 1,186 of whom have logged a climb, for
356,883 ticks total. So this cohort is 3% of active loggers but the near-entirety of the
elite-grade signal.

**Still live:** 23 of 39 logged a climb in the last 90 days; all 39 within the last year. This is
a current, engaged group, not a historical import dump.

---

## 2. How they behave

### They import; they don't (socially) engage

99% of the cohort's ticks carry an `aurora_id` — they came from syncing a Kilter/Tension logbook,
not from logging inside Boardsesh. Only ~466 ticks across all 39 people were created natively in
the app. Layer on the feature-usage counts:

| Boardsesh-native behaviour | Cohort members doing it (of 39) |
| --- | --- |
| Own at least one playlist | 31 |
| Have favourited a climb | 19 |
| Logged a climb in a party-mode session | 11 |
| Follow another user | 2 |
| Are followed by someone | 3 |
| Wrote a climb comment | 1 |
| Follow a setter | 0 |
| Attached a beta video | 0 |

The read: **they treat Boardsesh as a better logbook viewer over their Aurora history, plus
playlists.** The social graph, comments, setter-follows, and beta-sharing are essentially unused
by this group. That's an engagement opportunity, but it also means their *contribution* to the
community today is implicit — it lives in their synced ratings, not in anything they posted.

### They rate almost everything, and rate it well

- **Quality stars on 97%** of ticks (46,205 / 47,579).
- **A grade opinion on 97%** of ticks (46,116 / 47,579).
- **Comments on 2.3%**, benchmarks flagged on ~0%.

The grade opinions are the standout. Comparing each graded send's suggested grade to the climb's
displayed difficulty (46,083 matched sends):

| | |
| --- | --- |
| Mean difference (opinion − displayed) | **−0.04 grades** (essentially unbiased) |
| Std. dev. of the difference | 0.64 grades |
| Roughly agree (within 1 grade) | 87% (39,937) |
| Felt clearly harder (≥1 grade) | 5% (2,408) |
| Felt clearly softer (≥1 grade) | 8% (3,738) |

Strong climbers here are not systematically sandbagging or spraying — their per-ascent grades
track the consensus grade tightly. That's exactly the property you want if you're going to lean on
their opinions to sharpen grades for everyone else.

---

## 3. The blocker: per-tick quality is on a mixed scale

**Before any of this data can be shown to other users, the quality scale has to be fixed.**

`boardsesh_ticks.quality` is documented as a 1–5 star rating, but the data is a mix of 1–3 and
1–5 depending on how the tick entered the system:

| Source of tick | Board | Quality scale in practice |
| --- | --- | --- |
| Live Aurora API sync | Kilter/Tension | **Correct** — 1–5 (converted 1→1, 2→3, 3→5) |
| Native (logged in Boardsesh) | any | **Correct** — 1–5 |
| **JSON logbook import** | **Kilter** | **Broken — raw 1–3** |

The JSON-import path writes the export's `stars` field straight through
(`packages/aurora-sync/src/sync/json-import.ts:962`, `quality: ascent.stars`) on the assumption —
stated in the code comment there — that the export is already on a 1–5 scale. For Kilter logbook
exports that assumption is wrong: the field is the raw Aurora 1–3.

The distribution makes it unambiguous. JSON-imported Kilter quality:

```
quality: 1 → 4,449
quality: 2 → 15,289
quality: 3 → 215,416
quality: 4 → 6
quality: 5 → 7
```

~235,000 rows piled into 1/2/3 with 13 rows above 3. A genuine 1–5 distribution would spread into
4 and 5. This is raw 1–3 data mislabelled as 1–5.

Migration `0079_backfill_tick_quality_scale.sql` normalised the API-sync rows but **explicitly
skipped JSON-import rows** ("already on the 1-5 scale"), which is why the fix never reached them —
this is the "our migration didn't fix everyone" gap.

**Why it matters for this project specifically:** 83% of the cohort's quality ratings (38,358 of
46,205) are in exactly this broken block. Their richest contribution — "this is a 3-star classic"
— is stored as `3` and would render as **3 out of 5** if any feature surfaced per-tick quality
naively. That is worse than showing nothing.

Note the aggregate column `board_climb_stats.quality_average` is *separately* normalised (via
`normalizeQualityTo5`, guarded by `quality_normalized`) and is fine. The bug is specific to the
per-tick `boardsesh_ticks.quality` column — which is the one you'd read to show *who* rated *what*.

### What a fix looks like (tracked in [#3390](https://github.com/boardsesh/boardsesh/issues/3390))

1. **Re-normalise the JSON-import backfill.** Convert the raw-1–3 Kilter import rows to 1–5 using
   the same `convertQuality` mapping the API path uses (1→1, 2→3, 3→5). The tricky part: a raw
   `3` (should become `5`) is indistinguishable from a correctly-converted `3` unless you scope
   the rewrite to the JSON-import source (`aurora_id LIKE 'json-import-%'`) on Kilter, which is
   knowable per row.
2. **Fix the import path** so future logbook imports convert `stars` instead of trusting it
   (`json-import.ts:962`).
3. **Consider a per-row scale flag** (like `board_climb_stats.quality_normalized`) so this class
   of bug is detectable rather than inferred from a distribution.

Detection query for the provably-broken rows: aurora-synced ticks with `quality IN (0,2,4)` can't
exist after conversion (valid values are 1/3/5). That's a lower bound — raw 1s and 3s hide inside
otherwise-valid buckets.

---

## 4. The opportunity: surface strong-climber data to the sub-elite majority

The audience is real and large: **85.5% of active loggers (with 5+ graded sends) peak below V10.**
They are choosing what to climb and trusting displayed grades with no easy way to know which
climbs are actually good or accurately graded. This cohort has already answered both questions,
implicitly, tens of thousands of times.

Three concrete, data-backed surfaces (sizing assumes the scale fix in §3 lands first):

### A. "Strong climbers' classics" — a vetted quality shelf

Climbs the cohort rated top-quality, scale-aware:

- **13,122** distinct climbs have a top-quality rating from **≥1** cohort member.
- **4,725** climbs have **≥2** cohort members agreeing it's top-quality.

That 4,725-climb set is a ready-made "climbers' choice" catalog spanning all grades — a strong
filter for a beginner staring at thousands of climbs. Framed for the climber: *"boards' best,
picked by people who've done them."*

### B. Grade confidence / mis-grade flags in the grades people actually climb

In the V2–V9 band (where most users live):

- **16,804** climbs in that band carry a cohort grade opinion.
- **6,220** have **≥2** cohort opinions (reliable enough to act on).
- **317** of those disagree with the displayed grade by ≥1 full grade — **249 the cohort calls
  softer, 68 harder.**

Most mid-grade climbs (95%) are graded fine — but there's a targeted ~5% where strong-climber
consensus flags a real discrepancy. Surfacing "strong climbers think this is soft/stiff for the
grade" on those climbs is honest, specific, and useful — and cheap, because it's a small set.

### C. "Sent by strong climbers" as a trust signal

The cohort has sent 15,357 distinct climbs. On climbs with few global ascents, a couple of
V12-capable climbers having done and rated one is high-signal for someone deciding whether it's
worth pulling on. This is the lightest-weight surface — a badge/line on the climb view — and reuses
data already present.

### Cross-cutting caveat

The cohort's ratings are *already* baked into the global `board_climb_stats` averages Aurora
computes. So the value here is **not** "more coverage" — it's **attribution and weighting**: the
ability to say *"strong climbers specifically rate/grade this"* rather than blending them into an
all-users average where a beginner's and a pro's star carry equal weight. That per-user
granularity is the thing Boardsesh has that the Aurora aggregate throws away — and it's the thing
the quality-scale bug currently makes unusable.

---

## 5. Recommendations, in order

1. **Fix the per-tick quality scale (§3).** Nothing else in §4 is safe to ship until a `3` means
   the same thing everywhere. This is also a general app-wide correctness fix (~235k rows), not
   just a power-user concern.
2. **Prototype "strong climbers' classics" (§4A)** off the corrected data — highest value,
   clearest framing, biggest ready-made set (4,725 climbs).
3. **Add grade-discrepancy flags (§4B)** on the ~317 mid-grade climbs where strong-climber
   consensus and the displayed grade diverge. Small, honest, high-trust.
4. **Re-engagement, separately.** This cohort barely touches social/beta/setter features. If we
   want their explicit contributions (beta videos, comments) and not just their synced history,
   that's a distinct engagement problem worth its own look — they're active and clearly willing to
   rate, they just do it in Aurora's world, not ours.

---

## Appendix: definitions & reproducibility

- **V10+ / grade mapping:** `board_difficulty_grades.boulder_name` (e.g. `7c+/V10` at
  `difficulty = 27` for Kilter). V-number extracted with `regexp_match(boulder_name, 'V([0-9]+)')`;
  V10+ means that number ≥ 10. Some grades are font-only (e.g. `6A`) and yield no V-number — those
  are excluded from V-band stats.
- **Send:** `boardsesh_ticks.status IN ('send','flash')`. **Attempt:** `status = 'attempt'`.
- **Cohort definition (name-free):** the climbers with the most V10+ sends. Where a person holds
  more than one account, ticks are aggregated by person so the cohort counts people, not logins.
- **Data-quality flags found while measuring:** two ticks graded "V16" surfaced as obvious
  mis-grades (isolated outliers, consistent with the source analysis's own `V16(!)` notes); a
  small number of ticks carry `quality = 0` (Aurora "unrated" that should be null).
- **Anonymity:** every number in this doc is a count or average over the cohort or the whole
  population. There are no per-user rows. Keep it that way.
- **Reproducing this:** all figures came from read-only SQL against `boardsesh_ticks`,
  `board_difficulty_grades`, `board_climb_stats`, and the feature tables. The cohort is rebuilt
  from the grade threshold above, so no stored list of individuals is needed.
