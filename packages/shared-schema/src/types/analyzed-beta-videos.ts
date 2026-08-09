export type AnalyzedBetaClimbCandidate = {
  normalizedClimbId: string;
  climbId: string;
  climbName: string;
  boardLayout: string;
  grades: string[];
  angles: string[];
};

export type AnalyzedBetaVideo = {
  id: string;
  provider: string;
  providerClimbId: string;
  boardType: string;
  boardLayout: string;
  sourceAccount: string;
  postKey: string;
  postUrl: string;
  mediaItemKey: string;
  mediaItemIndex: number | null;
  mediaItemCount: number | null;
  segmentKey: string;
  evidenceScope: string;
  resolutionScope: string;
  assignmentState: string;
  assignmentMethod: string;
  uncertaintyReasons: string[];
  isDefinitive: boolean;
  hasMoveAnalysis: boolean;
  candidateClimbs: AnalyzedBetaClimbCandidate[];
  climb: {
    id: string;
    normalizedId: string;
    name: string;
    grade: string;
    angle: string;
    boardLayout: string;
    setterUsername: string;
  } | null;
  playbackPath: string;
  movesPath: string | null;
};

export type AnalyzedBetaHold = {
  key: string;
  col: number;
  row: number;
};

export type AnalyzedBetaMoveSummary = {
  moveKey: string;
  targetHolds: AnalyzedBetaHold[];
  videoCount: number;
  confirmedVideoCount: number;
  handCounts: { hand: string; count: number }[];
};

export type AnalyzedBetaMoveTransition = {
  hand: string;
  source: AnalyzedBetaHold;
  destination: AnalyzedBetaHold;
  sourceAssumed: boolean;
};

export type AnalyzedBetaMoveAttempt = {
  moveKey: string;
  videoId: string;
  sourceAccount: string;
  localMoveId: string;
  localOrdinal: number;
  targetHolds: AnalyzedBetaHold[];
  transitions: AnalyzedBetaMoveTransition[];
  playbackStartS: number;
  playbackEndS: number;
  confidence: number;
  warnings: string[];
  occurrenceCount: number;
};

export type AnalyzedBetaNavigation = {
  confirmedVideoCount: number;
  analyzedVideoCount: number;
  moves: AnalyzedBetaMoveSummary[];
};
