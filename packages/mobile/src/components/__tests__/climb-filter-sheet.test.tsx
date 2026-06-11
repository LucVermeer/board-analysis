// @vitest-environment jsdom
import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbBoardFilterState } from '@boardsesh/climb-filters';
import type { ClimbFilters } from '../../lib/climb-filter-types';
import { ClimbFilterSheet } from '../ClimbFilterSheet';

type PressableProps = {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  disabled?: boolean;
};

type BottomSheetModalHandle = {
  present: () => void;
  dismiss: () => void;
};

const currentFilters: ClimbFilters = {
  sortBy: 'popular',
  sortOrder: 'desc',
  status: 'any',
  boulders: true,
  routes: false,
  setter: ['draft-setter'],
};

const currentBoardFilters: ClimbBoardFilterState = {
  holdsFilter: { '42': { HAND: 'include' } },
  zoneBox: { edgeLeft: 10, edgeRight: 90, edgeBottom: 20, edgeTop: 80 },
  zoneMode: 'allHolds',
};

const boardConfig = {
  boardName: 'kilter',
  layoutId: 1,
  sizeId: 10,
  setIds: '1,2',
  angle: 40,
};

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole, disabled }: PressableProps) => {
    const renderedChildren = typeof children === 'function' ? children({ pressed: false }) : children;
    return createElement(
      'button',
      {
        onClick: disabled ? undefined : onPress,
        'aria-label': accessibilityLabel,
        'data-role': accessibilityRole,
        disabled,
      },
      renderedChildren,
    );
  },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('react-native-gesture-handler', () => ({
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: forwardRef<BottomSheetModalHandle, { children?: ReactNode }>(function BottomSheetModal(
    { children },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ present: vi.fn(), dismiss: vi.fn() }), []);
    return createElement('div', null, children);
  }),
  BottomSheetBackdrop: () => null,
  BottomSheetScrollView: forwardRef<unknown, { children?: ReactNode }>(function BottomSheetScrollView(
    { children },
    ref,
  ) {
    useImperativeHandle(ref, () => ({}), []);
    return createElement('div', null, children);
  }),
}));

vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (styleFactory: () => Record<string, unknown>) => styleFactory(),
  withSpring: (value: number) => value,
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: { count?: number }) => `${key}${params?.count ?? ''}` }),
}));

vi.mock('@boardsesh/climb-filters', () => ({
  SORT_OPTIONS: ['popular', 'difficulty'],
  GRADE_ACCURACY_VALUES: ['0', '0.2', '0.1', '0.05'],
  DEFAULT_CLIMB_FILTER_STATE: {
    sortBy: 'popular',
    sortOrder: 'desc',
    status: 'any',
    boulders: true,
    routes: false,
  },
  DEFAULT_CLIMB_BOARD_FILTER_STATE: {},
  hasActiveClimbFilters: () => false,
  hasActiveBoardFilters: () => false,
  applyStatusChange: (_filters: unknown, status: string) => ({ status }),
  normalizeRetiredStatus: (filters: unknown) => filters,
  toClimbSearchInput: () => ({}),
  mergeBoardFilters: (input: unknown) => input,
  formatMinAscentsFilterCount: (count: number) => String(count),
  countFilteredHolds: (holdsFilter?: Record<string, unknown>) => Object.keys(holdsFilter ?? {}).length,
}));

vi.mock('../../lib/graphql/hooks', () => ({
  useGrades: () => ({ data: [] }),
  useSearchClimbsCount: () => ({ data: 12 }),
}));

vi.mock('../../providers/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      fill: '#eee',
      tertiaryBackground: '#fff',
      separator: '#ccc',
      secondaryLabel: '#777',
    },
    brandColors: { primary: '#6D28D9' },
  }),
}));

vi.mock('../../lib/haptics', () => ({ hapticSelection: vi.fn() }));
vi.mock('../../theme/animations', () => ({ springs: { snappy: {} } }));
vi.mock('../../theme/colors', () => ({ brandColors: { primary: '#6D28D9' } }));
vi.mock('../../theme/ios-colors', () => ({
  iosSystemColors: {
    white: '#fff',
    separator: '#ccc',
    systemGray: '#999',
    systemGray4: '#aaa',
  },
}));
vi.mock('../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
  borderRadius: { lg: 12 },
}));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../GlassSheetBackground', () => ({ GlassSheetBackground: () => null }));
vi.mock('../Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress?: () => void }) =>
    createElement('button', { onClick: onPress }, title),
}));
vi.mock('../SegmentedControl', () => ({ SegmentedControl: () => null }));
vi.mock('../StarRating', () => ({ StarRating: () => null }));
vi.mock('../CollapsibleSection', () => ({
  CollapsibleSection: ({ children }: { children?: ReactNode }) => createElement('section', null, children),
}));
vi.mock('../RadioGroup', () => ({ RadioGroup: () => null }));
vi.mock('../SwitchRow', () => ({ SwitchRow: () => null }));
vi.mock('../Icon', () => ({ Icon: () => null }));
vi.mock('../grade', () => ({ GradeRangeRail: () => null }));

function renderFilterSheet(overrides: Partial<Parameters<typeof ClimbFilterSheet>[0]> = {}) {
  const props: Parameters<typeof ClimbFilterSheet>[0] = {
    onDismiss: vi.fn(),
    boardConfig,
    currentFilters,
    currentBoardFilters,
    searchName: '',
    onApply: vi.fn(),
    onOpenSetters: vi.fn(),
    onOpenHoldFilter: vi.fn(),
    onOpenZoneFilter: vi.fn(),
    ...overrides,
  };

  return { ...render(<ClimbFilterSheet {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClimbFilterSheet picker navigation', () => {
  it('delegates the setters picker with the current filter draft', () => {
    const onOpenSetters = vi.fn();
    const { getByLabelText } = renderFilterSheet({ onOpenSetters });

    fireEvent.click(getByLabelText('mobile.filter.setters'));

    expect(onOpenSetters).toHaveBeenCalledTimes(1);
    expect(onOpenSetters).toHaveBeenCalledWith(currentFilters, currentBoardFilters);
  });

  it('delegates the hold picker with the current filter draft', () => {
    const onOpenHoldFilter = vi.fn();
    const { getByLabelText } = renderFilterSheet({ onOpenHoldFilter });

    fireEvent.click(getByLabelText('mobile.holdFilter.title'));

    expect(onOpenHoldFilter).toHaveBeenCalledTimes(1);
    expect(onOpenHoldFilter).toHaveBeenCalledWith(currentFilters, currentBoardFilters);
  });

  it('delegates the zone picker with the current filter draft', () => {
    const onOpenZoneFilter = vi.fn();
    const { getByLabelText } = renderFilterSheet({ onOpenZoneFilter });

    fireEvent.click(getByLabelText('mobile.zoneFilter.title'));

    expect(onOpenZoneFilter).toHaveBeenCalledTimes(1);
    expect(onOpenZoneFilter).toHaveBeenCalledWith(currentFilters, currentBoardFilters);
  });
});
