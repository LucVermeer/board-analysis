// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, forwardRef, type ReactNode, type Ref } from 'react';

// LogAscentSheet wraps `onClose` in a `handleClose` that fires
// `Quick Tick Dismissed` unless the just-closed tick was actually saved
// (tracked via a `savedRef` it hands down to QuickTickBar). Three paths all
// end up calling `handleClose` today: the X-button, native pan-down/backdrop
// (simulated here through the mocked `BottomSheetModal`'s `onChange`), and a
// successful save (simulated through the stubbed QuickTickBar).

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) => createElement('button', { 'data-label': accessibilityLabel, onClick: onPress }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

// Stub BottomSheetModal: renders an extra button that invokes the `onChange`
// prop with index -1, standing in for a native pan-down/backdrop dismiss.
vi.mock('@expo/ui/community/bottom-sheet', () => ({
  BottomSheetModal: forwardRef(
    ({ children, onChange }: { children?: ReactNode; onChange?: (index: number) => void }, _ref: Ref<unknown>) =>
      createElement('div', null, [
        createElement('button', {
          key: 'pandown',
          'data-testid': 'simulate-pandown',
          onClick: () => onChange?.(-1),
        }),
        children,
      ]),
  ),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// Isolate from the real presentation coordinator (covered by its own test);
// forward straight to the `onClose` LogAscentSheet passes in — a -1 onChange
// stands in for the native pan-down/backdrop-tap dismiss.
vi.mock('../../providers/sheet-presentation-provider', () => ({
  useManagedSheet: ({ onClose }: { onClose?: () => void }) => ({
    onChange: (index: number) => {
      if (index === -1) onClose?.();
    },
  }),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { fill: '#eee', secondaryLabel: '#888' } }),
}));

vi.mock('../Icon', () => ({ Icon: () => createElement('span') }));
vi.mock('../../theme/ios-colors', () => ({ iosSystemColors: {} }));
vi.mock('../../theme/tokens', () => ({ spacing: new Proxy({}, { get: () => 0 }) }));

vi.mock('@boardsesh/analytics', () => ({
  SHARED_EVENTS: { QuickTickDismissed: 'Quick Tick Dismissed' },
}));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

// Stub QuickTickBar: exposes one button that simulates a completed save (sets
// savedRef then calls onDismiss, mirroring the real onSuccess handler) so the
// "save, don't double-count as a dismiss" path can be driven without the real
// form.
vi.mock('../play-drawer/QuickTickBar', () => ({
  QuickTickBar: ({ onDismiss, savedRef }: { onDismiss: () => void; savedRef?: { current: boolean } }) =>
    createElement('button', {
      'data-testid': 'simulate-save-success',
      onClick: () => {
        if (savedRef) savedRef.current = true;
        onDismiss();
      },
    }),
}));

import { LogAscentSheet } from '../LogAscentSheet';
import { track } from '../../lib/analytics';

function renderSheet(overrides: Partial<Parameters<typeof LogAscentSheet>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    createElement(LogAscentSheet, {
      visible: true,
      onClose,
      climbUuid: 'climb-1',
      boardName: 'kilter',
      angle: 40,
      isMirror: false,
      isBenchmark: false,
      layoutId: 7,
      ...overrides,
    }),
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
});

describe('LogAscentSheet dismiss tracking', () => {
  it('fires Quick Tick Dismissed when the X-button closes an unsaved form', () => {
    const { container, onClose } = renderSheet();

    fireEvent.click(container.querySelector('[data-label="playView.tickBar.closeAria"]') as Element);

    expect(track).toHaveBeenCalledWith(
      'Quick Tick Dismissed',
      expect.objectContaining({ climbUuid: 'climb-1', layoutId: 7 }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires Quick Tick Dismissed on a simulated pan-down/backdrop dismiss', () => {
    const { getByTestId, onClose } = renderSheet();

    fireEvent.click(getByTestId('simulate-pandown'));

    expect(track).toHaveBeenCalledWith('Quick Tick Dismissed', expect.objectContaining({ climbUuid: 'climb-1' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends layoutId: null (not undefined) when the sheet has no layoutId', () => {
    const { container } = renderSheet({ layoutId: undefined });

    fireEvent.click(container.querySelector('[data-label="playView.tickBar.closeAria"]') as Element);

    expect(track).toHaveBeenCalledWith('Quick Tick Dismissed', expect.objectContaining({ layoutId: null }));
  });

  it('does not fire Quick Tick Dismissed when the tick was just saved', () => {
    const { getByTestId, onClose } = renderSheet();

    fireEvent.click(getByTestId('simulate-save-success'));

    expect(track).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the saved flag on reopen, so a later abandon after a save still fires the event', () => {
    const onClose = vi.fn();
    const { getByTestId, rerender } = render(
      createElement(LogAscentSheet, {
        visible: true,
        onClose,
        climbUuid: 'climb-1',
        boardName: 'kilter',
        angle: 40,
        isMirror: false,
        isBenchmark: false,
      }),
    );

    // Save once — no dismiss event, matches the "just saved" case above.
    fireEvent.click(getByTestId('simulate-save-success'));
    expect(track).not.toHaveBeenCalled();

    // Close, then reopen for a new tick on the same climb.
    rerender(
      createElement(LogAscentSheet, {
        visible: false,
        onClose,
        climbUuid: 'climb-1',
        boardName: 'kilter',
        angle: 40,
        isMirror: false,
        isBenchmark: false,
      }),
    );
    rerender(
      createElement(LogAscentSheet, {
        visible: true,
        onClose,
        climbUuid: 'climb-1',
        boardName: 'kilter',
        angle: 40,
        isMirror: false,
        isBenchmark: false,
      }),
    );

    // Abandon this second tick — without the reset-on-reopen effect this would
    // stay silently swallowed by the stale `savedRef.current === true` from
    // the first save.
    fireEvent.click(getByTestId('simulate-pandown'));
    expect(track).toHaveBeenCalledWith('Quick Tick Dismissed', expect.objectContaining({ climbUuid: 'climb-1' }));
  });
});
