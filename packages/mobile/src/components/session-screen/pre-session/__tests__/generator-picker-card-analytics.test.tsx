// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratorSelection } from '../GeneratorPickerCard';
import type { WarmUpType } from '@boardsesh/playlist-generator';

const analytics = vi.hoisted(() => ({ track: vi.fn() }));

// The workout-type chips render in CHIP_VALUES order: off, volume, pyramid,
// ladder, gradeFocus. Each chip's Pressable onPress lands here in render order
// so the test can tap a specific chip. (Only chips push here — the segmented
// controls / steppers are mocked separately below.)
const chips = vi.hoisted(() => ({ entries: [] as Array<{ label?: string; onPress: () => void }> }));

// Surfaces the mocked SegmentedControls so a test can drive a specific group's
// onSelect (warm-up, climb bias) by its accessibilityLabel.
const segments = vi.hoisted(() => ({
  entries: [] as Array<{ accessibilityLabel?: string; onSelect: (key: string) => void }>,
}));

vi.mock('../../../../lib/analytics', () => ({ track: analytics.track }));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
  // Chip uses an animated Pressable; capture its onPress + label so a test can
  // tap the workout-type chips.
  Pressable: ({
    onPress,
    accessibilityLabel,
    children,
  }: {
    onPress?: () => void;
    accessibilityLabel?: string;
    children?: ReactNode;
  }) => {
    if (onPress) chips.entries.push({ label: accessibilityLabel, onPress });
    return createElement('button', null, children);
  },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));

