import { describe, expect, it } from 'vite-plus/test';
import {
  buildAuroraJsonExport,
  getIsoWeekPeriod,
  getUserDataExportFilename,
  getUserDataExportS3Key,
  isAuroraBoardType,
} from './user-data-export-format';

describe('user data export formatting', () => {
  it('formats ticks, likes, circuits, and user metadata as Aurora JSON export data', () => {
    const exportData = buildAuroraJsonExport({
      boardType: 'kilter',
      user: {
        id: 'user-1',
        name: 'Marco',
        email: 'marco@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      ticks: [
        {
          climbName: 'Warm Up',
          status: 'flash',
          angle: 20,
          attemptCount: 1,
          quality: 4,
          difficulty: 12,
          difficultyName: 'V3',
          climbedAt: '2026-05-01 14:00:00',
          createdAt: '2026-05-01 14:00:05',
        },
        {
          climbName: 'Project',
          status: 'attempt',
          angle: 40,
          attemptCount: 5,
          quality: null,
          difficulty: null,
          difficultyName: null,
          climbedAt: '2026-05-01 15:00:00',
          createdAt: '2026-05-01 15:00:05',
        },
      ],
      favorites: [
        { climbName: 'Warm Up', createdAt: new Date('2026-05-02T10:00:00Z') },
        { climbName: 'Warm Up', createdAt: new Date('2026-05-03T10:00:00Z') },
      ],
      circuitRows: [
        {
          playlistId: 1,
          name: 'Power',
          color: '#00AAFF',
          createdAt: new Date('2026-05-01T12:00:00Z'),
          description: 'Limit climbs',
          isPublic: false,
          climbName: 'Warm Up',
          position: 0,
        },
        {
          playlistId: 1,
          name: 'Power',
          color: '#00AAFF',
          createdAt: new Date('2026-05-01T12:00:00Z'),
          description: 'Limit climbs',
          isPublic: false,
          climbName: 'Project',
          position: 1,
        },
      ],
      climbs: [],
    });

    expect(exportData.user).toEqual({
      username: 'Marco',
      email_address: 'marco@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(exportData.ascents).toEqual([
      {
        climb: 'Warm Up',
        angle: 20,
        count: 1,
        stars: 4,
        climbed_at: '2026-05-01 14:00:00',
        created_at: '2026-05-01 14:00:05',
        grade: 'V3',
      },
    ]);
    expect(exportData.attempts).toEqual([
      {
        climb: 'Project',
        angle: 40,
        count: 5,
        climbed_at: '2026-05-01 15:00:00',
        created_at: '2026-05-01 15:00:05',
      },
    ]);
    expect(exportData.likes).toEqual([{ climb: 'Warm Up', created_at: '2026-05-02T10:00:00.000Z' }]);
    expect(exportData.circuits).toEqual([
      {
        name: 'Power',
        color: '00AAFF',
        created_at: '2026-05-01T12:00:00.000Z',
        description: 'Limit climbs',
        is_private: true,
        climbs: ['Warm Up', 'Project'],
      },
    ]);
  });

  it('uses ISO weeks for deterministic weekly object names', () => {
    const date = new Date('2026-05-07T12:00:00Z');

    expect(getIsoWeekPeriod(date)).toEqual({ year: 2026, week: 19, label: '2026-W19' });
    expect(getUserDataExportS3Key('user-1', 'tension', date)).toBe('user-data-exports/user-1/tension/2026-W19.json');
    expect(getUserDataExportFilename('tension', date)).toBe('boardsesh-tension-export-2026-W19.json');
  });

  it('recognizes only Aurora-backed boards', () => {
    expect(isAuroraBoardType('kilter')).toBe(true);
    expect(isAuroraBoardType('moonboard')).toBe(false);
    expect(isAuroraBoardType(null)).toBe(false);
  });
});
