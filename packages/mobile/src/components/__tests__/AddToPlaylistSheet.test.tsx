// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';

const playlistContext = vi.hoisted(() => ({
  playlists: [] as Playlist[],
  addToPlaylist: vi.fn(),
  createPlaylist: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('react-native', () => ({
  ActivityIndicator: () => createElement('div', { 'data-spinner': 'true' }),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: function BottomSheetModal() {
    return null;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({
    brandColors: { primary: '#6D28D9' },
    systemColors: { accent: '#6D28D9', fill: '#eeeeee' },
  }),
}));

vi.mock('../../providers/toast-provider', () => ({
  useToast: () => toast,
}));

vi.mock('../../providers/playlists-provider', () => ({
  usePlaylistsContext: () => playlistContext,
}));

vi.mock('../../theme/ios-colors', () => ({
  iosSystemColors: { systemGray: '#8E8E93' },
}));

vi.mock('../../theme/tokens', () => ({
  spacing: { 2: 8, 3: 12, 4: 16, 6: 24 },
}));

vi.mock('../ModalSheet', () => ({
  ModalSheet: forwardRef(function ModalSheet({ children }: { children?: ReactNode }, ref) {
    useImperativeHandle(ref, () => ({ present: vi.fn(), dismiss: vi.fn() }));
    return createElement('div', { 'data-modal-sheet': 'true' }, children);
  }),
}));

vi.mock('../ClimbPreviewCard', () => ({
  ClimbPreviewCard: () => createElement('div', { 'data-climb-preview': 'true' }),
}));

vi.mock('../ListRow', () => ({
  ListRow: ({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress?: () => void }) =>
    createElement('button', { onClick: onPress, 'aria-label': title }, `${title}${subtitle ? ` ${subtitle}` : ''}`),
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../playlist', () => ({
  PlaylistFormSheet: ({
    visible,
    submitting,
    onSubmit,
  }: {
    visible: boolean;
    submitting?: boolean;
    onSubmit: (values: { name: string; description?: string; color?: string; icon?: string }) => void;
  }) =>
    visible
      ? createElement(
          'button',
          {
            'aria-label': 'submit-created-playlist',
            'data-submitting': submitting ? 'true' : 'false',
            onClick: () => onSubmit({ name: 'Projects', description: undefined, color: undefined, icon: undefined }),
          },
          'submit create',
        )
      : null,
}));

import { AddToPlaylistSheet } from '../AddToPlaylistSheet';

const climb = {
  uuid: 'climb-1',
  name: 'Big Move',
  frames: '',
  angle: 40,
} as Climb;

const playlist = {
  id: 'p-1',
  uuid: 'p-1',
  name: 'Hard Crimps',
  climbCount: 3,
  isPublic: false,
  boardType: 'kilter',
  layoutId: 1,
  followerCount: 0,
  isFollowedByMe: false,
  isPinnedByMe: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} satisfies Playlist;

function renderSheet(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <AddToPlaylistSheet
        visible
        climb={climb}
        boardName="kilter"
        layoutId={1}
        sizeId={10}
        setIds="1,2"
        angle={40}
        onClose={onClose}
      />,
    ),
  };
}

describe('AddToPlaylistSheet', () => {
  beforeEach(() => {
    playlistContext.playlists = [];
    playlistContext.isLoading = false;
    playlistContext.isAuthenticated = true;
    playlistContext.addToPlaylist.mockReset();
    playlistContext.createPlaylist.mockReset();
    toast.showToast.mockReset();
  });

  it('creates a playlist from the sheet and adds the current climb to it', async () => {
    const created = { ...playlist, uuid: 'p-new', id: 'p-new', name: 'Projects', climbCount: 0 };
    playlistContext.createPlaylist.mockResolvedValueOnce(created);
    playlistContext.addToPlaylist.mockResolvedValueOnce(undefined);
    const { getByLabelText, onClose } = renderSheet();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.click(getByLabelText('submit-created-playlist'));

    await waitFor(() => {
      expect(playlistContext.createPlaylist).toHaveBeenCalledWith('Projects', undefined, undefined, undefined, {
        boardType: 'kilter',
        layoutId: 1,
      });
      expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-new', 'climb-1', 40);
    });
    expect(toast.showToast).toHaveBeenCalledWith('actions.playlist.toast.createdNamed', 'success');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps existing playlist rows adding the climb', async () => {
    playlistContext.playlists = [playlist];
    playlistContext.addToPlaylist.mockResolvedValueOnce(undefined);
    const { getByLabelText, onClose } = renderSheet();

    fireEvent.click(getByLabelText('Hard Crimps'));

    await waitFor(() => {
      expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-1', 'climb-1', 40);
    });
    expect(toast.showToast).toHaveBeenCalledWith('actions.playlist.toast.added', 'success');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the add sheet open when playlist creation succeeds but adding the climb fails', async () => {
    const created = { ...playlist, uuid: 'p-new', id: 'p-new', name: 'Projects', climbCount: 0 };
    playlistContext.createPlaylist.mockResolvedValueOnce(created);
    playlistContext.addToPlaylist.mockRejectedValueOnce(new Error('add failed'));
    const { getByLabelText, onClose } = renderSheet();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.click(getByLabelText('submit-created-playlist'));

    await waitFor(() => {
      expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-new', 'climb-1', 40);
    });
    expect(toast.showToast).toHaveBeenCalledWith('actions.playlist.toast.addFailed', 'error');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the create sheet open when playlist creation fails', async () => {
    playlistContext.createPlaylist.mockRejectedValueOnce(new Error('create failed'));
    const { getByLabelText, onClose } = renderSheet();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.click(getByLabelText('submit-created-playlist'));

    await waitFor(() => {
      expect(toast.showToast).toHaveBeenCalledWith('actions.playlist.toast.createFailed', 'error');
    });
    expect(getByLabelText('submit-created-playlist')).not.toBeNull();
    expect(playlistContext.addToPlaylist).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not show the create action for signed-out users', () => {
    playlistContext.isAuthenticated = false;
    const { queryByLabelText, getByText } = renderSheet();

    expect(queryByLabelText('actions.playlist.popover.createNew')).toBeNull();
    expect(getByText('actions.playlist.popover.signInBlurb')).not.toBeNull();
  });
});
