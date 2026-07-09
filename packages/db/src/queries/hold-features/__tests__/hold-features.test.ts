import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeGeometryFeatures, pullDirectionToCentroid } from '../geometry';
import { estimateHoldDifficulty, makeQuintileScaler } from '../behavioral';
import { coarseTypeFromSetName, isKickboardHole } from '../set-type';
import type { PlacementGeom, ClimbHoldObservation } from '../types';

const geom = (placementId: number, x: number, y: number): PlacementGeom => ({
  placementId,
  holeId: placementId,
  setId: 1,
  x,
  y,
  isKickboard: false,
});

void describe('geometry features', () => {
  test('normalizes position and edge distance within the board bbox', () => {
    // Corners + centre of a 4×4 box.
    const features = computeGeometryFeatures([
      geom(1, 0, 0),
      geom(2, 0, 4),
      geom(3, 4, 0),
      geom(4, 4, 4),
      geom(5, 2, 2),
    ]);

    const bottomLeft = features.get(1)!;
    assert.equal(bottomLeft.normX, 0);
    assert.equal(bottomLeft.normY, 0);
    assert.equal(bottomLeft.edgeDist, 0); // on the edge

    const centre = features.get(5)!;
    assert.equal(centre.normX, 0.5);
    assert.equal(centre.normY, 0.5);
    assert.equal(centre.edgeDist, 0.5); // furthest from any edge
    assert.equal(centre.pullDirection, 180); // at the centroid → gravity default
  });

  test('neighbour distance is the nearest hold, normalized by the diagonal', () => {
    const features = computeGeometryFeatures([geom(1, 0, 0), geom(2, 4, 4), geom(3, 2, 2)]);
    // From the centre (2,2), nearest corner is √8 ≈ 2.828; diagonal is √32 ≈ 5.657.
    assert.ok(Math.abs(features.get(3)!.neighborDist - 0.5) < 1e-9);
  });

  test('single placement and degenerate boards do not divide by zero', () => {
    const single = computeGeometryFeatures([geom(1, 10, 10)]);
    const only = single.get(1)!;
    assert.equal(only.normX, 0.5);
    assert.equal(only.normY, 0.5);
    assert.equal(only.edgeDist, 0.5);
    assert.equal(only.neighborDist, 0);
  });

  test('pull direction uses the 0=up,90=right,180=down,270=left convention', () => {
    // Centroid at (2,2).
    assert.equal(pullDirectionToCentroid(2, 0, 2, 2), 0); // below centre → pulled up
    assert.equal(pullDirectionToCentroid(0, 2, 2, 2), 90); // left of centre → pulled right
    assert.equal(pullDirectionToCentroid(2, 4, 2, 2), 180); // above centre → pulled down
    assert.equal(pullDirectionToCentroid(4, 2, 2, 2), 270); // right of centre → pulled left
    assert.equal(pullDirectionToCentroid(0, 0, 2, 2), 45); // bottom-left → up-right
  });
});

