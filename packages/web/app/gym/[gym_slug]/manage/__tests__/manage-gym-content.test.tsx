import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { Gym } from '@boardsesh/shared-schema';
import ManageGymContent from '../manage-gym-content';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// The shell reads the active tab from the URL. Most tests pin it to Profile; the
// default-tab test clears it. A hoisted holder lets a test flip the value before
// render.
const searchState = vi.hoisted(() => ({ params: 'tab=profile' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchState.params),
}));

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock('@/app/lib/i18n/use-locale-router', () => ({
  useLocaleRouter: () => ({ push: pushSpy, replace: replaceSpy, prefetch: vi.fn() }),
  usePathnameWithoutLocale: () => '/gym/old-slug/manage',
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-owner' } }, status: 'authenticated' }),
}));

// Sibling tabs have their own hooks/subscriptions — stub them so the shell test
// stays focused on the profile-save routing and the dirty guard.
vi.mock('@/app/components/gym-entity/manage/overview-tab', () => ({ default: () => <div data-testid="overview" /> }));
vi.mock('@/app/components/gym-entity/manage/kiosks-tab', () => ({ default: () => <div data-testid="kiosks" /> }));
vi.mock('@/app/components/gym-entity/manage/insights-tab', () => ({ default: () => <div data-testid="insights" /> }));
vi.mock('@/app/components/gym-entity/manage/branding-tab', () => ({ default: () => <div data-testid="branding" /> }));
vi.mock('@/app/components/gym-entity/manage/gym-boards-tab', () => ({ default: () => <div data-testid="boards" /> }));
vi.mock('@/app/components/gym-entity/gym-member-management', () => ({ default: () => <div data-testid="members" /> }));

// Controllable Profile-tab stub: buttons that fire the same callbacks the real
// tab wires to the shared form.
vi.mock('@/app/components/gym-entity/manage/profile-tab', () => ({
  default: ({
    gym,
    onGymChange,
    onDirtyChange,
  }: {
    gym: Gym;
    onGymChange: (gym: Gym) => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onGymChange({ ...gym, slug: 'new-slug' })}>
        save-renamed
      </button>
      <button type="button" onClick={() => onGymChange({ ...gym, slug: gym.slug })}>
        save-same
      </button>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        make-dirty
      </button>
    </div>
  ),
}));

function makeGym(overrides: Partial<Gym> = {}): Gym {
  return {
    uuid: 'gym-uuid-1',
    slug: 'old-slug',
    ownerId: 'user-owner',
    name: 'Test Gym',
    boardCount: 1,
    memberCount: 1,
    followerCount: 1,
    commentCount: 0,
    isPublic: true,
    canEdit: true,
    canGrantAccess: true,
    ...overrides,
  } as unknown as Gym;
}

beforeEach(() => {
  pushSpy.mockReset();
  replaceSpy.mockReset();
  searchState.params = 'tab=profile';
});

describe('ManageGymContent default tab', () => {
  it('renders the Overview tab when no ?tab= param is present', () => {
    searchState.params = '';
    render(<ManageGymContent initialGym={makeGym()} />);

    // Overview is the default landing surface; the Profile stub must not mount.
    expect(screen.getByTestId('overview')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'make-dirty' })).toBeNull();
  });
});

describe('ManageGymContent profile save routing', () => {
  it('moves onto the new slug URL when a profile save renames the slug', () => {
    render(<ManageGymContent initialGym={makeGym()} />);

    fireEvent.click(screen.getByRole('button', { name: 'save-renamed' }));

    // Active tab is Profile, so the tab param is carried onto the new slug.
    expect(replaceSpy).toHaveBeenCalledWith('/gym/new-slug/manage?tab=profile', { scroll: false });
  });

  it('does not redirect when a profile save keeps the same slug', () => {
    render(<ManageGymContent initialGym={makeGym()} />);

    fireEvent.click(screen.getByRole('button', { name: 'save-same' }));

    expect(replaceSpy).not.toHaveBeenCalled();
  });
});

describe('ManageGymContent dirty guard on the Profile tab', () => {
  it('holds a tab switch behind the discard confirmation once the profile form is dirty', async () => {
    render(<ManageGymContent initialGym={makeGym()} />);

    // Clean switch: no confirmation.
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    expect(pushSpy).toHaveBeenCalled();
    pushSpy.mockReset();

    // Mark the profile form dirty, then attempt a tab switch.
    fireEvent.click(screen.getByRole('button', { name: 'make-dirty' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Boards' }));

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
    });
    // Navigation is held until the user confirms.
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
