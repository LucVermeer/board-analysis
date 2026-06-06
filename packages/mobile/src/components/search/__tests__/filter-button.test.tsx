// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

// GlassIconButton → a <button> surfacing the props FilterButton forwards: the
// badge count, the icon tint, the glass tint, and the accessibility label.
type GlassMockProps = {
  iconName?: string;
  iconColor?: string;
  iconSize?: number;
  size?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  tintColor?: string;
  fallbackColor?: string;
  badgeCount?: number;
};
vi.mock('../../GlassIconButton', () => ({
  GlassIconButton: ({
    iconName,
    iconColor,
    iconSize,
    size,
    onPress,
    onLongPress,
    accessibilityLabel,
    accessibilityHint,
    tintColor,
    fallbackColor,
    badgeCount,
  }: GlassMockProps) =>
    createElement('button', {
      onClick: onPress,
      onDoubleClick: onLongPress,
      'data-icon': iconName,
      'data-icon-color': iconColor ?? '',
      'data-icon-size': iconSize == null ? '' : String(iconSize),
      'data-size': size == null ? '' : String(size),
      'data-label': accessibilityLabel ?? '',
      'data-hint': accessibilityHint ?? '',
      'data-tint': tintColor ?? '',
      'data-fallback': fallbackColor ?? '',
      'data-badge': badgeCount == null ? '' : String(badgeCount),
    }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { fill: '#EEE', secondaryLabel: '#999' },
    brandColors: { primary: '#8C4A52' },
  }),
}));

// Deterministic colour helper so the active tint/fallback are assertable.
vi.mock('../../../theme/colors', () => ({
  withAlpha: (color: string, alpha: number) => `${color}@${alpha}`,
}));

vi.mock('../../../theme/layout', () => ({
  glassSize: { inlinePrimary: 48 },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { FilterButton } from '../FilterButton';

const button = (root: HTMLElement) => root.querySelector('[data-icon="filter"]') as HTMLButtonElement;

describe('FilterButton', () => {
  it('renders the filter glyph and fires onPress', () => {
    const onPress = vi.fn();
    const { container, getByRole } = render(<FilterButton activeFilterCount={0} onPress={onPress} />);
    expect(button(container)).not.toBeNull();
    fireEvent.click(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires the optional long-press handler without firing onPress', () => {
    const onPress = vi.fn();
    const onLongPress = vi.fn();
    const { getByRole } = render(<FilterButton activeFilterCount={0} onPress={onPress} onLongPress={onLongPress} />);
    fireEvent.doubleClick(getByRole('button'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('forwards the active filter count as the badge', () => {
    const { container } = render(<FilterButton activeFilterCount={3} onPress={() => {}} />);
    expect(button(container).getAttribute('data-badge')).toBe('3');
  });

  it('uses the smaller floating action size', () => {
    const { container } = render(<FilterButton activeFilterCount={0} onPress={() => {}} />);
    const filterButton = button(container);
    expect(filterButton.getAttribute('data-size')).toBe('48');
    expect(filterButton.getAttribute('data-icon-size')).toBe('20');
  });

  it('forwards a zero count so the underlying button can hide the badge itself', () => {
    const { container } = render(<FilterButton activeFilterCount={0} onPress={() => {}} />);
    // The count is always forwarded; GlassIconButton owns the "hide when 0" rule.
    expect(button(container).getAttribute('data-badge')).toBe('0');
  });

  it('uses muted styling when no filters are active', () => {
    const { container } = render(<FilterButton activeFilterCount={0} onPress={() => {}} />);
    const filterButton = button(container);
    // Inactive: icon takes the secondary-label colour, no glass tint, system fill fallback.
    expect(filterButton.getAttribute('data-icon-color')).toBe('#999');
    expect(filterButton.getAttribute('data-tint')).toBe('');
    expect(filterButton.getAttribute('data-fallback')).toBe('#EEE');
  });

  it('tints maroon when at least one filter is active', () => {
    const { container } = render(<FilterButton activeFilterCount={2} onPress={() => {}} />);
    const filterButton = button(container);
    // Active: icon switches to the brand primary, glass tints/falls back to alpha-mixed maroon.
    expect(filterButton.getAttribute('data-icon-color')).toBe('#8C4A52');
    expect(filterButton.getAttribute('data-tint')).toBe('#8C4A52@0.18');
    expect(filterButton.getAttribute('data-fallback')).toBe('#8C4A52@0.16');
  });

  it('omits the count from the a11y label when no filters are active', () => {
    const { container } = render(<FilterButton activeFilterCount={0} onPress={() => {}} />);
    expect(button(container).getAttribute('data-label')).toBe('mobile.search.filters');
  });

  it('uses the active-count a11y label when filters are active', () => {
    const { container } = render(<FilterButton activeFilterCount={5} onPress={() => {}} />);
    expect(button(container).getAttribute('data-label')).toBe('mobile.search.filterCountAria');
  });

  it('adds the long-press hint when quick grade search is available', () => {
    const { container } = render(<FilterButton activeFilterCount={0} onPress={() => {}} onLongPress={() => {}} />);
    expect(button(container).getAttribute('data-hint')).toBe('mobile.search.filterHint');
  });
});
