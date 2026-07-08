import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { blendedQualityAverageSql } from '../quality-blend';
import { sqlText } from '../../../test-utils/sql-text';

void describe('blendedQualityAverageSql', () => {
  const fragment = blendedQualityAverageSql({
    upstreamQualityAverage: sql`uqa`,
    upstreamAscensionistCount: sql`uc`,
    boardseshQualitySum: sql`bs_sum`,
    boardseshQualityCount: sql`bs_count`,
  });
  // Normalize whitespace for stable substring assertions.
  const text = sqlText(fragment).replace(/\s+/g, ' ').trim();

  void it('is a weighted average: upstream avg × ascent-count weight plus the Boardsesh sum', () => {
    assert.match(text, /COALESCE\(uqa \* uc, 0\) \+ COALESCE\(bs_sum, 0\)/);
  });

  void it('divides by the summed weights, guarded by NULLIF(…, 0) so both-absent → NULL', () => {
    assert.match(text, /\/ NULLIF\(/);
    assert.match(text, /COALESCE\(CASE WHEN uqa IS NOT NULL THEN uc END, 0\) \+ COALESCE\(bs_count, 0\), 0 \)/);
  });

  void it('drops the upstream term from the WEIGHT when there is no upstream quality', () => {
    // The CASE guard means a manufacturer-unrated climb (uqa NULL) is not
    // diluted by a phantom zero-weight upstream — the denominator becomes the
    // pure Boardsesh count.
    assert.match(text, /CASE WHEN uqa IS NOT NULL THEN uc END/);
  });

  void it('references every operand it was given (no operand silently dropped)', () => {
    for (const operand of ['uqa', 'uc', 'bs_sum', 'bs_count']) {
      assert.ok(text.includes(operand), `blend must reference ${operand}`);
    }
  });
});
