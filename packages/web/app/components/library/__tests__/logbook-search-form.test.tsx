import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '@/app/lib/logbook-preferences';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockGetLastUsedGrade = vi.fn();
const mockSetLastUsedGrade = vi.fn();
vi.mock('@/app/lib/user-preferences-db', () => ({
  getLastUsedGrade: () => mockGetLastUsedGrade(),
  setLastUsedGrade: (value: number) => mockSetLastUsedGrade(value),
  getPreference: () => Promise.resolve(null),
  setPreference: () => Promise.resolve(undefined),
  removePreference: () => Promise.resolve(undefined),
  getGradeDisplayFormat: () => Promise.resolve('v-grade'),
  setGradeDisplayFormat: () => Promise.resolve(undefined),
}));

// Open the drawer immediately and unwrap its children — the real
// SwipeableDrawer would hide them behind a portal that test queries can't
// reach without extra setup.
vi.mock('@/app/components/swipeable-drawer/swipeable-drawer', () => ({
  default: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div data-testid="drawer">
      {children}
      <div data-testid="drawer-footer">{footer}</div>
    </div>
  ),
}));

vi.mock('../board-scroll/board-filter-strip', () => ({
  default: () => <div data-testid="board-filter-strip" />,
}));

import LogbookSearchForm from '../logbook-search-form';

const baseProps = {
  searchText: '',
  onSearchChange: vi.fn(),
  minGrade: '' as number | '',
  maxGrade: '' as number | '',
  onMinGradeChange: vi.fn(),
  onMaxGradeChange: vi.fn(),
  sortState: DEFAULT_SORT,
  onSortChange: vi.fn(),
  boards: [],
  boardsLoading: false,
  selectedBoards: [],
  onBoardToggle: vi.fn(),
  filters: DEFAULT_FILTERS,
  onFiltersChange: vi.fn(),
};

describe('LogbookSearchForm — grade picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLastUsedGrade.mockResolvedValue(undefined);
    mockSetLastUsedGrade.mockResolvedValue(undefined);
  });

  // The logbook form keeps min/max grade in component-local state, so we
  // assert through the change handlers. The sentinel is `''` (empty string)
  // rather than the climb-list form's `0`, so the clear path is worth a
  // focused test.

  it('selecting a grade in Min emits the difficulty_id via onMinGradeChange', () => {
    const onMinGradeChange = vi.fn();
    render(<LogbookSearchForm {...baseProps} onMinGradeChange={onMinGradeChange} />);

    const minListbox = screen.getByRole('listbox', { name: 'Min' });
    fireEvent.click(within(minListbox).getByRole('option', { name: 'V6' }));

    expect(onMinGradeChange).toHaveBeenCalledWith(22);
  });

  it('clearing a Min grade via the "Any" chip emits the empty-string sentinel', () => {
    const onMinGradeChange = vi.fn();
    render(<LogbookSearchForm {...baseProps} minGrade={22} onMinGradeChange={onMinGradeChange} />);

    const minListbox = screen.getByRole('listbox', { name: 'Min' });
    fireEvent.click(within(minListbox).getByRole('option', { name: 'Any' }));

    // Regression guard: the logbook form uses `''` (not `0`) as the
    // unselected sentinel. The picker's `undefined` must map back to `''`,
    // not `undefined`, or active-filter counting and downstream queries
    // would treat the clear as a no-op.
    expect(onMinGradeChange).toHaveBeenCalledWith('');
  });

  it('tapping the already-selected grade chip deselects (emits the empty-string sentinel)', () => {
    const onMinGradeChange = vi.fn();
    render(<LogbookSearchForm {...baseProps} minGrade={22} onMinGradeChange={onMinGradeChange} />);

    const minListbox = screen.getByRole('listbox', { name: 'Min' });
    fireEvent.click(within(minListbox).getByRole('option', { name: 'V6' }));

    expect(onMinGradeChange).toHaveBeenCalledWith('');
  });

  it('selecting a Max grade emits the difficulty_id via onMaxGradeChange', () => {
    const onMaxGradeChange = vi.fn();
    render(<LogbookSearchForm {...baseProps} onMaxGradeChange={onMaxGradeChange} />);

    const maxListbox = screen.getByRole('listbox', { name: 'Max' });
    fireEvent.click(within(maxListbox).getByRole('option', { name: 'V11' }));

    expect(onMaxGradeChange).toHaveBeenCalledWith(28);
  });

  it('persists the picked grade via setLastUsedGrade', () => {
    render(<LogbookSearchForm {...baseProps} />);

    const minListbox = screen.getByRole('listbox', { name: 'Min' });
    fireEvent.click(within(minListbox).getByRole('option', { name: 'V6' }));

    expect(mockSetLastUsedGrade).toHaveBeenCalledWith(22);
  });

  it('does not persist when clearing the grade', () => {
    render(<LogbookSearchForm {...baseProps} minGrade={22} />);

    const minListbox = screen.getByRole('listbox', { name: 'Min' });
    fireEvent.click(within(minListbox).getByRole('option', { name: 'Any' }));

    expect(mockSetLastUsedGrade).not.toHaveBeenCalled();
  });
});