// createAnimatedComponent returns the component untouched so the mocked
// Pressable still captures the chip onPress.
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  createAnimatedComponent: (component: unknown) => component,
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: () => ({}),
  withSpring: (value: number) => value,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'mobile.session.preGeneratorOptionAccessibilityLabel' && options) {
        return `${options.group}, ${options.value}`;
      }
      return key;
    },
  }),
}));
vi.mock('@boardsesh/board-config', () => ({
  // Two grades so getDefaultTargetGrade picks the middle one deterministically.
  getGradesForBoard: () => [
    { difficulty_id: 10, difficulty_name: '5a' },
    { difficulty_id: 20, difficulty_name: '6a' },
  ],
}));
vi.mock('@boardsesh/board-constants', () => ({
  KILTER_HOMEWALL_LAYOUT_ID: 8,
  isKilterHomewallTallSizeId: () => false,
  isKilterHomewallWideSizeId: () => false,
}));
vi.mock('@boardsesh/climb-filters', () => ({
  formatMinAscentsFilterCount: (value: number) => String(value),
  getMinAscentsFilterOptions: () => [0, 1, 10],
  getMinRatingPickerValue: (value: number | null | undefined) => (value != null && value > 0 ? value : null),
}));
vi.mock('@boardsesh/playlist-generator', () => ({
  CLIMB_BIAS_OPTIONS: ['unfamiliar', 'attempted', 'any'],
  WARM_UP_OPTIONS: ['standard', 'extended', 'none'],
  DEFAULT_GRADE_FOCUS_OPTIONS: {
    type: 'gradeFocus',
    warmUp: 'standard',
    numberOfClimbs: 15,
    climbBias: 'unfamiliar',
    minAscents: 5,
    minRating: 2,
    onlyTallClimbs: false,
    onlyWideClimbs: false,
  },
  DEFAULT_LADDER_OPTIONS: {
    type: 'ladder',
    warmUp: 'standard',
    numberOfSteps: 5,
    climbsPerStep: 2,
    climbBias: 'unfamiliar',
    minAscents: 5,
    minRating: 2,
    onlyTallClimbs: false,
    onlyWideClimbs: false,
  },
  DEFAULT_PYRAMID_OPTIONS: {
    type: 'pyramid',
    warmUp: 'standard',
    numberOfSteps: 5,
    climbsPerStep: 1,
    climbBias: 'unfamiliar',
    minAscents: 5,
    minRating: 2,
    onlyTallClimbs: false,
    onlyWideClimbs: false,
  },
  DEFAULT_VOLUME_OPTIONS: {
    type: 'volume',
    warmUp: 'standard',
    mainSetClimbs: 20,
    mainSetVariability: 0,
    climbBias: 'unfamiliar',
    minAscents: 5,
    minRating: 2,
    onlyTallClimbs: false,
    onlyWideClimbs: false,
  },
}));
vi.mock('../../../SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
}));
vi.mock('../../../SegmentedControl', () => ({
  SegmentedControl: ({
    accessibilityLabel,
    onSelect,
  }: {
    accessibilityLabel?: string;
    onSelect: (key: string) => void;
  }) => {
    segments.entries.push({ accessibilityLabel, onSelect });
    return null;
  },
}));
vi.mock('../../../CollapsibleSection', () => ({
  // Render children so the Tuning controls (segmented warm-up etc.) mount.
  CollapsibleSection: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../../StarRating', () => ({ StarRating: () => null }));
vi.mock('../../../SwitchRow', () => ({ SwitchRow: () => null }));
vi.mock('../../../Stepper', () => ({ Stepper: () => null }));
vi.mock('../../../grade', () => ({ GradeSingleSelectRail: () => null }));
vi.mock('../../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { fill: '#eee' }, brandColors: {}, opacity: { disabled: 0.5 } }),
}));
vi.mock('../../../../lib/haptics', () => ({ hapticSelection: vi.fn() }));
vi.mock('../../../../theme/tokens', () => ({ spacing: {}, borderRadius: {} }));
vi.mock('../../../../theme/animations', () => ({ springs: { snappy: {} } }));
vi.mock('../../../../theme/colors', () => ({ brandColors: { primary: '#6D28D9' } }));
vi.mock('../../../../theme/ios-colors', () => ({ iosSystemColors: { white: '#fff', systemGray: '#999' } }));

import { GeneratorPickerCard } from '../GeneratorPickerCard';

beforeEach(() => {
  analytics.track.mockClear();
  chips.entries = [];
  segments.entries = [];
});

const VOLUME_SELECTION: GeneratorSelection = {
  type: 'on',
  options: {
    type: 'volume',
    warmUp: 'standard',
    targetGrade: 20,
    mainSetClimbs: 20,
    mainSetVariability: 0,
    climbBias: 'unfamiliar',
    minAscents: 5,
    minRating: 2,
    onlyTallClimbs: false,
    onlyWideClimbs: false,
  },
};

describe('GeneratorPickerCard analytics', () => {
  it('renders the workout-type chips as filled selectable chips (no horizontal scroller)', () => {
    render(
      createElement(GeneratorPickerCard, {
        boardName: 'kilter',
        layoutId: 8,
        sizeId: 21,
        angle: 40,
        selection: VOLUME_SELECTION,
        onChange: vi.fn(),
      }),
    );

    // The five workout-type chips (off, volume, pyramid, ladder, gradeFocus) plus
    // the Tuning min-ascents chips + the "Any" rating chip all render as
    // Pressables; at minimum the five type chips are present.
    expect(chips.entries.length).toBeGreaterThanOrEqual(5);
  });

  it('fires "Workout Generator Opened" with web-aligned targetType + angle when switching off → a workout type', () => {
    render(
      createElement(GeneratorPickerCard, {
        boardName: 'kilter',
        layoutId: 8,
        sizeId: 21,
        angle: 40,
        selection: { type: 'off' } satisfies GeneratorSelection,
        onChange: vi.fn(),
      }),
    );

    // Chip index 1 is 'volume' (index 0 is 'off').
    chips.entries[1]?.onPress();

    // Exact payload web sends (playlist-generator-drawer.tsx): { targetType, boardName, angle }.
    // No `workoutType` key — PostHog groups by exact prop name, so it must match web.
    expect(analytics.track).toHaveBeenCalledWith('Workout Generator Opened', {
      targetType: 'session',
      boardName: 'kilter',
      angle: 40,
    });
  });

  it('does not fire when tapping "off" (no off → on transition)', () => {
    render(
      createElement(GeneratorPickerCard, {
        boardName: 'kilter',
        layoutId: 8,
        sizeId: 21,
        angle: 40,
        selection: { type: 'off' } satisfies GeneratorSelection,
        onChange: vi.fn(),
      }),
    );

    chips.entries[0]?.onPress();

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('updates warm-up when the warm-up segmented control changes', () => {
    const onChange = vi.fn();
    render(
      createElement(GeneratorPickerCard, {
        boardName: 'kilter',
        layoutId: 8,
        sizeId: 21,
        angle: 40,
        selection: VOLUME_SELECTION,
        onChange,
      }),
    );

    const warmUpControl = segments.entries.find(
      (entry) => entry.accessibilityLabel === 'mobile.session.preGeneratorWarmUp',
    );
    warmUpControl?.onSelect('extended' satisfies WarmUpType);

    expect(onChange).toHaveBeenCalledWith({
      type: 'on',
      options: expect.objectContaining({ warmUp: 'extended' }),
    });
  });
});
