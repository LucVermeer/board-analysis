// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';

const playlistContext = vi.hoisted(() => ({
  playlists: [] as Playlist[],
  addToPlaylist: vi.fn(),
  removeFromPlaylist: vi.fn(),
  createPlaylist: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
}));
const qstate = vi.hoisted(() => ({ data: [] as string[] | undefined, loading: false }));
const queryClientMock = vi.hoisted(() => ({
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  cancelQueries: vi.fn(async () => {}),
}));
const membershipStore = vi.hoisted(() => ({ setMembershipForClimb: vi.fn() }));

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: qstate.data, isLoading: qstate.loading }),
  useQueryClient: () => queryClientMock,
}));

vi.mock('@boardsesh/graphql/operations/playlists', () => ({ GET_PLAYLISTS_FOR_CLIMB: 'GET_PLAYLISTS_FOR_CLIMB' }));
vi.mock('@boardsesh/climb-actions', () => ({ playlistMembershipStore: membershipStore }));
vi.mock('../../../lib/graphql/client', () => ({ getHttpClient: () => ({ request: vi.fn() }) }));

vi.mock('../../../providers/playlists-provider', () => ({
  usePlaylistsContext: () => playlistContext,
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    brandColors: { primary: '#6D28D9' },
    systemColors: {
      accent: '#6D28D9',
      fill: '#eeeeee',
      label: '#000',
      secondaryLabel: '#555',
      tertiaryLabel: '#999',
      separator: '#ccc',
    },
  }),
}));

vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: { white: '#fff', systemRed: '#f00', systemGray: '#8E8E93' },
}));

vi.mock('../../../theme/tokens', () => ({
  borderRadius: { full: 9999, md: 8 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 10: 40 },
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../../ListRow', () => ({
  ListRow: ({
    title,
    onPress,
    trailing,
    accessibilityHint,
  }: {
    title: string;
    onPress?: () => void;
    trailing?: ReactNode;
    accessibilityHint?: string;
  }) =>
    createElement('button', { onClick: onPress, 'aria-label': title, 'data-hint': accessibilityHint }, title, trailing),
}));

import { InlinePlaylistPicker } from '../InlinePlaylistPicker';

const climb = { uuid: 'climb-1', name: 'Big Move', frames: '' } as Climb;

