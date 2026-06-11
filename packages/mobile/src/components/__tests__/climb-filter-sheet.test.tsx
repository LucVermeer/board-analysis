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

const bottomSheetModalProps = vi.hoisted(() => ({
  latest: null as null | {
    enablePanDownToClose?: boolean;
    enableContentPanningGesture?: boolean;
    enableHandlePanningGesture?: boolean;
  },
}));

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
    { children, ...props },
    ref,
  ) {
    bottomSheetModalProps.latest = props;
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
vi.mock('../search/SettersFilterSheet', () => ({
  SettersFilterSheet: ({
    visible,
    onSelectedSettersChange,
    onClose,
  }: {
    visible: boolean;
    onSelectedSettersChange: (selectedSetters: string[]) => void;
    onClose: () => void;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'setters-filter-sheet', 'data-visible': String(visible) },
      createElement('button', { onClick: () => onSelectedSettersChange(['stacked-setter']) }, 'setters-change'),
      createElement('button', { onClick: onClose }, 'setters-close'),
    ),
}));
vi.mock('../search/HoldFilterEditorSheet', () => ({
  HoldFilterEditorSheet: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
    createElement(
      'div',
      { 'data-testid': 'hold-filter-editor-sheet', 'data-visible': String(visible) },
      createElement('button', { onClick: onClose }, 'holds-close'),
    ),
}));
vi.mock('../search/ZoneFilterEditorSheet', () => ({
  ZoneFilterEditorSheet: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
    createElement(
      'div',
      { 'data-testid': 'zone-filter-editor-sheet', 'data-visible': String(visible) },
      createElement('button', { onClick: onClose }, 'zone-close'),
    ),
}));

function renderFilterSheet(overrides: Partial<Parameters<typeof ClimbFilterSheet>[0]> = {}) {
  const props: Parameters<typeof ClimbFilterSheet>[0] = {
    onDismiss: vi.fn(),
    boardConfig,
    currentFilters,
    currentBoardFilters,
    searchName: '',
    onApply: vi.fn(),
    ...overrides,
  };

  return { ...render(<ClimbFilterSheet {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  bottomSheetModalProps.latest = null;
});

describe('ClimbFilterSheet child filters', () => {
  it('opens the setters sheet above the filter sheet and keeps draft edits local until Apply', () => {
    const onApply = vi.fn();
    const { getByLabelText, getByTestId, getByText } = renderFilterSheet({ onApply });

    fireEvent.click(getByLabelText('mobile.filter.setters'));

    expect(getByTestId('setters-filter-sheet').getAttribute('data-visible')).toBe('true');
    expect(bottomSheetModalProps.latest?.enablePanDownToClose).toBe(false);
    expect(bottomSheetModalProps.latest?.enableContentPanningGesture).toBe(false);
    expect(bottomSheetModalProps.latest?.enableHandlePanningGesture).toBe(false);

    fireEvent.click(getByText('setters-change'));
    fireEvent.click(getByText('mobile.filter.showCount12'));

    expect(onApply).toHaveBeenCalledWith({ ...currentFilters, setter: ['stacked-setter'] }, currentBoardFilters);
  });

  it('opens the hold editor sheet above the filter sheet', () => {
    const { getByLabelText, getByTestId } = renderFilterSheet();

    fireEvent.click(getByLabelText('mobile.holdFilter.title'));

    expect(getByTestId('hold-filter-editor-sheet').getAttribute('data-visible')).toBe('true');
    expect(bottomSheetModalProps.latest?.enablePanDownToClose).toBe(false);
  });

  it('opens the zone editor sheet above the filter sheet', () => {
    const { getByLabelText, getByTestId } = renderFilterSheet();

    fireEvent.click(getByLabelText('mobile.zoneFilter.title'));

    expect(getByTestId('zone-filter-editor-sheet').getAttribute('data-visible')).toBe('true');
    expect(bottomSheetModalProps.latest?.enablePanDownToClose).toBe(false);
  });
});
