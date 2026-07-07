// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';

// Capture what ClimbReactionMenu passes into useClimbActions (so we can assert the
// playlist action is wired to the inline view switch) and what the picker gets.
const captured = vi.hoisted(() => ({
  actionArgs: null as Record<string, unknown> | null,
  pickerOnBack: undefined as undefined | (() => void),
  modalOnRequestClose: undefined as undefined | (() => void),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  Keyboard: { addListener: () => ({ remove: () => {} }) },
  Modal: ({ children, onRequestClose }: { children?: ReactNode; onRequestClose?: () => void }) => {
    captured.modalOnRequestClose = onRequestClose;
    return createElement('div', { 'data-modal': 'true' }, children);
  },
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('button', { onClick: onPress }, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  TextInput: () => null,
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (s: Record<string, unknown>) => s, absoluteFill: {}, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: number) => ({ value: v }),
  withSpring: (v: number) => v,
  withTiming: (v: number) => v,
  runOnJS: (fn: () => void) => fn,
}));

vi.mock('@react-native-community/blur', () => ({ BlurView: () => null }));
vi.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@boardsesh/board-constants/grade-colors', () => ({
  getGradeColor: () => '#fff',
  DEFAULT_GRADE_COLOR: '#fff',
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: () => null }));
vi.mock('../../ListRow', () => ({
  ListRow: ({ title, onPress }: { title: string; onPress?: () => void }) =>
    createElement('button', { onClick: onPress, 'aria-label': title }, title),
}));
vi.mock('../../GlassSurface', () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../BoardImageNative', () => ({ BoardImageNative: () => null }));
vi.mock('../../ClimbAttributeIcons', () => ({ ClimbAttributeIcons: () => null }));
vi.mock('../../playlist/InlinePlaylistPicker', () => ({
  InlinePlaylistPicker: ({ onBack }: { onBack?: () => void }) => {
    captured.pickerOnBack = onBack;
    return createElement('div', { 'data-picker': 'true' }, 'picker');
  },
}));
vi.mock('../../../lib/board-details', () => ({ getBoardRenderData: () => null }));
vi.mock('../../../lib/format-climb-stats', () => ({ formatSends: () => '', formatQuality: () => '' }));
vi.mock('../../../hooks/use-grade-format', () => ({ useGradeFormat: () => ({ formatGrade: () => 'V4' }) }));
vi.mock('../../../providers/theme-provider', () => ({ useTheme: () => ({ colorScheme: 'dark' }) }));
vi.mock('../../../theme/animations', () => ({ springs: { gentle: {} }, timing: { fast: 150 } }));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 5: 20, 6: 24 },
  borderRadius: { lg: 12, xl: 16 },
}));

// The playlist action's run() calls onSelectPlaylist (mirroring the real hook), so
// tapping it drives the view switch we want to test.
vi.mock('../use-climb-actions', () => ({
  useClimbActions: (args: Record<string, unknown>) => {
    captured.actionArgs = args;
    return [
      { id: 'preview', title: 'Preview', icon: 'visibility', color: '#00f', run: () => {} },
      {
        id: 'playlist',
        title: 'Add to Playlist',
        icon: 'playlist',
        color: '#00f',
        run: () => (args.onSelectPlaylist as (() => void) | undefined)?.(),
      },
    ];
  },
}));

import { ClimbReactionMenu } from '../ClimbReactionMenu';

const climb = { uuid: 'climb-1', name: 'Big Move', frames: '', difficulty: 'V4', quality_average: '0' } as Climb;
const boardConfig = { boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2', angle: 40 };

function renderMenu(onClose = vi.fn(), extraProps: Record<string, unknown> = {}) {
  return {
    onClose,
    ...render(
      <ClimbReactionMenu
        climb={climb}
        boardConfig={boardConfig as never}
        isAuthenticated
        reduceMotion
        onClose={onClose}
        {...extraProps}
      />,
    ),
  };
}

describe('ClimbReactionMenu view switching', () => {
  beforeEach(() => {
    captured.actionArgs = null;
    captured.pickerOnBack = undefined;
    captured.modalOnRequestClose = undefined;
  });

  it('renders the action list first and swaps to the inline picker when the playlist action runs', () => {
    const { getByLabelText, queryByLabelText, container } = renderMenu();
    // Menu view: actions present, no picker.
    expect(getByLabelText('Add to Playlist')).not.toBeNull();
    expect(container.querySelector('[data-picker="true"]')).toBeNull();

    // Tapping the playlist action → onSelectPlaylist → view 'playlist'.
    act(() => {
      fireEvent.click(getByLabelText('Add to Playlist'));
    });
    expect(container.querySelector('[data-picker="true"]')).not.toBeNull();
    expect(queryByLabelText('Add to Playlist')).toBeNull();
  });

  it('forwards the onAddBetaVideo override into useClimbActions', () => {
    const onAddBetaVideo = vi.fn();
    renderMenu(vi.fn(), { onAddBetaVideo });
    expect(captured.actionArgs?.onAddBetaVideo).toBe(onAddBetaVideo);
  });

  it('returns to the action list when the picker calls onBack', () => {
    const { getByLabelText, container } = renderMenu();
    act(() => fireEvent.click(getByLabelText('Add to Playlist')));
    expect(container.querySelector('[data-picker="true"]')).not.toBeNull();

    act(() => captured.pickerOnBack?.());
    expect(container.querySelector('[data-picker="true"]')).toBeNull();
    expect(getByLabelText('Add to Playlist')).not.toBeNull();
  });

  it('hardware back dismisses from the menu but only pops the picker from the playlist view', () => {
    const { getByLabelText, onClose, container } = renderMenu();

    // From the playlist view, back pops to the menu without dismissing.
    act(() => fireEvent.click(getByLabelText('Add to Playlist')));
    act(() => captured.modalOnRequestClose?.());
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-picker="true"]')).toBeNull();

    // From the menu, back dismisses the whole overlay (reduceMotion → immediate).
    act(() => captured.modalOnRequestClose?.());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
