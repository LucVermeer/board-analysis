import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { deriveProfileViewModel } from '../derive-view-model';
import type { LogbookEntry } from '../types';

function entry(overrides: Partial<LogbookEntry> = {}): LogbookEntry {
  return { climbed_at: dayjs().toISOString(), difficulty: 22, tries: 1, angle: 40, ...overrides };
}

const allBoardsTicks: Record<string, LogbookEntry[]> = {
  kilter: [
    entry({ difficulty: 16, status: 'flash', climbUuid: 'k1', layoutId: 1, boardType: 'kilter' }), // V3 flash
    entry({ difficulty: 22, status: 'send', tries: 3, climbUuid: 'k2', layoutId: 1, boardType: 'kilter' }), // V6 send
  ],
  tension: [
    entry({ difficulty: 28, status: 'send', climbUuid: 't1', layoutId: 9, boardType: 'tension' }), // V11 send
  ],
};

const base = {
  timeframe: 'all' as const,
  fromDate: '',
  toDate: '',
  gradeFormat: 'v-grade' as const,
  profileStats: null,
};

describe('deriveProfileViewModel', () => {
  it("'all' board includes every board's ticks", () => {
    const vm = deriveProfileViewModel({ ...base, allBoardsTicks, selectedBoard: 'all' });
    expect(vm.filteredLogbook).toHaveLength(3);
    // hardest send across all boards is V11 (tension), hardest flash is V3 (kilter)
    expect(vm.hardestSend).toMatchObject({ label: 'V11', status: 'send' });
    expect(vm.hardestFlash).toMatchObject({ label: 'V3', status: 'flash' });
    expect(vm.hardestSend).not.toHaveProperty('color');
  });

  it('scopes to a single board when selectedBoard is set', () => {
    const vm = deriveProfileViewModel({ ...base, allBoardsTicks, selectedBoard: 'kilter' });
    expect(vm.filteredLogbook).toHaveLength(2);
    // tension's V11 is excluded → hardest send becomes V6
    expect(vm.hardestSend).toMatchObject({ label: 'V6' });
  });

  it('returns a missing board as an empty scope (no throw)', () => {
    const vm = deriveProfileViewModel({ ...base, allBoardsTicks, selectedBoard: 'moonboard' });
    expect(vm.filteredLogbook).toHaveLength(0);
    expect(vm.hardestSend).toBeNull();
    expect(vm.hardestFlash).toBeNull();
    expect(vm.weeklyBars).toBeNull();
  });

  it('produces every chart slice plus the stats summary', () => {
    const vm = deriveProfileViewModel({
      ...base,
      allBoardsTicks,
      selectedBoard: 'all',
      profileStats: {
        totalDistinctClimbs: 3,
        layoutStats: [
          {
            layoutKey: 'kilter-1',
            boardType: 'kilter',
            layoutId: 1,
            distinctClimbCount: 2,
            gradeCounts: [
              { grade: '16', count: 1 },
              { grade: '22', count: 1 },
            ],
          },
          {
            layoutKey: 'tension-9',
            boardType: 'tension',
            layoutId: 9,
            distinctClimbCount: 1,
            gradeCounts: [{ grade: '28', count: 1 }],
          },
        ],
      },
    });
    expect(vm.weeklyBars).not.toBeNull();
    expect(vm.aggregatedStackedBars).not.toBeNull();
    expect(vm.aggregatedFlashRedpointBars).not.toBeNull();
    expect(vm.vPointsTimeline).not.toBeNull();
    expect(vm.statisticsSummary.totalAscents).toBe(3);
    expect(vm.statisticsSummary.layoutPercentages.reduce((s, l) => s + l.percentage, 0)).toBe(100);
  });
});
