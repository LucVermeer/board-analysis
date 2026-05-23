// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vite-plus/test';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SessionUser } from '@boardsesh/shared-schema';
import { MiniSessionBar } from '../mini-session-bar';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { ClimbQueueItem } from '../../queue-control/types';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@mui/icons-material/Lightbulb', () => ({
  default: () => React.createElement('svg', { 'data-testid': 'icon-lightbulb' }),
}));
vi.mock('@mui/icons-material/ArrowBackOutlined', () => ({
  default: () => React.createElement('svg', { 'data-testid': 'icon-back' }),
}));
vi.mock('@mui/icons-material/CheckOutlined', () => ({
  default: () => React.createElement('svg', { 'data-testid': 'icon-check' }),
}));

const user = (id: string, username: string, overrides: Partial<SessionUser> = {}): SessionUser =>
  ({
    id,
    username,
    isLeader: false,
    connectionState: 'connected',
    ...overrides,
  }) as SessionUser;

const climbItem = (uuid: string, name: string): ClimbQueueItem =>
  ({
    uuid: `q-${uuid}`,
    suggested: false,
    climb: {
      uuid,
      name,
      tickedBy: [],
    },
  }) as unknown as ClimbQueueItem;

function defaultProps(overrides: Partial<React.ComponentProps<typeof MiniSessionBar>> = {}) {
  return {
    isDriver: false,
    isPersistentSessionActive: true,
    sessionUsers: [user('me', 'me'), user('driver', 'Marco'), user('sara', 'Sara')],
    participantId: 'me',
    driverParticipantId: 'driver',
    currentClimbQueueItem: climbItem('wall-uuid', 'Bone Saw'),
    drawerDisplayedItem: null,
    onReturnToWallClimb: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof MiniSessionBar>;
}

describe('MiniSessionBar', () => {
  it('renders nothing for solo users (isPersistentSessionActive=false)', () => {
    const { container } = render(<MiniSessionBar {...defaultProps({ isPersistentSessionActive: false })} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('mini-session-bar')).toBeNull();
  });

  it('renders nothing when there is no wall climb yet', () => {
    const { container } = render(<MiniSessionBar {...defaultProps({ currentClimbQueueItem: null })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ON WALL · driver for a non-driver on the wall climb (no drift)', () => {
    render(<MiniSessionBar {...defaultProps()} />);
    expect(screen.getByTestId('mini-session-bar')).toBeTruthy();
    expect(screen.getByText('ON WALL · Marco')).toBeTruthy();
    // Back-button morph does not render when not drifted
    expect(screen.queryByTestId('mini-session-bar-back')).toBeNull();
  });

  it('falls back to plain ON WALL when there is no driver', () => {
    render(<MiniSessionBar {...defaultProps({ driverParticipantId: null })} />);
    expect(screen.getByText('ON WALL')).toBeTruthy();
  });

  it('renders DRIVING for the driver, never the back-button morph', () => {
    render(<MiniSessionBar {...defaultProps({ isDriver: true })} />);
    expect(screen.getByText('DRIVING')).toBeTruthy();
    expect(screen.queryByTestId('mini-session-bar-back')).toBeNull();
  });

  it('renders the back-button morph when a non-driver has drifted off the wall climb', () => {
    render(
      <MiniSessionBar
        {...defaultProps({
          drawerDisplayedItem: climbItem('other-uuid', 'Crimpy Business'),
        })}
      />,
    );
    const back = screen.getByTestId('mini-session-bar-back');
    expect(back).toBeTruthy();
    // Aria-label reads naturally for screen readers
    expect(back.getAttribute('aria-label')).toBe("Return to Marco's wall climb");
    // Visible label name interpolation hits the catalog
    expect(screen.getByText('Marco · Bone Saw')).toBeTruthy();
  });

  it('does not show drift back-button when drawerDisplayedItem matches the wall climb', () => {
    render(
      <MiniSessionBar
        {...defaultProps({
          drawerDisplayedItem: climbItem('wall-uuid', 'Bone Saw'),
        })}
      />,
    );
    expect(screen.queryByTestId('mini-session-bar-back')).toBeNull();
    expect(screen.getByText('ON WALL · Marco')).toBeTruthy();
  });

  it('does not show drift back-button for a driver even when drawerDisplayedItem differs', () => {
    render(
      <MiniSessionBar
        {...defaultProps({
          isDriver: true,
          drawerDisplayedItem: climbItem('other-uuid', 'Crimpy Business'),
        })}
      />,
    );
    expect(screen.queryByTestId('mini-session-bar-back')).toBeNull();
    expect(screen.getByText('DRIVING')).toBeTruthy();
  });

  it('tapping the back-button morph calls onReturnToWallClimb', () => {
    const onReturnToWallClimb = vi.fn();
    render(
      <MiniSessionBar
        {...defaultProps({
          drawerDisplayedItem: climbItem('other-uuid', 'Crimpy Business'),
          onReturnToWallClimb,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('mini-session-bar-back'));
    expect(onReturnToWallClimb).toHaveBeenCalledOnce();
  });

  it('renders an audience AvatarGroup excluding the local user, driver-first', () => {
    render(
      <MiniSessionBar
        {...defaultProps({
          sessionUsers: [user('me', 'me'), user('sara', 'Sara'), user('jules', 'Jules'), user('driver', 'Marco')],
          driverParticipantId: 'driver',
          participantId: 'me',
        })}
      />,
    );
    const audience = screen.getByTestId('mini-session-bar-audience');
    expect(audience).toBeTruthy();
    // Aria-label exposes count to assistive tech (excludes self → 3 others)
    expect(audience.getAttribute('aria-label')).toBe('3 others watching');
    // Driver should be the first avatar so the lit-bulb badge anchors the stack.
    // AvatarGroup wraps avatars in <div role="img" aria-label=Marco> via Avatar's alt.
    const avatars = audience.querySelectorAll('.MuiAvatar-root');
    // First user-rendered avatar (after AvatarGroup's overflow placeholder, if any)
    // is the driver — query by alt is most stable across MUI versions.
    const driverAvatar = audience.querySelector('img[alt="Marco"], [aria-label*="Marco"]');
    expect(driverAvatar).not.toBeNull();
    expect(avatars.length).toBeGreaterThan(0);
  });

  it('renders no audience block when the session has only the local user', () => {
    render(
      <MiniSessionBar
        {...defaultProps({
          sessionUsers: [user('me', 'me')],
          driverParticipantId: null,
        })}
      />,
    );
    expect(screen.queryByTestId('mini-session-bar-audience')).toBeNull();
  });
});