void describe('de-confounded per-hold difficulty (ridge)', () => {
  // Truth: μ=10, hard hold=+4, neutral hold=0, easy hold=−2. The neutral hold
  // always shares a climb with a hard OR easy hold, so its RAW mean grade (~11)
  // would look hard — the ridge must instead attribute the difficulty to the hard
  // hold and leave the neutral one near 0.
  const hardHoldId = 100;
  const neutralHoldId = 200;
  const easyHoldId = 300;
  const hand = (ids: number[], label: number): ClimbHoldObservation => ({
    label,
    weight: 1,
    handPlacementIds: ids,
    footPlacementIds: [],
  });
  const climbs: ClimbHoldObservation[] = [
    hand([hardHoldId], 14),
    hand([neutralHoldId], 10),
    hand([easyHoldId], 8),
    hand([hardHoldId, neutralHoldId], 14),
    hand([hardHoldId, easyHoldId], 12),
    hand([neutralHoldId, easyHoldId], 8),
  ];

  test('recovers per-hold contributions and de-confounds the co-occurring hold', () => {
    const difficulty = estimateHoldDifficulty(climbs, { lambda: 0.01, iterations: 400, minSamples: 1 });
    const hardContribution = difficulty.get(hardHoldId)!.hand!;
    const neutralContribution = difficulty.get(neutralHoldId)!.hand!;
    const easyContribution = difficulty.get(easyHoldId)!.hand!;
    assert.ok(Math.abs(hardContribution - 4) < 0.5, `hard should be ≈+4, got ${hardContribution}`);
    assert.ok(
      Math.abs(neutralContribution) < 0.5,
      `neutral should be ≈0 despite co-occurring with hard, got ${neutralContribution}`,
    );
    assert.ok(Math.abs(easyContribution + 2) < 0.5, `easy should be ≈−2, got ${easyContribution}`);
    // The point of de-confounding: the neutral hold ends up much easier than the
    // hard hold even though its raw mean grade (14+10+8)/3 ≈ 10.7 sits close to the
    // hard hold's (14+14+12)/3 ≈ 13.3.
    assert.ok(
      hardContribution - neutralContribution > 3,
      'hard hold must separate from the neutral hold it co-occurs with',
    );
  });

  test('leaves thin holds null below minSamples', () => {
    const difficulty = estimateHoldDifficulty(climbs, { lambda: 1, iterations: 50, minSamples: 3 });
    // Each named hold appears in exactly 3 climbs, so minSamples=3 keeps them, but a
    // hold seen once would be null:
    const withRare = estimateHoldDifficulty([...climbs, hand([999], 11)], {
      lambda: 1,
      iterations: 50,
      minSamples: 3,
    });
    assert.equal(withRare.get(999)!.hand, null);
    assert.notEqual(difficulty.get(hardHoldId)!.hand, null);
  });

  test('hand and foot roles get independent coefficients for the same placement', () => {
    const shared = 500;
    const mixed: ClimbHoldObservation[] = [
      { label: 15, weight: 1, handPlacementIds: [shared], footPlacementIds: [] },
      { label: 15, weight: 1, handPlacementIds: [shared], footPlacementIds: [] },
      { label: 9, weight: 1, handPlacementIds: [], footPlacementIds: [shared] },
      { label: 9, weight: 1, handPlacementIds: [], footPlacementIds: [shared] },
    ];
    const difficulty = estimateHoldDifficulty(mixed, { lambda: 0.01, iterations: 200, minSamples: 1 });
    const entry = difficulty.get(shared)!;
    assert.equal(entry.handSampleCount, 2);
    assert.equal(entry.footSampleCount, 2);
    assert.notEqual(entry.hand, null);
    assert.notEqual(entry.foot, null);
    assert.ok(entry.hand! > entry.foot!, 'the same placement is harder for hands here than feet');
  });

  test('empty input returns an empty map', () => {
    assert.equal(estimateHoldDifficulty([]).size, 0);
  });
});

void describe('quintile scaler', () => {
  test('maps a distribution to 1..5 monotonically', () => {
    const scale = makeQuintileScaler([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(scale(0), 1);
    assert.equal(scale(9), 5);
    assert.ok(scale(2) <= scale(5));
    assert.ok(scale(5) <= scale(9));
  });

  test('degrades to the middle bucket with no data', () => {
    assert.equal(makeQuintileScaler([])(42), 3);
  });
});

void describe('coarse hold type from set membership', () => {
  test('detects footholds, leaves everything else null', () => {
    assert.equal(coarseTypeFromSetName('Foot Set'), 'foot');
    assert.equal(coarseTypeFromSetName('Screw Ons'), 'foot');
    assert.equal(coarseTypeFromSetName('Mainline'), null);
    assert.equal(coarseTypeFromSetName('Bolt Ons'), null);
    assert.equal(coarseTypeFromSetName(null), null);
  });

  test('flags kickboard holes by grid name or set name', () => {
    assert.equal(isKickboardHole('35,KB1', null), true);
    assert.equal(isKickboardHole('2,13', null), false);
    assert.equal(isKickboardHole(null, 'Mainline Kickboard'), true);
    assert.equal(isKickboardHole('2,13', 'Mainline'), false);
  });
});
