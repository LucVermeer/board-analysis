import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePosteriorGrade } from '../blend';
import { CONFIDENCE } from '../constants';
import type { ClimbAngleObservation, GradeCoefficients } from '../types';

function makeCoefficients(overrides: Partial<GradeCoefficients> = {}): GradeCoefficients {
  return {
    coeffVersion: 'test',
    echoFraction: { kilter: 0.8 },
    sigmaWithin: { kilter: { 'v0-2': 0.8, 'v3-5': 0.8, 'v6-8': 0.8, 'v9+': 0.8 } },
    tauSquared: { kilter: { 'v0-2': 0.25, 'v3-5': 0.25, 'v6-8': 0.25, 'v9+': 0.25 } },
    angleOffset: { kilter: { all: { 20: -1.0, 40: 0.0, 50: 1.0 } } },
    boardOffset: { kilter: { offset: -1.2, sd: 0.4, users: 50, looMaxDelta: 0.1 } },
    raterModel: {},
    behaviorModel: {},
    bridgeReadiness: {},
    ...overrides,
  };
}

function observation(partial: Partial<ClimbAngleObservation>): ClimbAngleObservation {
  return {
    boardType: 'kilter',
    climbUuid: 'climb-1',
    angle: 40,
    difficultyAverage: null,
    displayDifficulty: null,
    ascensionistCount: 0,
    ...partial,
  };
}

void describe('computePosteriorGrade — content prior (cold tail)', () => {
  void test('uses content_prior when there is no crowd mean and no cross-angle prior', () => {
    const target = observation({ contentPrior: 22.5, contentSd: 1.8, displayDifficulty: 18 });
    const result = computePosteriorGrade(target, [], makeCoefficients());
    assert.equal(result.localGrade, 22.5); // geometry estimate, not the display 18
    assert.equal(result.postSd, 1.8);
    assert.equal(result.confidence, CONFIDENCE.provisional); // has model evidence + a band
    assert.ok(result.gradeLow !== null && result.gradeHigh !== null, 'content grade carries a CI band');
  });

  void test('falls back to the setter number when no content_prior exists (unchanged behavior)', () => {
    const target = observation({ displayDifficulty: 18 });
    const result = computePosteriorGrade(target, [], makeCoefficients());
    assert.equal(result.localGrade, 18);
    assert.equal(result.confidence, CONFIDENCE.setterOnly);
    assert.equal(result.postSd, null);
  });

  void test('never overrides an established crowd mean', () => {
    const target = observation({ difficultyAverage: 18, ascensionistCount: 200, contentPrior: 30, contentSd: 1 });
    const result = computePosteriorGrade(target, [], makeCoefficients());
    assert.ok(
      result.localGrade !== null && Math.abs(result.localGrade - 18) <= 1.0,
      'stays within no-shock of the crowd',
    );
    assert.notEqual(result.localGrade, 30); // content ignored when a crowd has spoken
  });

  void test('prefers a real cross-angle prior over content_prior', () => {
    // Target has no own crowd mean, but a sibling angle does → the cross-angle
    // prior wins; content_prior is the last resort only.
    const sibling = observation({ angle: 20, difficultyAverage: 15, ascensionistCount: 60 });
    const target = observation({ angle: 40, contentPrior: 30, contentSd: 1 });
    const result = computePosteriorGrade(target, [sibling, target], makeCoefficients());
    assert.notEqual(result.localGrade, 30); // driven by the sibling, not content
    assert.notEqual(result.postSd, 1);
  });
});
