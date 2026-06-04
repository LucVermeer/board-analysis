// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound } from '@boardsesh/climb-filters';

// Minimal RN surface: View → div, StyleSheet stubs the helpers the pill reads.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
}));

// PressableSurface → a <button> that forwards onPress as onClick and exposes its
// accessibility label so we can assert the "<Grade>, <label>" wiring.
type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: string;
};
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress, accessibilityLabel, accessibilityRole }: PressMockProps) =>
    createElement(
      'button',
      { onClick: onPress, 'data-label': accessibilityLabel ?? '', 'data-role': accessibilityRole ?? '' },
      children,
    ),
}));

// GlassSurface degrades elsewhere; here we only assert it receives a tint/fallback
// so we can observe active vs. inactive styling.
vi.mock('../../GlassSurface', () => ({
  GlassSurface: ({ tintColor, fallbackColor }: { tintColor?: string; fallbackColor?: string }) =>
    createElement('div', {
      'data-glass': 'true',
      'data-tint': tintColor ?? '',
      'data-fallback': fallbackColor ?? '',
    }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { fill: '#EEE', secondaryLabel: '#999' },
    brandColors: { primary: '#8C4A52' },
  }),
}));

vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (name: string | null | undefined) => name ?? null }),
}));

// Deterministic colour helpers: tag the inputs so assertions can prove which
// accent flows into the tint when a grade is set.
vi.mock('../../../theme/colors', () => ({
  withAlpha: (color: string, alpha: number) => `${color}@${alpha}`,
}));

vi.mock('@boardsesh/board-constants/grade-colors', () => ({
  getGradeColor: (name: string) => (name === 'V6' ? '#FF0000' : null),
}));

vi.mock('../../../theme/tokens', () => ({ glassMaterial: { regular: 20, thin: 13 } }));
vi.mock('../../../theme/layout', () => ({ glassSize: { standard: 56 } }));

// Real-ish bound predicate: "any" iff both ids are undefined (mirrors source).
vi.mock('@boardsesh/climb-filters', () => ({
  isAnyGrade: (bound: GradeBound) => bound.minGradeId === undefined && bound.maxGradeId === undefined,
}));

// The label formatter is exercised by its own unit; here we stub it to a stable
// string so the pill's own wiring (label → Text + a11y) is what's under test.
const labelFor = vi.hoisted(() => ({ value: 'Any grade' }));
vi.mock('../grade-pill-label', () => ({
  formatGradePillLabel: () => labelFor.value,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { GradePill } from '../GradePill';

const grades: readonly Grade[] = [
  { difficultyId: 10, name: 'V4' },
  { difficultyId: 20, name: 'V6' },
] as unknown as readonly Grade[];

const anyBound: GradeBound = { minGradeId: undefined, maxGradeId: undefined };
const setBound: GradeBound = { minGradeId: 20, maxGradeId: 20 };

const glass = (root: HTMLElement) => root.querySelector('[data-glass]') as HTMLElement;

beforeEach(() => {
  labelFor.value = 'Any grade';
});

describe('GradePill', () => {
  it('renders the grade label text', () => {
    labelFor.value = 'V4–V8';
    const { container } = render(<GradePill bound={setBound} grades={grades} onPress={() => {}} />);
    expect(container.querySelector('[data-text="true"]')?.textContent).toBe('V4–V8');
  });

  it('renders the "any grade" label when the bound is unset', () => {
    labelFor.value = 'mobile.search.anyGrade';
    const { container } = render(<GradePill bound={anyBound} grades={grades} onPress={() => {}} />);
    expect(container.querySelector('[data-text="true"]')?.textContent).toBe('mobile.search.anyGrade');
  });

  it('fires onPress when tapped', () => {
    const onPress = vi.fn();
    const { getByRole } = render(<GradePill bound={setBound} grades={grades} onPress={onPress} />);
    fireEvent.click(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('stays untinted (no glass tint) when no grade is set', () => {
    const { container } = render(<GradePill bound={anyBound} grades={grades} onPress={() => {}} />);
    // Inactive: tint omitted, fallback falls back to the system fill colour.
    expect(glass(container).getAttribute('data-tint')).toBe('');
    expect(glass(container).getAttribute('data-fallback')).toBe('#EEE');
  });

  it('tints with the grade colour when a specific grade is set', () => {
    const { container } = render(<GradePill bound={setBound} grades={grades} onPress={() => {}} />);
    // V6 (difficultyId 20) resolves to #FF0000 via getGradeColor, alpha-mixed by withAlpha.
    expect(glass(container).getAttribute('data-tint')).toBe('#FF0000@0.22');
    expect(glass(container).getAttribute('data-fallback')).toBe('#FF0000@0.16');
  });

  it('falls back to the brand tint when the grade has no colour', () => {
    // difficultyId 10 → "V4" → getGradeColor returns null, so accent = brand primary.
    const v4Bound: GradeBound = { minGradeId: 10, maxGradeId: 10 };
    const { container } = render(<GradePill bound={v4Bound} grades={grades} onPress={() => {}} />);
    expect(glass(container).getAttribute('data-tint')).toBe('#8C4A52@0.22');
  });

  it('exposes the grade label through the accessibility label', () => {
    labelFor.value = 'V6';
    const { getByRole } = render(<GradePill bound={setBound} grades={grades} onPress={() => {}} />);
    expect(getByRole('button').getAttribute('data-label')).toBe('mobile.search.grade, V6');
  });

  it('still renders when a maxWidth cap is provided (top-row variant)', () => {
    const { getByRole } = render(<GradePill bound={anyBound} grades={grades} onPress={() => {}} maxWidth={120} />);
    expect(getByRole('button')).not.toBeNull();
  });
});
