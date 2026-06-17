// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

// t echoes the key so the badge copy is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: { white: '#FFFFFF', systemGreen: '#34C759' },
}));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 4: 16 },
  borderRadius: { sm: 4 },
}));

import { PlayDrawerOnWallBanner } from '../PlayDrawerOnWallBanner';

describe('PlayDrawerOnWallBanner', () => {
  it('renders the "Now on the wall" badge', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    expect(container.textContent).toContain('playView.onWallBadge');
  });

  it('renders no button — the wall climb is a read-only status, not a promotable preview', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('playView.setActive');
  });
});
