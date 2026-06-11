import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIMB_BOARD_FILTER_STATE } from '@boardsesh/climb-filters';
import type { HoldsFilter, ZoneBoxInput } from '@boardsesh/shared-schema';
import { DEFAULT_FILTERS } from '../climb-filter-types';
import {
  applyHoldsFilterSelectionToFilterDraft,
  applySetterSelectionToFilterDraft,
  applyZoneFilterSelectionToFilterDraft,
  createClimbFilterDraft,
} from '../climb-filter-draft';

describe('climb filter draft handoff helpers', () => {
  it('patches setter selections without committing other draft filters', () => {
    const draft = createClimbFilterDraft(
      { ...DEFAULT_FILTERS, minRating: 4 },
      { ...DEFAULT_CLIMB_BOARD_FILTER_STATE, onlyBenchmarks: true },
    );

    const nextDraft = applySetterSelectionToFilterDraft(draft, ['setter-one', 'setter-two']);

    expect(nextDraft.filters.setter).toEqual(['setter-one', 'setter-two']);
    expect(nextDraft.filters.minRating).toBe(4);
    expect(nextDraft.boardFilters).toBe(draft.boardFilters);
  });

  it('clears setter selections when the picker hands back an empty list', () => {
    const draft = createClimbFilterDraft(
      { ...DEFAULT_FILTERS, setter: ['setter-one'] },
      DEFAULT_CLIMB_BOARD_FILTER_STATE,
    );

    const nextDraft = applySetterSelectionToFilterDraft(draft, []);

    expect(nextDraft.filters.setter).toBeUndefined();
  });

  it('patches and clears hold filter selections on the board-filter draft', () => {
    const holdsFilter: HoldsFilter = { '42': { STARTING: 'include' } };
    const draft = createClimbFilterDraft(DEFAULT_FILTERS, DEFAULT_CLIMB_BOARD_FILTER_STATE);

    const withHolds = applyHoldsFilterSelectionToFilterDraft(draft, holdsFilter);
    const withoutHolds = applyHoldsFilterSelectionToFilterDraft(withHolds, {});

    expect(withHolds.boardFilters.holdsFilter).toEqual(holdsFilter);
    expect(withoutHolds.boardFilters.holdsFilter).toBeUndefined();
    expect(withoutHolds.filters).toBe(DEFAULT_FILTERS);
  });

  it('patches zone selections and folds pruned hold filters into the draft', () => {
    const zoneBox: ZoneBoxInput = { edgeLeft: 10, edgeRight: 90, edgeBottom: 20, edgeTop: 80 };
    const holdsFilter: HoldsFilter = { '42': { HAND: 'include' } };
    const draft = createClimbFilterDraft(DEFAULT_FILTERS, { ...DEFAULT_CLIMB_BOARD_FILTER_STATE, holdsFilter });

    const nextDraft = applyZoneFilterSelectionToFilterDraft(draft, {
      zoneBox,
      zoneMode: 'allHolds',
      holdsFilter: {},
    });

    expect(nextDraft.boardFilters.zoneBox).toEqual(zoneBox);
    expect(nextDraft.boardFilters.zoneMode).toBe('allHolds');
    expect(nextDraft.boardFilters.holdsFilter).toBeUndefined();
  });

  it('preserves holds when a zone handoff does not include hold edits', () => {
    const holdsFilter: HoldsFilter = { '42': { FINISH: 'exclude' } };
    const draft = createClimbFilterDraft(DEFAULT_FILTERS, { ...DEFAULT_CLIMB_BOARD_FILTER_STATE, holdsFilter });

    const nextDraft = applyZoneFilterSelectionToFilterDraft(draft, {
      zoneBox: null,
      zoneMode: 'anyHold',
    });

    expect(nextDraft.boardFilters.zoneBox).toBeNull();
    expect(nextDraft.boardFilters.zoneMode).toBeUndefined();
    expect(nextDraft.boardFilters.holdsFilter).toEqual(holdsFilter);
  });
});
