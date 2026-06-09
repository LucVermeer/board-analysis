// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratorSelection } from '../GeneratorPickerCard';

const analytics = vi.hoisted(() => ({ track: vi.fn() }));

// The workout-type chips render in CHIP_VALUES order: off, volume, pyramid,
// ladder, gradeFocus. Each Pressable's onPress lands here in render order so the
// test can tap a specific chip.
const chips = vi.hoisted(() => ({ entries: [] as Array<{ label?: string; onPress: () => void }> }));

vi.mock('../../../../lib/analytics', () => ({ track: analytics.track }));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
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
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@boardsesh/board-config', () => ({
  // Two grades so getDefaultTargetGrade picks the middle one deterministically.
  getGradesForBoard: () => [
    { difficulty_id: 10, difficulty_name: '5a' },
    { difficulty_id: 20, difficulty_name: '6a' },
  ],
}));
vi.mock('@boardsesh/board-constants', () => ({
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
vi.mock('../../../Icon', () => ({ Icon: () => null }));
vi.mock('../../../StarRating', () => ({ StarRating: () => null }));
vi.mock('../../../SwitchRow', () => ({ SwitchRow: () => null }));
vi.mock('../../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: {}, brandColors: {} }),
}));
vi.mock('../../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (name: string) => name }),
}));
vi.mock('../../../../theme/tokens', () => ({ spacing: {}, borderRadius: {} }));
vi.mock('../../../../theme/colors', () => ({ brandColors: {} }));
vi.mock('../../../../theme/ios-colors', () => ({ iosSystemColors: {} }));

import { GeneratorPickerCard } from '../GeneratorPickerCard';

beforeEach(() => {
  analytics.track.mockClear();
  chips.entries = [];
});

describe('GeneratorPickerCard analytics', () => {
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

  it('updates warm-up when tapping a warm-up chip', () => {
    const onChange = vi.fn();
    render(
      createElement(GeneratorPickerCard, {
        boardName: 'kilter',
        layoutId: 8,
        sizeId: 21,
        angle: 40,
        selection: {
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
        } satisfies GeneratorSelection,
        onChange,
      }),
    );

    chips.entries.find((entry) => entry.label === 'mobile.session.preGeneratorWarmUpExtended')?.onPress();

    expect(onChange).toHaveBeenCalledWith({
      type: 'on',
      options: expect.objectContaining({ warmUp: 'extended' }),
    });
  });
});
