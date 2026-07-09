import {
  CONFIDENCE,
  KILTER_DISPLAY_DELTA_HYGIENE_BOARD,
  KILTER_DISPLAY_DELTA_MAX,
  KILTER_DISPLAY_DELTA_MIN,
} from './constants';
import type { GateResult, PosteriorGrade } from './types';

export interface DisplayDeltaHygieneInput {
  boardType: string;
  displayDifficulty: number | null;
  posterior: PosteriorGrade;
}

export interface DisplayDeltaHygieneResult {
  posterior: PosteriorGrade;
  downgraded: boolean;
  checked: boolean;
  skippedMissingUniversal: boolean;
  roundedDelta: number | null;
}

export interface DisplayDeltaHygieneStats {
  checkedRows: number;
  skippedMissingUniversalRows: number;
  downgradedRows: number;
  minDelta: number | null;
  maxDelta: number | null;
}

export function createDisplayDeltaHygieneStats(): DisplayDeltaHygieneStats {
  return { checkedRows: 0, skippedMissingUniversalRows: 0, downgradedRows: 0, minDelta: null, maxDelta: null };
}

function isOutsideKilterDisplayDelta(delta: number): boolean {
  return delta < KILTER_DISPLAY_DELTA_MIN || delta > KILTER_DISPLAY_DELTA_MAX;
}

export function applyDisplayDeltaHygiene(input: DisplayDeltaHygieneInput): DisplayDeltaHygieneResult {
  if (
    input.boardType !== KILTER_DISPLAY_DELTA_HYGIENE_BOARD ||
    input.posterior.confidence !== CONFIDENCE.confirmed ||
    input.displayDifficulty === null ||
    !Number.isFinite(input.displayDifficulty)
  ) {
    return {
      posterior: input.posterior,
      downgraded: false,
      checked: false,
      skippedMissingUniversal: false,
      roundedDelta: null,
    };
  }

  if (input.posterior.universalGrade === null || !Number.isFinite(input.posterior.universalGrade)) {
    return {
      posterior: input.posterior,
      downgraded: false,
      checked: false,
      skippedMissingUniversal: true,
      roundedDelta: null,
    };
  }

  const roundedDelta = Math.round(input.posterior.universalGrade) - Math.round(input.displayDifficulty);
  if (!isOutsideKilterDisplayDelta(roundedDelta)) {
    return {
      posterior: input.posterior,
      downgraded: false,
      checked: true,
      skippedMissingUniversal: false,
      roundedDelta,
    };
  }

  return {
    posterior: { ...input.posterior, confidence: CONFIDENCE.provisional },
    downgraded: true,
    checked: true,
    skippedMissingUniversal: false,
    roundedDelta,
  };
}

export function recordDisplayDeltaHygiene(stats: DisplayDeltaHygieneStats, result: DisplayDeltaHygieneResult): void {
  if (result.checked) stats.checkedRows += 1;
  if (result.skippedMissingUniversal) stats.skippedMissingUniversalRows += 1;
  if (!result.downgraded || result.roundedDelta === null) return;
  stats.downgradedRows += 1;
  stats.minDelta = stats.minDelta === null ? result.roundedDelta : Math.min(stats.minDelta, result.roundedDelta);
  stats.maxDelta = stats.maxDelta === null ? result.roundedDelta : Math.max(stats.maxDelta, result.roundedDelta);
}

export function mergeDisplayDeltaHygieneStats(
  target: DisplayDeltaHygieneStats,
  source: DisplayDeltaHygieneStats,
): void {
  target.checkedRows += source.checkedRows;
  target.skippedMissingUniversalRows += source.skippedMissingUniversalRows;
  target.downgradedRows += source.downgradedRows;
  if (source.minDelta !== null)
    target.minDelta = target.minDelta === null ? source.minDelta : Math.min(target.minDelta, source.minDelta);
  if (source.maxDelta !== null)
    target.maxDelta = target.maxDelta === null ? source.maxDelta : Math.max(target.maxDelta, source.maxDelta);
}

export function evaluateDisplayDeltaHygiene(stats: DisplayDeltaHygieneStats): GateResult {
  const minDelta = stats.minDelta ?? 0;
  const maxDelta = stats.maxDelta ?? 0;
  let detail: string;
  if (stats.checkedRows === 0 && stats.skippedMissingUniversalRows > 0) {
    detail = `${stats.skippedMissingUniversalRows} Kilter confirmed rows not checked for rounded universal-display delta because universal grades were unavailable`;
  } else if (stats.downgradedRows === 0) {
    detail = `0 Kilter confirmed rows downgraded for rounded universal-display delta outside [${KILTER_DISPLAY_DELTA_MIN}, ${KILTER_DISPLAY_DELTA_MAX}] across ${stats.checkedRows} checked rows`;
  } else {
    detail = `${stats.downgradedRows} Kilter confirmed rows downgraded for rounded universal-display delta outside [${KILTER_DISPLAY_DELTA_MIN}, ${KILTER_DISPLAY_DELTA_MAX}] across ${stats.checkedRows} checked rows (min ${minDelta}, max ${maxDelta})`;
  }

  return {
    gate: 'display_delta_hygiene',
    passed: true,
    detail,
    metrics: {
      checkedRows: stats.checkedRows,
      skippedMissingUniversalRows: stats.skippedMissingUniversalRows,
      downgradedRows: stats.downgradedRows,
      minDelta,
      maxDelta,
      minAllowed: KILTER_DISPLAY_DELTA_MIN,
      maxAllowed: KILTER_DISPLAY_DELTA_MAX,
    },
  };
}
