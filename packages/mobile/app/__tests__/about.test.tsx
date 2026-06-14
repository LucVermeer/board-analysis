// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const browser = vi.hoisted(() => ({ openBrowserAsync: vi.fn().mockResolvedValue(undefined) }));
const scrollView = vi.hoisted(() => ({ contentContainerStyle: null as unknown }));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (colorName: string) => colorName,
  ScrollView: ({ children, contentContainerStyle }: { children?: ReactNode; contentContainerStyle?: unknown }) => {
    scrollView.contentContainerStyle = contentContainerStyle;
    return createElement('section', { 'data-testid': 'about-scroll' }, children);
  },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
vi.mock('expo-web-browser', () => browser);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'mobile.about.joinDiscord': 'Join Discord',
      })[key] ?? key,
  }),
}));

vi.mock('../../src/components/Button', () => ({
  Button: ({ icon, onPress, title }: { icon?: string; onPress: () => void; title: string }) =>
    createElement('button', { 'data-icon': icon, onClick: onPress, type: 'button' }, title),
}));
vi.mock('../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));
vi.mock('../../src/components/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
}));
vi.mock('../../src/components/Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../src/hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ scrollBottomPadding: 80 }),
}));
vi.mock('../../src/providers/theme-provider', () => ({
  useTheme: () => ({
    brandColors: { onPrimary: '#fff', primaryFill: '#6D28D9' },
    systemColors: {
      accent: '#6D28D9',
      fill: '#eee',
      secondaryBackground: '#fff',
      secondaryLabel: '#666',
    },
  }),
}));

import { DISCORD_INVITE_URL } from '../../src/lib/discord';
import AboutScreen from '../about';

beforeEach(() => {
  browser.openBrowserAsync.mockClear();
  scrollView.contentContainerStyle = null;
});

describe('AboutScreen Discord CTA', () => {
  it('renders a Discord button that opens the invite', () => {
    render(<AboutScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Join Discord' }));

    expect(browser.openBrowserAsync).toHaveBeenCalledWith(DISCORD_INVITE_URL);
  });

  it('adds bottom chrome padding to the ScrollView content', () => {
    render(<AboutScreen />);

    expect(scrollView.contentContainerStyle).toContainEqual({ paddingBottom: 104 });
  });
});
