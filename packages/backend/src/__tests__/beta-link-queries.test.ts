import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

const {
  selectMock,
  recentSelectMock,
  executeMock,
  updateMock,
  fetchInstagramMetaMock,
  fetchTikTokMetaMock,
  cacheInstagramMock,
  cacheTikTokMock,
  isS3ConfiguredMock,
  getPublicUrlMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  recentSelectMock: vi.fn(),
  executeMock: vi.fn(),
  updateMock: vi.fn(),
  fetchInstagramMetaMock: vi.fn(),
  fetchTikTokMetaMock: vi.fn(),
  cacheInstagramMock: vi.fn(),
  cacheTikTokMock: vi.fn(),
  isS3ConfiguredMock: vi.fn(() => true),
  getPublicUrlMock: vi.fn((key: string) => `https://bucket.example.com/${key}`),
}));

vi.mock('../db/client', () => ({
  db: {
    select: (selection?: Record<string, unknown>) => {
      // Route by the shape of the projection so a future query that doesn't
      // match a known path fails loudly instead of resolving via the wrong
      // mock. Known shapes:
      // - `betaLinks` calls `db.select()` with no projection, then
      //   `.from(...).where(...)`.
      // - `recentBetaLinks` / `userBetaLinks` main join calls
      //   `db.select({ ..., climbName, ... }).from(...).leftJoin(...).where(...).orderBy(...).limit(...)`.
      // - `userBetaLinks` profile lookup calls
      //   `db.select({ instagramUrl }).from(...).where(...).limit(...)`.
      // The two projected paths share a chain shape (no orderBy on the
      // profile lookup is fine — chain methods are idempotent) and FIFO-
      // consume `recentSelectMock` so a single test can stage multiple
      // return values in order.
      if (selection === undefined) {
        return {
          from: () => ({
            where: () => Promise.resolve(selectMock()),
          }),
        };
      }
      if ('climbName' in selection || 'instagramUrl' in selection) {
        const chain = {
          from: () => chain,
          leftJoin: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(recentSelectMock()),
        };
        return chain;
      }
      throw new Error(
        `Unhandled db.select() projection in beta-link-queries test mock: ${JSON.stringify(Object.keys(selection))}`,
      );
    },
    execute: (..._args: unknown[]) => Promise.resolve(executeMock()),
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => {
          updateMock(...args);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock('../lib/instagram-meta', async () => {
  const shared = await vi.importActual<typeof import('@boardsesh/shared-schema')>('@boardsesh/shared-schema');
  return {
    fetchInstagramMeta: fetchInstagramMetaMock,
    isInstagramUrl: shared.isInstagramUrl,
    getInstagramMediaId: shared.getInstagramMediaId,
  };
});

vi.mock('../lib/tiktok-meta', async () => {
  const shared = await vi.importActual<typeof import('@boardsesh/shared-schema')>('@boardsesh/shared-schema');
  return {
    fetchTikTokMeta: fetchTikTokMetaMock,
    isTikTokUrl: shared.isTikTokUrl,
    getTikTokCacheId: (url: string) => shared.getTikTokVideoId(url) ?? null,
  };
});

vi.mock('../storage/s3', () => ({
  isS3Configured: isS3ConfiguredMock,
  getPublicUrl: getPublicUrlMock,
  uploadToS3: vi.fn(),
}));

vi.mock('../lib/beta-link-thumbnails', async () => {
  const actual = await vi.importActual<typeof import('../lib/beta-link-thumbnails')>('../lib/beta-link-thumbnails');
  return {
    ...actual,
    cacheInstagramThumbnail: cacheInstagramMock,
    cacheTikTokThumbnail: cacheTikTokMock,
    isS3Configured: isS3ConfiguredMock,
  };
});

import { betaLinkQueries } from '../graphql/resolvers/beta-videos/queries';

type Row = {
  boardType: string;
  climbUuid: string;
  link: string;
  foreignUsername: string | null;
  angle: number | null;
  thumbnail: string | null;
  isListed: boolean | null;
  createdAt: string | null;
};

function row(overrides: Partial<Row>): Row {
  return {
    boardType: 'kilter',
    climbUuid: 'climb-1',
    link: 'https://www.instagram.com/p/ABC/',
    foreignUsername: null,
    angle: null,
    thumbnail: null,
    isListed: true,
    createdAt: '2026-04-26T00:00:00Z',
    ...overrides,
  };
}

const OUR_S3_THUMB = 'https://bucket.example.com/beta-link-thumbnails/instagram/ABC.jpg';

describe('betaLinks resolver', () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    fetchInstagramMetaMock.mockReset();
    fetchTikTokMetaMock.mockReset();
    cacheInstagramMock.mockReset();
    cacheTikTokMock.mockReset();
    isS3ConfiguredMock.mockReset();
    isS3ConfiguredMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops KayaClimb rows entirely without enriching', async () => {
    selectMock.mockReturnValueOnce([
      row({ link: 'https://app.kayaclimb.com/share/post?id=1' }),
      row({ link: 'https://app.kayaclimb.com/share/post?id=2' }),
    ]);

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });

    expect(result).toEqual([]);
    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled();
  });

  it('drops Instagram rows that come back as gone with no cached thumbnail', async () => {
    selectMock.mockReturnValueOnce([row({ link: 'https://www.instagram.com/p/GONE/' })]);
    fetchInstagramMetaMock.mockResolvedValueOnce({ status: 'gone' });

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result).toEqual([]);
  });

  it('short-circuits the live fetch as soon as a cached thumbnail is on our S3 (even without username)', async () => {
    // Once we've cached the thumbnail we have everything the slider needs.
    // Skipping the live fetch keeps us from re-poking IG every read for
    // rows that get stuck on `gone` (false positives during login-wall
    // responses) or `transient_error` (active rate-limiting).
    selectMock.mockReturnValueOnce([
      row({ link: 'https://www.instagram.com/p/ABC/', thumbnail: OUR_S3_THUMB, foreignUsername: null }),
    ]);

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ thumbnail: OUR_S3_THUMB, foreignUsername: null });
    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
  });

  it('passes through transient_error rows with no cached thumbnail (keeps them in the slider with thumbnail: null)', async () => {
    selectMock.mockReturnValueOnce([row({ link: 'https://www.instagram.com/p/ABC/', thumbnail: null })]);
    fetchInstagramMetaMock.mockResolvedValueOnce({ status: 'transient_error' });

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ thumbnail: null });
  });

  it('persists the S3 thumbnail on first read when S3 is configured', async () => {
    selectMock.mockReturnValueOnce([row({ link: 'https://www.instagram.com/p/ABC/', thumbnail: null })]);
    fetchInstagramMetaMock.mockResolvedValueOnce({
      status: 'ok',
      thumbnail: 'https://scontent.cdninstagram.com/raw.jpg',
      username: 'climber',
    });
    cacheInstagramMock.mockResolvedValueOnce(OUR_S3_THUMB);

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result[0]).toMatchObject({ thumbnail: OUR_S3_THUMB, foreignUsername: 'climber' });
    expect(cacheInstagramMock).toHaveBeenCalledWith('ABC', 'https://scontent.cdninstagram.com/raw.jpg');
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('returns the dev proxy URL when S3 is not configured', async () => {
    isS3ConfiguredMock.mockReturnValue(false);
    selectMock.mockReturnValueOnce([row({ link: 'https://www.instagram.com/p/ABC/' })]);
    fetchInstagramMetaMock.mockResolvedValueOnce({
      status: 'ok',
      thumbnail: 'https://scontent.cdninstagram.com/raw.jpg',
      username: 'climber',
    });

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result[0]?.thumbnail).toBe(
      `/api/internal/beta-link-thumbnail?url=${encodeURIComponent('https://scontent.cdninstagram.com/raw.jpg')}`,
    );
    expect(cacheInstagramMock).not.toHaveBeenCalled();
  });

  it('short-circuits the live fetch when row is fully enriched', async () => {
    selectMock.mockReturnValueOnce([
      row({
        link: 'https://www.instagram.com/p/ABC/',
        thumbnail: OUR_S3_THUMB,
        foreignUsername: 'climber',
      }),
    ]);

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result[0]).toMatchObject({ thumbnail: OUR_S3_THUMB, foreignUsername: 'climber' });
    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
  });

  it('routes TikTok URLs through the TikTok enricher', async () => {
    const tikUrl = 'https://www.tiktok.com/@climber/video/9999999999';
    selectMock.mockReturnValueOnce([row({ link: tikUrl })]);
    fetchTikTokMetaMock.mockResolvedValueOnce({
      status: 'ok',
      thumbnail: 'https://p16-common-sign.tiktokcdn.com/x.jpg?x-expires=1',
      username: 'climber',
    });
    cacheTikTokMock.mockResolvedValueOnce('https://bucket.example.com/beta-link-thumbnails/tiktok/9999999999.jpg');

    const result = await betaLinkQueries.betaLinks(undefined, { boardType: 'kilter', climbUuid: 'climb-1' });
    expect(result[0]).toMatchObject({
      link: tikUrl,
      foreignUsername: 'climber',
      thumbnail: 'https://bucket.example.com/beta-link-thumbnails/tiktok/9999999999.jpg',
    });
    expect(cacheTikTokMock).toHaveBeenCalledWith(
      '9999999999',
      'https://p16-common-sign.tiktokcdn.com/x.jpg?x-expires=1',
    );
    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
  });
});

