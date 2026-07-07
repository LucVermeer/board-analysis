import type { ConfidenceTier, GradeBandKey } from './constants';

/** Frozen coefficient set the nightly re-blend runs against. */
export interface GradeCoefficients {
  coeffVersion: string;
  /** Per-board echo fraction λ (quick-log auto-copy share of graded ascents). */
  echoFraction: Record<string, number>;
  /** Within-climb SD of genuinely expressed grades, per board:band. */
  sigmaWithin: Record<string, Record<GradeBandKey, number>>;
  /** Between-climb prior variance τ², per board:band. */
  tauSquared: Record<string, Record<GradeBandKey, number>>;
  /**
   * Angle surface: per board → band → angle → offset from the climb's own
   * cross-angle mean (grade points). Only cells with enough support exist;
   * lookups fall back to the band-agnostic 'all' band, then 0.
   */
  angleOffset: Record<string, Partial<Record<GradeBandKey | 'all', Record<number, number>>>>;
  /**
   * Additive cross-board offset onto the universal (Tension-anchored) scale.
   * Kilter ≈ −1.2 (reads soft); Tension 0 by definition. Boards without an
   * entry never publish a universal grade.
   */
  boardOffset: Record<string, { offset: number; sd: number; users: number; looMaxDelta: number }>;
}

/** One climb+angle observation from board_climb_stats, ready to blend. */
export interface ClimbAngleObservation {
  boardType: string;
  climbUuid: string;
  angle: number;
  difficultyAverage: number | null;
  displayDifficulty: number | null;
  ascensionistCount: number;
}

/** Result of the closed-form empirical-Bayes blend for one climb+angle. */
export interface PosteriorGrade {
  localGrade: number | null;
  universalGrade: number | null;
  gradeLow: number | null;
  gradeHigh: number | null;
  confidence: ConfidenceTier;
  postSd: number | null;
}

/** Per-gate outcome persisted with each run. */
export interface GateResult {
  gate: string;
  passed: boolean;
  /** Human-readable metric summary, e.g. "MAE 0.31 vs raw 0.44 (−30%)". */
  detail: string;
  metrics: Record<string, number>;
}
