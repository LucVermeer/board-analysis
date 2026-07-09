import type { ClimbHoldObservation, HoldDifficulty, RidgeOptions } from './types.js';
import { DEFAULT_RIDGE_OPTIONS } from './types.js';

/**
 * De-confounded per-hold difficulty via ridge regression over the hold-incidence
 * matrix, solved by coordinate descent (Gauss–Seidel on the ridge normal
 * equations). No big matrix — one sweep is O(total incidence), so thousands of
 * holds over tens of thousands of climbs stay well inside the nightly budget.
 *
 * Model: grade(climb) ≈ μ + Σ_{h ∈ hand(climb)} a_h + Σ_{f ∈ foot(climb)} b_f.
 * We minimize Σ_c w_c (y_c − pred_c)² + λ(Σ a_h² + Σ b_f²). Each a_h / b_f is the
 * hold's CONTRIBUTION to grade once the co-occurring holds are accounted for — a
 * hold that only ever appears alongside a genuinely hard hold no longer inherits
 * that hold's difficulty (which a raw per-hold mean would wrongly do). The
 * intercept μ is unpenalized.
 *
 * Returns a contribution per placement per role (Δ grade points from the board
 * mean), plus the per-role sample count. Roles with fewer than `minSamples`
 * climbs are left null (too thin to trust).
 */
export function estimateHoldDifficulty(
  climbs: readonly ClimbHoldObservation[],
  options: Partial<RidgeOptions> = {},
): Map<number, HoldDifficulty> {
  const { lambda, iterations, minSamples } = { ...DEFAULT_RIDGE_OPTIONS, ...options };
  const result = new Map<number, HoldDifficulty>();
  if (climbs.length === 0) return result;

  // Namespaced feature ids so a placement used as both hand and foot gets two
  // independent coefficients: `${placementId}` (hand) vs `-1 - placementId` (foot).
  const handKey = (placementId: number): number => placementId;
  const footKey = (placementId: number): number => -1 - placementId;

  const featureClimbs = new Map<number, number[]>();
  const featureWeight = new Map<number, number>(); // Σ w_c over climbs touching the feature
  const featureSampleCount = new Map<number, number>();

  const pushFeatureClimb = (feature: number, climbIndex: number, weight: number): void => {
    let list = featureClimbs.get(feature);
    if (!list) {
      list = [];
      featureClimbs.set(feature, list);
    }
    list.push(climbIndex);
    featureWeight.set(feature, (featureWeight.get(feature) ?? 0) + weight);
    featureSampleCount.set(feature, (featureSampleCount.get(feature) ?? 0) + 1);
  };

  let totalWeight = 0;
  let weightedLabelSum = 0;
  for (let climbIndex = 0; climbIndex < climbs.length; climbIndex++) {
    const climb = climbs[climbIndex];
    const weight = climb.weight > 0 ? climb.weight : 0;
    totalWeight += weight;
    weightedLabelSum += weight * climb.label;

    // De-dup within a role (a climb listing a hold twice must not double-weight it).
    const seen = new Set<number>();
    for (const placementId of climb.handPlacementIds) {
      const feature = handKey(placementId);
      if (seen.has(feature)) continue;
      seen.add(feature);
      pushFeatureClimb(feature, climbIndex, weight);
    }
    for (const placementId of climb.footPlacementIds) {
      const feature = footKey(placementId);
      if (seen.has(feature)) continue;
      seen.add(feature);
      pushFeatureClimb(feature, climbIndex, weight);
    }
  }

  if (totalWeight === 0) return result;

  const coefficient = new Map<number, number>();
  for (const feature of featureClimbs.keys()) coefficient.set(feature, 0);

  // pred_c = μ + Σ current coefficients touching c. Maintained incrementally.
  let intercept = weightedLabelSum / totalWeight;
  const prediction = new Float64Array(climbs.length);
  for (let climbIndex = 0; climbIndex < climbs.length; climbIndex++) prediction[climbIndex] = intercept;

  const weightOf = (climbIndex: number): number => (climbs[climbIndex].weight > 0 ? climbs[climbIndex].weight : 0);

  for (let sweep = 0; sweep < iterations; sweep++) {
    // Update the unpenalized intercept from the current weighted residual mean.
    let weightedResidual = 0;
    for (let climbIndex = 0; climbIndex < climbs.length; climbIndex++) {
      weightedResidual += weightOf(climbIndex) * (climbs[climbIndex].label - prediction[climbIndex]);
    }
    const interceptDelta = weightedResidual / totalWeight;
    if (interceptDelta !== 0) {
      intercept += interceptDelta;
      for (let climbIndex = 0; climbIndex < climbs.length; climbIndex++) prediction[climbIndex] += interceptDelta;
    }

    // One Gauss–Seidel sweep over every feature.
    for (const [feature, climbList] of featureClimbs) {
      const current = coefficient.get(feature) ?? 0;
      // numerator = Σ_c w_c · (residual_excluding_this_feature)
      //           = Σ_c w_c · (y_c − pred_c + current)
      let numerator = 0;
      for (const climbIndex of climbList) {
        const weight = weightOf(climbIndex);
        numerator += weight * (climbs[climbIndex].label - prediction[climbIndex] + current);
      }
      const denominator = (featureWeight.get(feature) ?? 0) + lambda;
      const updated = denominator > 0 ? numerator / denominator : 0;
      const delta = updated - current;
      if (delta !== 0) {
        coefficient.set(feature, updated);
        for (const climbIndex of climbList) prediction[climbIndex] += delta;
      }
    }
  }

  // Assemble per-placement, re-joining the two role coefficients.
  const placementIds = new Set<number>();
  for (const feature of featureClimbs.keys()) {
    placementIds.add(feature >= 0 ? feature : -1 - feature);
  }
  for (const placementId of placementIds) {
    const handFeature = handKey(placementId);
    const footFeature = footKey(placementId);
    const handSampleCount = featureSampleCount.get(handFeature) ?? 0;
    const footSampleCount = featureSampleCount.get(footFeature) ?? 0;
    result.set(placementId, {
      hand: handSampleCount >= minSamples ? (coefficient.get(handFeature) ?? 0) : null,
      foot: footSampleCount >= minSamples ? (coefficient.get(footFeature) ?? 0) : null,
      handSampleCount,
      footSampleCount,
    });
  }

  return result;
}

/**
 * Quantize a distribution of contributions into 1–5 buckets by rank (quintiles),
 * for the `user_hold_classifications` shadow-write (hand_rating / foot_rating).
 * Returns a function value → 1..5. Ties and small samples degrade gracefully.
 */
export function makeQuintileScaler(values: readonly number[]): (value: number) => number {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return () => 3;
  const cut = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const q20 = cut(0.2);
  const q40 = cut(0.4);
  const q60 = cut(0.6);
  const q80 = cut(0.8);
  return (value: number): number => {
    if (!Number.isFinite(value)) return 3;
    if (value <= q20) return 1;
    if (value <= q40) return 2;
    if (value <= q60) return 3;
    if (value <= q80) return 4;
    return 5;
  };
}