describe('recentBetaLinks resolver', () => {
  beforeEach(() => {
    executeMock.mockReset();
    fetchInstagramMetaMock.mockReset();
    fetchTikTokMetaMock.mockReset();
  });

  // The CTE-based resolver returns flat snake_case rows from `db.execute` and
  // the cap-3 partition+filter happens inside the SQL. The test fixture only
  // has to mimic that shape — we don't try to re-implement the window function
  // here. Tests that assert cap behaviour mock the post-cap result set.
  type CteRow = {
    board_type: string;
    climb_uuid: string;
    link: string;
    foreign_username: string | null;
    angle: number | null;
    thumbnail: string | null;
    is_listed: boolean | null;
    created_at: string | null;
    climb_name: string | null;
  };

  function cteRow(overrides: Partial<CteRow> = {}, climbName: string | null = 'Test Climb'): CteRow {
    return {
      board_type: 'kilter',
      climb_uuid: 'climb-1',
      link: 'https://www.instagram.com/p/ABC/',
      foreign_username: null,
      angle: null,
      thumbnail: '/static/beta-link-thumbnails/instagram/ABC.jpg',
      is_listed: true,
      created_at: '2026-04-26T00:00:00Z',
      climb_name: climbName,
      ...overrides,
    };
  }

  it('returns wrapped rows with the joined climb name and source boardType', async () => {
    executeMock.mockReturnValueOnce([
      cteRow({ link: 'https://www.instagram.com/p/A/' }, 'Crimpy Mantle'),
      cteRow({ link: 'https://www.instagram.com/p/B/', board_type: 'tension' }, 'Steep Compression'),
    ]);

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      climbName: 'Crimpy Mantle',
      boardType: 'kilter',
      betaLink: { link: 'https://www.instagram.com/p/A/' },
    });
    expect(result[1]).toMatchObject({ climbName: 'Steep Compression', boardType: 'tension' });
  });

  it('drops KayaClimb URLs', async () => {
    executeMock.mockReturnValueOnce([
      cteRow({ link: 'https://app.kayaclimb.com/share/post?id=1' }),
      cteRow({ link: 'https://www.instagram.com/p/A/' }, 'Project'),
    ]);

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]?.climbName).toBe('Project');
  });

  it('tolerates a null climbName (beta link arrived before the climb synced)', async () => {
    executeMock.mockReturnValueOnce([cteRow({}, null)]);

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]?.climbName).toBeNull();
  });

  it('passes thumbnails through unchanged when they are already on our static prefix', async () => {
    const ourThumb = '/static/beta-link-thumbnails/instagram/ABC.jpg';
    executeMock.mockReturnValueOnce([cteRow({ thumbnail: ourThumb })]);

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });

    expect(result[0]?.betaLink.thumbnail).toBe(ourThumb);
  });

  it('never enriches via the live IG/TikTok APIs', async () => {
    executeMock.mockReturnValueOnce([
      cteRow({ link: 'https://www.instagram.com/p/A/' }),
      cteRow({ link: 'https://www.tiktok.com/@u/video/1' }),
    ]);

    await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });

    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled();
  });

  it('accepts the boardType filter without throwing', async () => {
    executeMock.mockReturnValueOnce([cteRow({ board_type: 'kilter' })]);

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20, boardType: 'kilter' });

    expect(result).toHaveLength(1);
    expect(result[0]?.boardType).toBe('kilter');
  });

  it('normalises `db.execute` outputs that arrive shaped as { rows: [...] }', async () => {
    // Some drivers return `{ rows: T[] }` instead of a plain array — the
    // resolver normalises both. Cover the wrapped shape here so a future
    // driver swap doesn't silently break the slider.
    executeMock.mockReturnValueOnce({
      rows: [cteRow({ link: 'https://www.instagram.com/p/A/' }, 'Wrapped')],
    });

    const result = await betaLinkQueries.recentBetaLinks(undefined, { limit: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]?.climbName).toBe('Wrapped');
  });
});

