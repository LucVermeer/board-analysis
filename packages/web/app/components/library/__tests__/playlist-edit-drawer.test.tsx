import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import PlaylistEditDrawer from '../playlist-edit-drawer';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockShowMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

const mockUseWsAuthToken = vi.fn();
vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => mockUseWsAuthToken(),
}));

const mockExecuteGraphQL = vi.fn();
vi.mock('@/app/lib/graphql/client', () => ({
  executeGraphQL: (...args: unknown[]) => mockExecuteGraphQL(...args),
}));

vi.mock('@/app/components/swipeable-drawer/swipeable-drawer', () => ({
  default: (props: { open: boolean; extra?: React.ReactNode; children?: React.ReactNode }) => {
    if (!props.open) return null;
    return (
      <div data-testid="drawer">
        {props.children}
        <div data-testid="drawer-extra">{props.extra}</div>
      </div>
    );
  },
}));

function createPlaylist(overrides?: Partial<Playlist>): Playlist {
  return {
    id: '1',
    uuid: 'pl-uuid-1',
    boardType: 'kilter',
    layoutId: 1,
    name: 'Crimp circuit',
    description: 'Ten hard ones',
    isPublic: false,
    color: '#ff0000',
    icon: '🔥',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Playlist;
}

const getDescriptionField = () =>
  screen.getByPlaceholderText(tFromCatalog('playlists', 'edit.fields.descriptionPlaceholder')) as HTMLTextAreaElement;
const getSave = () =>
  within(screen.getByTestId('drawer-extra')).getByRole('button', {
    name: tFromCatalog('playlists', 'edit.actions.save'),
  });
const getRemoveIcon = () => screen.getByRole('button', { name: tFromCatalog('playlists', 'edit.fields.removeIcon') });

describe('PlaylistEditDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWsAuthToken.mockReturnValue({ token: 'test-token', isAuthenticated: true, isLoading: false });
  });

  function renderDrawer(playlist: Playlist) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<PlaylistEditDrawer open playlist={playlist} onClose={onClose} onSuccess={onSuccess} />);
    return { onClose, onSuccess };
  }

  // The server contract is '' = clear the field, undefined = leave it unchanged.
  // The drawer used to map an emptied field to undefined, so "Remove" on the
  // icon and a cleared description silently did nothing on save.
  it("sends '' for an emptied description and a removed icon so the server clears them", async () => {
    const playlist = createPlaylist();
    mockExecuteGraphQL.mockResolvedValueOnce({ updatePlaylist: playlist });
    const { onSuccess, onClose } = renderDrawer(playlist);

    await waitFor(() => expect(getDescriptionField().value).toBe('Ten hard ones'));

    fireEvent.change(getDescriptionField(), { target: { value: '' } });
    fireEvent.click(getRemoveIcon());
    fireEvent.click(getSave());

    await waitFor(() => expect(mockExecuteGraphQL).toHaveBeenCalledTimes(1));

    const [, variables, token] = mockExecuteGraphQL.mock.calls[0];
    expect(variables).toEqual({
      input: {
        playlistId: 'pl-uuid-1',
        name: 'Crimp circuit',
        description: '',
        color: '#ff0000',
        icon: '',
        isPublic: false,
      },
    });
    expect(token).toBe('test-token');
    expect(onSuccess).toHaveBeenCalledWith(playlist);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves untouched fields at their seeded values', async () => {
    const playlist = createPlaylist();
    mockExecuteGraphQL.mockResolvedValueOnce({ updatePlaylist: playlist });
    renderDrawer(playlist);

    await waitFor(() => expect(getDescriptionField().value).toBe('Ten hard ones'));
    fireEvent.click(getSave());

    await waitFor(() => expect(mockExecuteGraphQL).toHaveBeenCalledTimes(1));

    const [, variables] = mockExecuteGraphQL.mock.calls[0];
    expect(variables).toEqual({
      input: {
        playlistId: 'pl-uuid-1',
        name: 'Crimp circuit',
        description: 'Ten hard ones',
        color: '#ff0000',
        icon: '🔥',
        isPublic: false,
      },
    });
  });

  it("sends '' for a playlist that never had a colour or icon", async () => {
    const playlist = createPlaylist({ color: undefined, icon: undefined, description: undefined });
    mockExecuteGraphQL.mockResolvedValueOnce({ updatePlaylist: playlist });
    renderDrawer(playlist);

    await waitFor(() => expect(getDescriptionField().value).toBe(''));
    fireEvent.click(getSave());

    await waitFor(() => expect(mockExecuteGraphQL).toHaveBeenCalledTimes(1));

    const [, variables] = mockExecuteGraphQL.mock.calls[0];
    expect(variables).toEqual({
      input: {
        playlistId: 'pl-uuid-1',
        name: 'Crimp circuit',
        description: '',
        color: '',
        icon: '',
        isPublic: false,
      },
    });
  });

  it('shows an error and keeps the drawer open when the mutation fails', async () => {
    const playlist = createPlaylist();
    mockExecuteGraphQL.mockRejectedValueOnce(new Error('boom'));
    const { onSuccess, onClose } = renderDrawer(playlist);

    fireEvent.click(getSave());

    await waitFor(() =>
      expect(mockShowMessage).toHaveBeenCalledWith(tFromCatalog('playlists', 'edit.messages.updateFailed'), 'error'),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
