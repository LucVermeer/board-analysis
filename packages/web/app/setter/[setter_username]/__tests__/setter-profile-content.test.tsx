import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import SetterProfileContent from '../setter-profile-content';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockRequest = vi.fn();
const mockShowMessage = vi.fn();
const mockShareWithFallback = vi.fn();
const mockSession = { authToken: 'auth-token' };

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession, status: 'authenticated' }),
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@boardsesh/graphql/operations', () => ({
  GET_SETTER_PROFILE: 'GET_SETTER_PROFILE',
  FOLLOW_SETTER: 'FOLLOW_SETTER',
  UNFOLLOW_SETTER: 'UNFOLLOW_SETTER',
}));

vi.mock('@/app/lib/share-utils', () => ({
  shareWithFallback: (...args: unknown[]) => mockShareWithFallback(...args),
}));

vi.mock('@/app/theme/theme-config', () => ({
  themeTokens: { colors: { primary: '#123456' } },
}));

vi.mock('@/app/components/back-button', () => ({
  default: () => <div data-testid="back-button" />,
}));

vi.mock('@/app/components/ui/follow-button', () => ({
  default: () => <div data-testid="follow-button" />,
}));

vi.mock('@/app/components/climb-list/setter-climb-list', () => ({
  default: (props: { username: string; boardTypes: string[]; authToken: string | null }) => (
    <div
      data-testid="setter-climb-list"
      data-auth-token={props.authToken ?? ''}
      data-board-types={props.boardTypes.join(',')}
      data-username={props.username}
    />
  ),
}));

vi.mock('@/app/components/ui/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" role="progressbar" />,
}));

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    username: 'jwebxl',
    linkedUserDisplayName: 'J WebXL',
    linkedUserAvatarUrl: null,
    followerCount: 12,
    climbCount: 34,
    boardTypes: ['kilter', 'moonboard'],
    isFollowedByMe: false,
    ...overrides,
  };
}

describe('SetterProfileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the fetched setter profile after loading', async () => {
    mockRequest.mockResolvedValueOnce({ setterProfile: makeProfile() });

    render(<SetterProfileContent username="jwebxl" />);

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('J WebXL')).toBeTruthy();
    });

    const climbList = screen.getByTestId('setter-climb-list');
    expect(climbList.getAttribute('data-username')).toBe('jwebxl');
    expect(climbList.getAttribute('data-board-types')).toBe('kilter,moonboard');
    expect(climbList.getAttribute('data-auth-token')).toBe('auth-token');
    expect(screen.getByLabelText('Share setter profile')).toBeTruthy();
  });

  it('renders the not found state when no profile is returned', async () => {
    mockRequest.mockResolvedValueOnce({ setterProfile: null });

    render(<SetterProfileContent username="missing-setter" />);

    await waitFor(() => {
      expect(screen.getByText('Setter Not Found')).toBeTruthy();
    });

    expect(screen.queryByLabelText('Share setter profile')).toBeNull();
  });

  it('shares the setter profile URL and copy after load', async () => {
    mockRequest.mockResolvedValueOnce({ setterProfile: makeProfile() });
    mockShareWithFallback.mockResolvedValueOnce(true);

    render(<SetterProfileContent username="jwebxl" />);

    fireEvent.click(await screen.findByLabelText('Share setter profile'));

    await waitFor(() => {
      expect(mockShareWithFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `${window.location.origin}/setter/jwebxl`,
          title: 'J WebXL - Setter',
          text: "Check out J WebXL's climbs on Boardsesh",
          trackingEvent: 'Setter Shared',
          trackingProps: { username: 'jwebxl' },
          onClipboardSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });
});
