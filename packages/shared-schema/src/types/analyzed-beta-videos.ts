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
