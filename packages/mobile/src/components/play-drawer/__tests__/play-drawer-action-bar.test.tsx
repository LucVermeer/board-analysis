// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Minimal RN surface. Pressable exposes its a11y label + hitSlop so the angle
// pill's restored 44pt touch target is inspectable.
type PressMockProps = {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  hitSlop?: number;
};
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress, accessibilityLabel, hitSlop }: PressMockProps) =>
    createElement(
      'button',
      { onClick: onPress, 'data-label': accessibilityLabel, 'data-hitslop': hitSlop == null ? '' : String(hitSlop) },
      children,
    ),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// Icon → expose name + colour so the tick glyph's green (colour-on-glyph, not a
// fill) is assertable. Paths are relative to THIS test file (one level under the
// source in __tests__), so they carry an extra `../`.
vi.mock('../../Icon', () => ({
  Icon: ({ name, color }: { name?: string; color?: string }) =>
    createElement('span', { 'data-icon': name, 'data-color': color }),
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../ble/BleLightbulbButton', () => ({
  BleLightbulbButton: () => createElement('div', { 'data-ble': 'true' }),
}));
vi.mock('../../drawer-action-bar/DrawerActionBar', () => ({
  SIZES: { lg: { dim: 48, icon: 28 }, sm: { dim: 44, icon: 22 } },
  ActionButton: ({ iconName }: { iconName?: string }) => createElement('div', { 'data-action': iconName }),
  drawerActionBarStyles: {
    container: {},
    rowPrimary: {},
    primarySlot: {},
    rowSecondary: {},
    spacer: {},
    actionButton: {},
    actionButtonPressed: {},
  },
}));
vi.mock('../../../theme/colors', () => ({ brandColors: { primary: '#8C4A52', success: '#6B9080' } }));
vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: { white: '#FFFFFF', systemGray: '#8E8E93', systemRed: '#FF3B30', separator: '#ccc' },
}));
vi.mock('../../../theme/layout', () => ({ glassSize: { mini: 32 } }));
vi.mock('../../../lib/haptics', () => ({ hapticMedium: vi.fn() }));

import { PlayDrawerActionBar } from '../PlayDrawerActionBar';

const baseProps = {
  canSwipePrevious: true,
  canSwipeNext: true,
  isMirrored: false,
  supportsMirroring: true,
  isFavorited: false,
  remainingQueueCount: 3,
  lightbulbActive: false,
  ascentCount: 2,
  currentAngle: 40,
  onPrevClick: vi.fn(),
  onNextClick: vi.fn(),
  onMirror: vi.fn(),
  onToggleFavorite: vi.fn(),
  onLightbulb: vi.fn(),
  onOpenActions: vi.fn(),
  onOpenQueue: vi.fn(),
  onShare: vi.fn(),
  onTickPress: vi.fn(),
  onTickLongPress: vi.fn(),
  onOpenAngleSelector: vi.fn(),
};

describe('PlayDrawerActionBar', () => {
  it('renders the tick as a green glyph (colour on the icon, not a solid fill)', () => {
    const { container } = render(createElement(PlayDrawerActionBar, baseProps));
    const tick = container.querySelector('[data-icon="tick.outline"]') as HTMLElement;

    expect(tick).toBeTruthy();
    expect(tick.getAttribute('data-color')).toBe('#6B9080');
    // The old solid-white-on-green tick is gone — no white tick glyph remains.
    expect(container.querySelector('[data-icon="tick.outline"][data-color="#FFFFFF"]')).toBeNull();
  });

  it('keeps the 32pt angle pill tappable at the 44pt floor via hit-slop', () => {
    const { container } = render(createElement(PlayDrawerActionBar, baseProps));
    const anglePill = container.querySelector('[data-label="mobile.angleSelector.title"]') as HTMLElement;

    expect(anglePill).toBeTruthy();
    expect(anglePill.textContent).toContain('40°');
    expect(Number(anglePill.getAttribute('data-hitslop'))).toBeGreaterThanOrEqual(6);
  });
});
