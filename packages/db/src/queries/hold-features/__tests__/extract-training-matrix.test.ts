import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingRow } from '../training-matrix';

// Minimal FeatureRow shape the assembler reads from.
const feature = (placementId: number, overrides: Record<string, unknown> = {}) => ({
  placement_id: placementId,
  norm_x: 0.5,
  norm_y: 0.5,
  edge_dist: 0.5,
  neighbor_dist: 0.1,
  hand_difficulty: 2,
  foot_difficulty: -1,
  pull_direction: 90,
  is_kickboard: false,
  coarse_type: null,
  ...overrides,
});

void describe('buildTrainingRow', () => {
  const stat = { climb_uuid: 'abc', angle: 40, label: 18.5, n: 120, layout_id: 1, fingerprint: 'fp1' };

  test('joins holds to their features and maps roles', () => {
    const features = new Map([
      [10, feature(10, { hand_difficulty: 3 })],
      [20, feature(20, { coarse_type: 'foot' })],
    ]);
    const row = buildTrainingRow(
      stat,
      [
        { placement_id: 10, hold_state: 'HAND' },
        { placement_id: 20, hold_state: 'FOOT' },
        { placement_id: 30, hold_state: 'STARTING' }, // no feature row → nulls, still a hand hold
      ],
      features,
    );
    assert.equal(row.climbUuid, 'abc');
    assert.equal(row.angle, 40);
    assert.equal(row.label, 18.5);
    assert.equal(row.holds.length, 3);
    assert.equal(row.holds[0].role, 'hand');
    assert.equal(row.holds[0].hd, 3);
    assert.equal(row.holds[1].role, 'foot');
    assert.equal(row.holds[1].footSet, true);
    // Hold with no feature row keeps its role but carries null features.
    assert.equal(row.holds[2].role, 'hand');
    assert.equal(row.holds[2].hd, null);
    assert.equal(row.holds[2].nx, null);
  });

  test('skips malformed hold states', () => {
    const row = buildTrainingRow(
      stat,
      [
        { placement_id: 10, hold_state: 'HAND' },
        { placement_id: 11, hold_state: 'NaN=undefined' }, // known bad-parse rows
      ],
      new Map([[10, feature(10)]]),
    );
    assert.equal(row.holds.length, 1);
  });
});
