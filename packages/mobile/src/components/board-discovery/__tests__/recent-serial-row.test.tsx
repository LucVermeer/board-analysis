// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { RecentBoardSerial } from '@boardsesh/graphql/operations';

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('div', { onClick: onPress }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../lib/haptics', () => ({ hapticSelection: vi.fn() }));
vi.mock('../../../lib/format-relative-time', () => ({ formatRelativeTime: () => '2 days ago' }));
vi.mock('../../../theme/tokens', () => ({
  spacing: new Proxy({}, { get: () => 4 }),
  borderRadius: { lg: 12, md: 8, full: 999 },
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      separator: '#ccc',
      fill: '#eee',
      tertiaryLabel: '#999',
      secondaryLabel: '#888',
      secondaryBackground: '#fafafa',
    },
    brandColors: { primary: '#6D28D9', success: '#047857' },
  }),
}));
vi.mock('../recent-serial-helpers', () => ({
  getBoardConfigLabel: () => 'Kilter · Original · 12×12',
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));
vi.mock('../../queue-control/AccessoryClimbThumbnail', () => ({
  AccessoryClimbThumbnail: () => createElement('div', { 'data-testid': 'thumbnail' }),
}));

import { RecentSerialRow } from '../RecentSerialRow';

function makeSerial(overrides: Partial<RecentBoardSerial> = {}): RecentBoardSerial {
  return {
    serialNumber: 'SN1',
    boardName: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    apiLevel: 3,
    updatedAt: '2026-04-01T00:00:00.000Z',
    ownedBoard: null,
    lastClimb: null,
    ...overrides,
  } as RecentBoardSerial;
}

const LAST_CLIMB = {
  climbUuid: 'c1',
  name: 'Purple Rain',
  frames: 'p1r15',
  angle: 40,
  difficulty: 20,
  gradeName: 'V5',
  setter: 'bob',
  climbedAt: '2026-04-02T12:00:00.000Z',
};

function icons(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-icon]')).map((node) => node.getAttribute('data-icon') ?? '');
}

describe('RecentSerialRow', () => {
  afterEach(cleanup);

  it('shows a chevron (not a "Saved" tag) and the climb thumbnail for an unsaved serial with a last send', () => {
    const serial = makeSerial({ lastClimb: LAST_CLIMB });
    const { container, queryByText, queryByTestId } = render(
      createElement(RecentSerialRow, { serial, onPress: vi.fn() }),
    );

    expect(icons(container)).toContain('chevron.right');
    expect(queryByText('mobile.create.saved')).toBeNull();
    expect(queryByTestId('thumbnail')).not.toBeNull();
  });

  it('shows a "Saved" tag and the board name for a serial that is already owned', () => {
    const serial = makeSerial({
      ownedBoard: { uuid: 'b1', name: 'My Home Wall' } as RecentBoardSerial['ownedBoard'],
      lastClimb: LAST_CLIMB,
    });
    const { getByText, queryByText } = render(createElement(RecentSerialRow, { serial, onPress: vi.fn() }));

    expect(getByText('mobile.create.saved')).toBeTruthy();
    expect(getByText('My Home Wall')).toBeTruthy();
    // Owned rows don't show the drill-in chevron.
    expect(queryByText('chevron.right')).toBeNull();
  });

  it('renders the placeholder (no thumbnail) when there is no last send', () => {
    const serial = makeSerial({ lastClimb: null });
    const { container, queryByTestId } = render(createElement(RecentSerialRow, { serial, onPress: vi.fn() }));

    expect(queryByTestId('thumbnail')).toBeNull();
    // Placeholder tile shows the generic boards glyph.
    expect(icons(container)).toContain('boards');
  });

  it('calls onPress with the serial when tapped', () => {
    const onPress = vi.fn();
    const serial = makeSerial();
    const { container } = render(createElement(RecentSerialRow, { serial, onPress }));

    fireEvent.click(container.firstChild as HTMLElement);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(serial);
  });
});
