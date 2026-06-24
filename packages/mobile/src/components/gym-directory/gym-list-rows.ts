import type { Gym, UserBoard } from '@boardsesh/shared-schema';

// One flat, heterogeneous row list for the gym panel's FlashList. The old screen
// mapped every gym AND every board inside a ScrollView, which can't recycle. Here
// the gyms and the standalone-boards section are flattened into one virtualized
// array; a gym carries its own (tiny, ≤~5) board list so an expanded gym renders
// as one cohesive rounded card — only ever one gym is expanded at a time, so this
// is not a virtualization concern. `kind` drives FlashList's getItemType.

export type GymListRow =
  | { kind: 'sectionHeader'; key: string; label: string }
  | { kind: 'loading'; key: string }
  | { kind: 'empty'; key: string; label: string }
  | {
      kind: 'gym';
      key: string;
      gym: Gym;
      subtitle: string;
      expanded: boolean;
      selected: boolean;
      boards: UserBoard[];
    }
  | { kind: 'standalone'; key: string; board: UserBoard; subtitle: string; selected: boolean };

export type GymListLabels = {
  gymsSection: string;
  otherBoards: string;
  empty: string;
  /** Renders the "<n> boards" subtitle a gym falls back to when it has no address. */
  boardCount: (count: number) => string;
};

type BuildGymListRowsArgs = {
  gyms: Gym[];
  /** Pre-built O(1) index of a gym's boards (never filter per row). */
  boardsByGym: Map<string, UserBoard[]>;
  standaloneBoards: UserBoard[];
  expandedGymUuid: string | null;
  /** The selected gym/board (mirrors the map pin) — drives the row accent. */
  selectedId: string | null;
  gymsLoading: boolean;
  labels: GymListLabels;
};

export function buildGymListRows({
  gyms,
  boardsByGym,
  standaloneBoards,
  expandedGymUuid,
  selectedId,
  gymsLoading,
  labels,
}: BuildGymListRowsArgs): GymListRow[] {
  const rows: GymListRow[] = [{ kind: 'sectionHeader', key: 'sh:gyms', label: labels.gymsSection }];

  if (gymsLoading && gyms.length === 0) {
    rows.push({ kind: 'loading', key: 'loading' });
  } else if (gyms.length === 0) {
    rows.push({ kind: 'empty', key: 'empty', label: labels.empty });
  }

  for (const gym of gyms) {
    rows.push({
      kind: 'gym',
      key: `gym:${gym.uuid}`,
      gym,
      subtitle: gym.address ?? labels.boardCount(gym.boardCount ?? boardsByGym.get(gym.uuid)?.length ?? 0),
      expanded: expandedGymUuid === gym.uuid,
      selected: selectedId === gym.uuid,
      boards: boardsByGym.get(gym.uuid) ?? [],
    });
  }

  if (standaloneBoards.length > 0) {
    rows.push({ kind: 'sectionHeader', key: 'sh:other', label: labels.otherBoards });
    for (const board of standaloneBoards) {
      rows.push({
        kind: 'standalone',
        key: `std:${board.uuid}`,
        board,
        subtitle: board.locationName ?? board.boardType,
        selected: selectedId === board.uuid,
      });
    }
  }

  return rows;
}

/** Index of the row carrying a given key (for scrollToIndex on a marker tap). O(n) once per tap. */
export function findRowIndex(rows: GymListRow[], key: string): number {
  return rows.findIndex((row) => row.key === key);
}
