/**
 * The journal-vs-ledger gaps production already carried when the deploy gate
 * started failing on them.
 *
 * `VERIFY_MIGRATION_JOURNAL=1` landed fail-closed (#2933) and immediately
 * blocked every production deploy: `migrate` is the `needs:` gate for both
 * `deploy-web` and `deploy-production-backend`, and the production ledger has no
 * row matching 20 of the 188 journal entries. None of those 20 are recent — they
 * accumulated over two years, so the gate's first run reported a backlog rather
 * than the regression it was built to catch.
 *
 * Every tag below is subtracted before the gate throws. A gap in any *other*
 * tag still fails the deploy, which is the case that matters: the incident
 * behind #2933 was a freshly appended migration (`0129_numerous_star_brand`)
 * that drizzle's high-water mark skipped, and that shape is still caught on the
 * first deploy after it happens. The gate keeps naming the baselined tags on
 * every run, so they stay visible instead of becoming permanently invisible.
 *
 * ## What is in here
 *
 * A missing ledger row has two possible causes and this list mixes both, because
 * telling them apart needs the production schema in front of you (see
 * `docs/db-migrations.md`):
 *
 *  - **The `.sql` changed after production applied it.** The ledger stores the
 *    hash of the file as it was when it ran, so an edit orphans the row.
 *    `0103_thick_puck` is the clearest case: it landed as bare `CREATE TABLE`
 *    and was rewritten with `IF NOT EXISTS` guards a day later, after the deploy
 *    that applied the original. 11 of the 20 tags below have more than one
 *    content version in git history, which is the same signature.
 *  - **The migration never ran, or its row was lost.** The high-water-mark skip
 *    (#2933's own failure mode), or a hand repair / restore that rebuilt the
 *    schema without the ledger row. The `0025`–`0029` block arrived with the
 *    migration consolidation in #470, which rewrote the journal around rows that
 *    already existed.
 *
 * That second cause is why this file is a stopgap and not a resolution: if one
 * of these migrations genuinely never ran, its objects are absent in production
 * and this list is now hiding that. The tags are itemised rather than collapsed
 * into a "before tag N" cut-off precisely so shrinking the list is a normal
 * reviewable diff — repair a tag against production, delete its line.
 *
 * ## Shrinking it
 *
 * `DB_URL=postgres://... vp run db:verify-journal` prints each remaining tag
 * with the ledger hash its repair row needs. Repair per `docs/db-migrations.md`
 * ("The journal-vs-ledger check"), then remove the tag here. Do not add a tag
 * without a reason: a new gap means a migration that did not reach production,
 * and baselining it ships the outage #2933 was closed to prevent.
 */

export interface LedgerBaseline {
  /** ISO date the gap was observed, so a stale list reads as stale. */
  readonly recordedAt: string;
  /** Where the gap was observed, for anyone re-deriving the list. */
  readonly source: string;
  /** Journal-order tags the deploy gate tolerates. */
  readonly tags: readonly string[];
}

/**
 * Observed on the production database (`tramway.proxy.rlwy.net`) by the first
 * `Production Deploy` run that armed the gate: 20 of 188 journal entries had no
 * ledger row, with 183 rows present.
 */
export const PRODUCTION_LEDGER_BASELINE: LedgerBaseline = {
  recordedAt: '2026-07-30',
  source: 'Production Deploy run 30528469806 (migrate job), commit f3a1a22',
  tags: [
    '0000_cloudy_carlie_cooper',
    '0002_unique_climbstats',
    '0014_add_missing_primary_keys',
    '0025_fix_missing_tables',
    '0026_migrate_aurora_to_boardsesh_ticks',
    '0027_add_sequence_column',
    '0028_add_instagram_url',
    '0029_add_aurora_id_unique_index',
    '0025_shocking_clint_barton',
    '0052_broad_red_ghost',
    '0067_fat_betty_ross',
    '0068_add_search_performance_indexes',
    '0069_mature_morg',
    '0073_denormalize_climb_sets_sizes',
    '0077_mixed_lady_deathstrike',
    '0078_yummy_kylun',
    '0079_backfill_tick_quality_scale',
    '0082_add_user_climb_percentiles',
    '0092_long_demogoblin',
    '0103_thick_puck',
  ],
};

/** A baseline that tolerates nothing. The default for any folder that is not this repo's. */
export const EMPTY_LEDGER_BASELINE: LedgerBaseline = {
  recordedAt: PRODUCTION_LEDGER_BASELINE.recordedAt,
  source: 'no baseline',
  tags: [],
};
