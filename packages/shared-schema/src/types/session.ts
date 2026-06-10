// Session types

export type SessionConnectionState = 'CONNECTED' | 'RECONNECTING';

export type SessionUser = {
  id: string;
  username: string;
  isLeader: boolean;
  avatarUrl?: string;
  /** Stable database user UUID (null for unauthenticated connections) */
  userId?: string | null;
  connectionState: SessionConnectionState;
};

export type SessionGradeCount = {
  grade: string;
  count: number;
};

export type SessionHardestClimb = {
  climbUuid: string;
  climbName: string;
  grade: string;
};

export type SessionParticipant = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  sends: number;
  attempts: number;
};

export type SessionSummary = {
  sessionId: string;
  totalSends: number;
  totalAttempts: number;
  gradeDistribution: SessionGradeCount[];
  hardestClimb?: SessionHardestClimb | null;
  participants: SessionParticipant[];
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  goal?: string | null;
};

/** Durable session lifecycle status (DB CHECK: board_sessions.status). */
export type SessionStatus = 'active' | 'inactive' | 'ended';

/** Durable lifecycle status of a session, independent of live presence. */
export type SessionLiveness = {
  id: string;
  status: SessionStatus;
  endedAt?: string | null;
};
