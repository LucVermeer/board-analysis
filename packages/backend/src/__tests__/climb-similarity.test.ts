import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  buildDuplicateClimbErrorMessage,
  buildHoldSignature,
  CLIMB_DUPLICATE_ERROR_CODE,
  findExactDuplicateMatch,
  findSimilarClimbs,
  parseFramesToHoldEntries,
} from '../graphql/resolvers/climbs/climb-similarity';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    execute: vi.fn(),
  },
}));

vi.mock('../db/client', () => ({
  db: mockDb,
}));

describe('parseFramesToHoldEntries', () => {
  it('parses a Kilter frame string into hold + state tuples', () => {
    const entries = parseFramesToHoldEntries('kilter', 'p1117r12p1140r15p1148r13');
    expect(entries).toEqual([
      { frameNumber: 0, holdId: 1117, holdState: 'STARTING' },
      { frameNumber: 0, holdId: 1140, holdState: 'FOOT' },
      { frameNumber: 0, holdId: 1148, holdState: 'HAND' },
    ]);
  });

  it('returns an empty list for null / empty input', () => {
    expect(parseFramesToHoldEntries('kilter', null)).toEqual([]);
    expect(parseFramesToHoldEntries('kilter', '')).toEqual([]);
  });

  it('flattens multi-frame strings with frameNumber preserved', () => {
    const entries = parseFramesToHoldEntries('tension', 'p10r1p20r2,p30r3');
    expect(entries).toEqual([
      { frameNumber: 0, holdId: 10, holdState: 'STARTING' },
      { frameNumber: 0, holdId: 20, holdState: 'HAND' },
      { frameNumber: 1, holdId: 30, holdState: 'FINISH' },
    ]);
  });
});

describe('buildHoldSignature', () => {
  it('produces a stable signature regardless of input order', () => {
    const a = buildHoldSignature([
      { holdId: 25, holdState: 'FINISH' },
      { holdId: 1, holdState: 'STARTING' },
      { holdId: 13, holdState: 'HAND' },
    ]);
    const b = buildHoldSignature([
      { holdId: 1, holdState: 'STARTING' },
      { holdId: 13, holdState: 'HAND' },
      { holdId: 25, holdState: 'FINISH' },
    ]);
    expect(a).toBe(b);
    expect(a).toBe('1:STARTING,13:HAND,25:FINISH');
  });

  it('returns empty signature for empty input', () => {
    expect(buildHoldSignature([])).toBe('');
  });

  it('keeps the most recent state when a hold id appears twice (last write wins)', () => {
    const signature = buildHoldSignature([
      { holdId: 5, holdState: 'STARTING' },
      { holdId: 5, holdState: 'HAND' },
    ]);
    expect(signature).toBe('5:HAND');
  });
});

describe('buildDuplicateClimbErrorMessage', () => {
  it('embeds the existing climb name when known', () => {
    expect(buildDuplicateClimbErrorMessage('Spiders Man')).toBe(
      'A climb with the same holds already exists: "Spiders Man"',
    );
  });

  it('falls back to a generic message when the name is missing', () => {
    expect(buildDuplicateClimbErrorMessage(null)).toBe('A climb with the same holds already exists');
    expect(buildDuplicateClimbErrorMessage('   ')).toBe('A climb with the same holds already exists');
  });
});

describe('CLIMB_DUPLICATE_ERROR_CODE', () => {
  it('is the agreed-upon GraphQL extension code', () => {
    // The frontend gates its duplicate-UX banner on this exact value.
    // Changing it here without updating create-climb-form breaks the gate UI.
    expect(CLIMB_DUPLICATE_ERROR_CODE).toBe('CLIMB_IS_DUPLICATE');
  });
});

describe('findExactDuplicateMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the candidate has no holds (empty signature)', async () => {
    const match = await findExactDuplicateMatch({
      boardType: 'kilter',
      layoutId: 1,
      signature: '',
    });
    expect(match).toBeNull();
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it('returns the existing climb when the DB query yields a row', async () => {
    mockDb.execute.mockResolvedValueOnce([
      {
        uuid: 'existing-uuid',
        name: 'Veiny Ahh Dih',
        setter_username: 'asherwang777',
        angle: 30,
      },
    ]);
    const match = await findExactDuplicateMatch({
      boardType: 'kilter',
      layoutId: 1,
      signature: '1117:STARTING,1140:FOOT',
    });
    expect(match).toEqual({
      uuid: 'existing-uuid',
      name: 'Veiny Ahh Dih',
      setterUsername: 'asherwang777',
      angle: 30,
    });
  });

  it('returns null when no rows match the signature', async () => {
    mockDb.execute.mockResolvedValueOnce([]);
    const match = await findExactDuplicateMatch({
      boardType: 'tension',
      layoutId: 8,
      signature: '999:STARTING',
    });
    expect(match).toBeNull();
  });
});

describe('findSimilarClimbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('short-circuits on empty holds without hitting the DB', async () => {
    const result = await findSimilarClimbs({
      boardType: 'kilter',
      layoutId: 1,
      holds: [],
      threshold: 0.9,
    });
    expect(result).toEqual([]);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it('maps each row to the SimilarClimbResult shape', async () => {
    mockDb.execute.mockResolvedValueOnce([
      {
        uuid: 'similar-1',
        name: 'Dyno from Insta',
        setter_username: 'blakepeyman',
        angle: 40,
        layout_id: 1,
        frames: 'p1117r12',
        shared: 9,
        candidate_hold_count: 10,
        jaccard: 0.9,
      },
    ]);
    const result = await findSimilarClimbs({
      boardType: 'kilter',
      layoutId: 1,
      holds: [
        { holdId: 1117, holdState: 'STARTING' },
        { holdId: 1140, holdState: 'HAND' },
      ],
      threshold: 0.9,
    });
    expect(result).toEqual([
      {
        uuid: 'similar-1',
        name: 'Dyno from Insta',
        setterUsername: 'blakepeyman',
        angle: 40,
        layoutId: 1,
        frames: 'p1117r12',
        similarity: 0.9,
        sharedHoldCount: 9,
        candidateHoldCount: 10,
        targetHoldCount: 2,
      },
    ]);
  });
});
