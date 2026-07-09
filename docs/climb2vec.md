# Climb2Vec — the hold-geometry content model

Climb2Vec is the Stage-3 evolution of the Boardsesh grade (`docs/boardsesh-grade.md`)
and the engine behind climb similarity and personal-style recommendations. Where
Stages 1–2 model **crowd opinion** (empirical-Bayes over community grades, plus a
rater/behavior de-herding layer), Climb2Vec models the **climb itself**.

## Why geometry

The Stage 1–2 model was built to mirror theCrag's GRAID — a rating system for
**outdoor rock**, where every hold is unique and unknowable, so all you have is
who-sent-what. LED boards are the opposite: every hold's position is fixed and
known, the holdset is identical across every board of a layout/size, and a climb
is a precise set of holds at a known angle. That structure is exactly what the
crowd-only model throws away, and it is strongest where the crowd is weakest:

- **Cold start** — 34% of Kilter climb-angles have a single ascent; a geometry
  prior grades them before the crowd arrives.
- **MoonBoard** — no crowd mean in our feed and no bridge users, so it gets zero
  computed grades today. Geometry is the only way to grade it.
- **Similarity & style** — "climbs like this" and "in your style" need a content
  representation, which co-occurrence data can't provide for the long tail.

The approach adapts MoonBoardRNN (arXiv:2102.01788, Apache-2.0): a learned
per-climb representation whose penultimate **embedding** feeds a grade head, a
similarity index, and per-user style centroids — extended to Boardsesh's
multi-board, foot-aware, angle-adjustable setting.

## How it coexists with the crowd model

The learned grade is **never the surfaced grade**. Its ordinal head emits the
reserved scalar `board_climb_grades.content_prior`, which enters the existing
grade pipeline as one more `DeherdedGradeSignal` (see `deherded.ts`
`combineDeherdedSignals`), most valuable in the no-crowd cold tail and always
bounded by the no-shock clamp so geometry can never overrule an established
crowd. It is trained on the Stage-2 **de-herded** crowd mean (frozen), never on
the EB posterior that consumes it — no feedback loop.

## Data spine (verified in prod)

- Per-hold geometry is complete on every board (`board_holes.x,y`), but there is
  **no physical hold size/type/radius anywhere** — behavioral difficulty +
  geometry + set membership are the substitutes; true jug/crimp/sloper is a
  documented ceiling.
- The join spine is load-bearing: `board_climb_holds.hold_id` is the frames
  **placement** id, not `board_holes.id`. Coordinates come via
  `board_climb_holds.hold_id → board_placements(board_type,id) → board_holes`.
- Kilter carries the labels (36.7k climb-angles at ≥20 ascents) and the only
  viable "also sent" co-occurrence head (~17% of climb-angles) — hence Kilter-first.

## Serving

Offline PyTorch trains + batch-scores (weekly, mirroring the coefficient refit)
and only ever `COPY`s two artifacts into Postgres: `content_prior` and embedding
`float[]`. Python never touches the request path or the nightly blend. Everything
downstream is pure TypeScript on the existing GitHub Actions crons. Embeddings are
`float[]` with a materialized top-K neighbor table — `pg_dump`-portable, no
pgvector needed at ~10⁵ climbs/board (it stays a drop-in later swap, same
`CREATE EXTENSION` class as the already-required PostGIS).

## Phased rollout (Kilter-first; each phase stacks on the last)

| #     | Phase                                             | Ships                                                                                                                                    |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | **Hold-feature substrate** ✅ (this PR)           | `board_hold_features` + nightly `refresh-hold-features.ts`; shadow-fills `user_hold_classifications`.                                    |
| 1     | Climb2Vec training + validation (offline PyTorch) | Trained encoder + grade/embedding export; grade accuracy vs the MoonBoardRNN benchmark + a GBM baseline; kNN duplicate-retrieval sanity. |
| 2     | `content_prior` into the blend                    | Geometry-informed grades on sparse/new Kilter climbs.                                                                                    |
| 3     | Embedding similarity                              | `board_climb_embeddings` + top-K neighbors; upgrades `similarClimbs` (Jaccard fallback).                                                 |
| 4     | "Also sent" item-item CF                          | Co-send neighbors from `boardsesh_ticks` + a climb-detail rail.                                                                          |
| 5     | Style / anti-style recs                           | Per-user style centroids → "recommended in your style" / "train your anti-style".                                                        |
| 6     | Generalize to Tension + MoonBoard                 | First-ever MoonBoard grades (`content_only`); multi-board similarity.                                                                    |

## Phase 0 — the hold-feature substrate (shipped here)

`board_hold_features` (`packages/db/src/schema/app/hold-features.ts`) holds one
row per placement, regenerated nightly by
`packages/db/scripts/refresh-hold-features.ts`:

- **Geometry** (`packages/db/src/queries/hold-features/geometry.ts`) — normalized
  position, edge & nearest-neighbour distance, and a geometry-derived pull
  direction, all angle-independent and normalized to each board's hole bbox.
- **Behavioral difficulty**
  (`packages/db/src/queries/hold-features/behavioral.ts`) — a **de-confounded**
  per-hold contribution, ridge-regressed over the hold-incidence matrix of graded
  climbs (`ascensionist_count ≥ 20`), split by role (hand vs foot). A raw per-hold
  mean would let a hold inherit the difficulty of the hard holds it co-occurs
  with; the ridge attributes it correctly (unit-tested).
- **Coarse type** (`set-type.ts`) — footholds from set membership; everything else
  NULL (no shape data).

The job shadow-writes `user_hold_classifications` (hand/foot rating quintiles +
pull direction) under a reserved `system-hold-classifier` user, reviving the
dormant per-hold layer with generated data instead of user input.

Run it: `node --import tsx packages/db/scripts/refresh-hold-features.ts --dry-run`
(`--board=<name>`, `--no-shadow`). Tests:
`node --import tsx --test packages/db/src/queries/hold-features/__tests__/hold-features.test.ts`.