describe('userBetaLinks resolver', () => {
  beforeEach(() => {
    recentSelectMock.mockReset();
    fetchInstagramMetaMock.mockReset();
    fetchTikTokMetaMock.mockReset();
  });

  function joinedRow(overrides: Partial<Row> = {}, climbName: string | null = 'Test Climb') {
    return {
      betaLink: row({
        thumbnail: '/static/beta-link-thumbnails/instagram/ABC.jpg',
        ...overrides,
      }),
      climbName,
    };
  }

  it("returns the user's beta links and short-circuits when they have no IG handle", async () => {
    // First select: profile lookup → no IG URL set. Second select: the
    // beta-link join. The OR-by-handle branch is unreachable because the
    // handle is null, so the WHERE collapses to created_by_user_id = userId.
    recentSelectMock
      .mockReturnValueOnce([{ instagramUrl: null }])
      .mockReturnValueOnce([
        joinedRow({ link: 'https://www.instagram.com/p/MINE/', foreignUsername: 'someoneelse' }, 'Project'),
      ]);

    const result = await betaLinkQueries.userBetaLinks(undefined, { userId: 'user-1', limit: 50 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ climbName: 'Project', betaLink: { foreignUsername: 'someoneelse' } });
  });

  it('falls back gracefully when the user has no profile row at all', async () => {
    recentSelectMock
      .mockReturnValueOnce([])
      .mockReturnValueOnce([joinedRow({ link: 'https://www.instagram.com/p/A/' })]);

    const result = await betaLinkQueries.userBetaLinks(undefined, { userId: 'user-1', limit: 50 });
    expect(result).toHaveLength(1);
  });

  it('extracts an IG handle from instagramUrl and merges OR-matched rows', async () => {
    recentSelectMock
      .mockReturnValueOnce([{ instagramUrl: 'https://www.instagram.com/marco/' }])
      .mockReturnValueOnce([joinedRow({ link: 'https://www.instagram.com/p/A/', foreignUsername: 'marco' })]);

    const result = await betaLinkQueries.userBetaLinks(undefined, { userId: 'user-1', limit: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]?.betaLink.foreignUsername).toBe('marco');
  });

  it('drops KayaClimb URLs', async () => {
    recentSelectMock
      .mockReturnValueOnce([{ instagramUrl: null }])
      .mockReturnValueOnce([
        joinedRow({ link: 'https://app.kayaclimb.com/share/post?id=1' }),
        joinedRow({ link: 'https://www.instagram.com/p/A/' }, 'Real'),
      ]);

    const result = await betaLinkQueries.userBetaLinks(undefined, { userId: 'user-1', limit: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]?.climbName).toBe('Real');
  });

  it('never enriches via the live IG/TikTok APIs', async () => {
    recentSelectMock
      .mockReturnValueOnce([{ instagramUrl: null }])
      .mockReturnValueOnce([
        joinedRow({ link: 'https://www.instagram.com/p/A/' }),
        joinedRow({ link: 'https://www.tiktok.com/@u/video/1' }),
      ]);

    await betaLinkQueries.userBetaLinks(undefined, { userId: 'user-1', limit: 50 });

    expect(fetchInstagramMetaMock).not.toHaveBeenCalled();
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled();
  });
});