const basePlaylist = {
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

function makePlaylist(uuid: string, name: string): Playlist {
  return { ...basePlaylist, id: uuid, uuid, name };
}

// A trivial injected text input so the component stays presentation-agnostic.
function NameInput(props: { value?: string; onChangeText?: (text: string) => void }) {
  return createElement('input', {
    'aria-label': 'name-input',
    value: props.value ?? '',
    onChange: (event: { target: { value: string } }) => props.onChangeText?.(event.target.value),
  });
}

function renderPicker(onBack?: () => void) {
  return render(
    <InlinePlaylistPicker
      climb={climb}
      angle={40}
      boardName="kilter"
      layoutId={1}
      TextInputComponent={NameInput as never}
      onBack={onBack}
    />,
  );
}

function hasCheck(button: HTMLElement): boolean {
  return !!button.querySelector('[data-icon="check.small"]');
}

describe('InlinePlaylistPicker', () => {
  beforeEach(() => {
    playlistContext.playlists = [];
    playlistContext.isLoading = false;
    playlistContext.isAuthenticated = true;
    playlistContext.addToPlaylist.mockReset().mockResolvedValue(undefined);
    playlistContext.removeFromPlaylist.mockReset().mockResolvedValue(undefined);
    playlistContext.createPlaylist.mockReset();
    qstate.data = [];
    qstate.loading = false;
    queryClientMock.getQueryData.mockReset().mockReturnValue(undefined);
    queryClientMock.setQueryData.mockReset();
    queryClientMock.cancelQueries.mockClear();
    membershipStore.setMembershipForClimb.mockReset();
  });

  it('shows the sign-in blurb and no create button when signed out', () => {
    playlistContext.isAuthenticated = false;
    const { queryByLabelText, getByText } = renderPicker();
    expect(queryByLabelText('actions.playlist.popover.createNew')).toBeNull();
    expect(getByText('actions.playlist.popover.signInBlurb')).not.toBeNull();
  });

  it('shows the empty state and a create button when authed with no playlists', () => {
    const { getByText, getByLabelText } = renderPicker();
    expect(getByText('actions.playlist.popover.empty')).not.toBeNull();
    expect(getByLabelText('actions.playlist.popover.createNew')).not.toBeNull();
  });

  it('renders rows sorted by name with a checkmark only on member playlists', () => {
    playlistContext.playlists = [makePlaylist('p-b', 'banana'), makePlaylist('p-a', 'Apple')];
    qstate.data = ['p-a'];
    const { getByLabelText } = renderPicker();
    // 'Apple' is a member (checkmark), 'banana' is not.
    expect(hasCheck(getByLabelText('Apple'))).toBe(true);
    expect(hasCheck(getByLabelText('banana'))).toBe(false);
    expect(getByLabelText('Apple').getAttribute('data-hint')).toBe('actions.playlist.toast.removed');
    expect(getByLabelText('banana').getAttribute('data-hint')).toBe('actions.playlist.toast.added');
  });

  it('adds the climb when tapping a non-member row (optimistic + store sync)', async () => {
    playlistContext.playlists = [makePlaylist('p-1', 'Hard Crimps')];
    qstate.data = [];
    const { getByLabelText } = renderPicker();

    fireEvent.click(getByLabelText('Hard Crimps'));

    await waitFor(() => {
      expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-1', 'climb-1', 40);
    });
    expect(playlistContext.removeFromPlaylist).not.toHaveBeenCalled();
    expect(queryClientMock.setQueryData).toHaveBeenCalledWith(['playlistsForClimb', 'kilter', 1, 'climb-1'], ['p-1']);
    expect(membershipStore.setMembershipForClimb).toHaveBeenCalledWith('climb-1', ['p-1']);
  });

  it('removes the climb when tapping a member row', async () => {
    playlistContext.playlists = [makePlaylist('p-1', 'Hard Crimps')];
    qstate.data = ['p-1'];
    const { getByLabelText } = renderPicker();

    fireEvent.click(getByLabelText('Hard Crimps'));

    await waitFor(() => {
      expect(playlistContext.removeFromPlaylist).toHaveBeenCalledWith('p-1', 'climb-1');
    });
    expect(playlistContext.addToPlaylist).not.toHaveBeenCalled();
    expect(queryClientMock.setQueryData).toHaveBeenCalledWith(['playlistsForClimb', 'kilter', 1, 'climb-1'], []);
  });

  it('reverts the optimistic membership and surfaces an inline error on failure', async () => {
    playlistContext.playlists = [makePlaylist('p-1', 'Hard Crimps')];
    qstate.data = [];
    playlistContext.addToPlaylist.mockReset().mockRejectedValueOnce(new Error('boom'));
    const { getByLabelText, getByText } = renderPicker();

    fireEvent.click(getByLabelText('Hard Crimps'));

    await waitFor(() => {
      expect(getByText('actions.playlist.toast.addFailed')).not.toBeNull();
    });
    // Optimistic write then revert to the previous set.
    expect(queryClientMock.setQueryData).toHaveBeenNthCalledWith(1, expect.anything(), ['p-1']);
    expect(queryClientMock.setQueryData).toHaveBeenNthCalledWith(2, expect.anything(), []);
  });

  it('creates a playlist inline and adds the climb to it', async () => {
    const created = makePlaylist('p-new', 'Projects');
    playlistContext.createPlaylist.mockResolvedValueOnce(created);
    const { getByLabelText } = renderPicker();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.change(getByLabelText('name-input'), { target: { value: 'Projects' } });
    fireEvent.click(getByLabelText('actions.playlist.create.submit'));

    await waitFor(() => {
      expect(playlistContext.createPlaylist).toHaveBeenCalledWith('Projects', undefined, undefined, undefined, {
        boardType: 'kilter',
        layoutId: 1,
      });
    });
    await waitFor(() => {
      expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-new', 'climb-1', 40);
    });
  });

  it('keeps the created playlist and reports an add error (not a create error) when the follow-up add fails', async () => {
    const created = makePlaylist('p-new', 'Projects');
    playlistContext.createPlaylist.mockResolvedValueOnce(created);
    playlistContext.addToPlaylist.mockReset().mockRejectedValueOnce(new Error('add failed'));
    const { getByLabelText, queryByLabelText, getByText } = renderPicker();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.change(getByLabelText('name-input'), { target: { value: 'Projects' } });
    fireEvent.click(getByLabelText('actions.playlist.create.submit'));

    await waitFor(() => {
      expect(getByText('actions.playlist.toast.addFailed')).not.toBeNull();
    });
    // Created exactly once (no duplicate), the add was attempted, and the form
    // closed — so a retry taps the existing row rather than re-creating.
    expect(playlistContext.createPlaylist).toHaveBeenCalledTimes(1);
    expect(playlistContext.addToPlaylist).toHaveBeenCalledWith('p-new', 'climb-1', 40);
    expect(queryByLabelText('actions.playlist.create.submit')).toBeNull();
  });

  it('shows a create failure inline and keeps the form open without adding', async () => {
    playlistContext.createPlaylist.mockRejectedValueOnce(new Error('create failed'));
    const { getByLabelText, getByText } = renderPicker();

    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.change(getByLabelText('name-input'), { target: { value: 'Projects' } });
    fireEvent.click(getByLabelText('actions.playlist.create.submit'));

    await waitFor(() => {
      expect(getByText('actions.playlist.toast.createFailed')).not.toBeNull();
    });
    expect(playlistContext.addToPlaylist).not.toHaveBeenCalled();
    // Form stays open (submit still present) so the user can fix and retry.
    expect(getByLabelText('actions.playlist.create.submit')).not.toBeNull();
  });

  it('blocks create with an empty name and shows a validation error', () => {
    const { getByLabelText, getByText } = renderPicker();
    fireEvent.click(getByLabelText('actions.playlist.popover.createNew'));
    fireEvent.click(getByLabelText('actions.playlist.create.submit'));
    expect(getByText('actions.playlist.validation.nameRequired')).not.toBeNull();
    expect(playlistContext.createPlaylist).not.toHaveBeenCalled();
  });
});
