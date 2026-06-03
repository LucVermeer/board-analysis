// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

// Controls the platform branch under test.
const ctrl = vi.hoisted(() => ({ os: 'ios' as string }));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return ctrl.os;
    },
  },
}));

// Stand-ins that surface the glyph name + colour so we can assert which renderer ran.
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor }: { name: string; tintColor?: string }) =>
    createElement('div', { 'data-testid': 'symbol-view', 'data-name': name, 'data-tint': tintColor }),
}));

vi.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  default: ({ name, color }: { name: string; color?: string }) =>
    createElement('div', { 'data-testid': 'mci', 'data-name': name, 'data-color': color }),
}));

import { Icon } from '../Icon';
import { iconMap } from '../icon-map';

beforeEach(() => {
  ctrl.os = 'ios';
});

describe('Icon platform rendering', () => {
  it('renders an SF Symbol (SymbolView) with the ios glyph on iOS', () => {
    const { queryByTestId } = render(<Icon name="skip.next" color="#FF0000" />);
    const symbol = queryByTestId('symbol-view');
    expect(symbol).not.toBeNull();
    expect(queryByTestId('mci')).toBeNull();
    expect(symbol?.getAttribute('data-name')).toBe(iconMap['skip.next'].ios);
    expect(symbol?.getAttribute('data-tint')).toBe('#FF0000');
  });

  it('renders MaterialCommunityIcons with the android glyph on Android', () => {
    ctrl.os = 'android';
    const { queryByTestId } = render(<Icon name="skip.next" color="#00FF00" />);
    const mci = queryByTestId('mci');
    expect(mci).not.toBeNull();
    expect(queryByTestId('symbol-view')).toBeNull();
    expect(mci?.getAttribute('data-name')).toBe(iconMap['skip.next'].android);
    expect(mci?.getAttribute('data-color')).toBe('#00FF00');
  });

  it('maps every transport glyph to its platform-specific name', () => {
    for (const transportName of ['play.fill', 'pause', 'skip.previous', 'skip.next', 'end.session'] as const) {
      ctrl.os = 'ios';
      const ios = render(<Icon name={transportName} />);
      expect(ios.queryByTestId('symbol-view')?.getAttribute('data-name')).toBe(iconMap[transportName].ios);
      ios.unmount();

      ctrl.os = 'android';
      const android = render(<Icon name={transportName} />);
      expect(android.queryByTestId('mci')?.getAttribute('data-name')).toBe(iconMap[transportName].android);
      android.unmount();
    }
  });
});
