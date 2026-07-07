-- Custom SQL migration file, put your code below! --
--
-- Repair boardsesh_ticks.quality rows poisoned by an OLD proportional
-- quality-conversion formula on the live Aurora ascent-pull path, and clear any
-- remaining out-of-range value so the 1-5 CHECK constraint (0153) can be added.
--
-- Context
--   boardsesh_ticks.quality is a 1-5 scale. convertQuality maps Aurora's 1-3
--   rating with {0→NULL, 1→1, 2→3, 3→5}, so an untouched aurora-synced ascent
--   (updated_at <= aurora_synced_at) can only hold NULL/1/3/5 — the detection
--   invariant established by migration 0139. Before convertQuality, the live
--   pull used a proportional formula that emitted 0 and 2, which are impossible
--   under the correct mapping. Prod (read-only, 2026-07-07): 411 such rows on the
--   non-json-import ascent path (399 at quality=2, 12 at quality=0).
--
--   json-import rows (aurora_id LIKE 'json-import-%') are a separate path already
--   corrected by migrations 0139/0140 (applied on prod), so they are NOT touched
--   here — this scope is the complement (aurora_id NOT LIKE 'json-import-%').
--
-- Fix
--   0 → NULL (old-formula "unrated"), 2 → 1 (old-formula low rating). Setting
--   updated_at = now() pushes corrected rows out of the updated_at <=
--   aurora_synced_at window, so a re-run is a no-op (same idempotency as 0139),
--   and lets offline clients re-pull the corrected value.
--
-- The second statement is a defensive catch-all: any quality still outside
-- [1,5] (none expected beyond the 12 zeros above, which statement 1 already
-- nulled) is set NULL, guaranteeing the ADD CONSTRAINT in 0153 validates.

-- 1. Old-formula poison on the live ascent pull → convertQuality semantics.
UPDATE boardsesh_ticks
   SET quality = CASE quality WHEN 0 THEN NULL WHEN 2 THEN 1 ELSE quality END,
       updated_at = now()
 WHERE aurora_type = 'ascents'
   AND aurora_id NOT LIKE 'json-import-%'
   AND aurora_synced_at IS NOT NULL
   AND updated_at <= aurora_synced_at
   AND quality IN (0, 2);
--> statement-breakpoint

-- 2. Defensive: clear any remaining out-of-range quality so the CHECK holds.
UPDATE boardsesh_ticks
   SET quality = NULL,
       updated_at = now()
 WHERE quality IS NOT NULL
   AND (quality < 1 OR quality > 5);
