import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { UserProfile } from '@/app/profile/[user_id]/utils/profile-constants';

vi.mock('@/app/lib/i18n/server', () => ({
  getServerTranslation: async (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    locale: 'en-US',
  }),
}));

vi.mock('@/app/components/social/follower-count', () => ({
  default: (props: { userId: string; followerCount: number; followingCount: number }) => (
    <div data-testid="follower-count" data-user-id={props.userId}>
      {props.followerCount} followers, {props.followingCount} following
    </div>
  ),
}));

import YouProfileHeader from '../you-profile-header.server';

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-123',
    email: 'test@boardsesh.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg',
    profile: {
      displayName: 'Display Name',
      avatarUrl: 'https://example.com/profile-avatar.jpg',
      instagramUrl: null,
    },
    followerCount: 10,
    followingCount: 5,
    isFollowedByMe: false,
    ...overrides,
  };
}

async function renderHeader(profile: UserProfile) {
  const element = await YouProfileHeader({ profile });
  return render(element);
}

describe('YouProfileHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders display name from profile.profile.displayName', async () => {
    await renderHeader(createProfile());
    expect(screen.getByText('Display Name')).toBeTruthy();
  });

  it('falls back to profile.name when displayName is null', async () => {
    await renderHeader(
      createProfile({
        profile: { displayName: null, avatarUrl: null, instagramUrl: null },
      }),
    );
    expect(screen.getByText('Test User')).toBeTruthy();
  });

  it("falls back to 'Climber' when both displayName and name are null", async () => {
    await renderHeader(
      createProfile({
        name: null,
        profile: { displayName: null, avatarUrl: null, instagramUrl: null },
      }),
    );
    expect(screen.getByText('Climber')).toBeTruthy();
  });

  it('renders avatar with profile.profile.avatarUrl when set', async () => {
    await renderHeader(createProfile());
    const avatar = screen.getByRole('img');
    expect(avatar.getAttribute('src')).toBe('https://example.com/profile-avatar.jpg');
  });

  it('falls back to profile.image when profile.avatarUrl is null', async () => {
    await renderHeader(
      createProfile({
        profile: { displayName: 'X', avatarUrl: null, instagramUrl: null },
      }),
    );
    const avatar = screen.getByRole('img');
    expect(avatar.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('renders FollowerCount with profile id and counts', async () => {
    await renderHeader(createProfile({ followerCount: 42, followingCount: 17 }));
    const followerCount = screen.getByTestId('follower-count');
    expect(followerCount.getAttribute('data-user-id')).toBe('user-123');
    expect(followerCount.textContent).toContain('42 followers');
    expect(followerCount.textContent).toContain('17 following');
  });

  it('renders display name as h1 (page-level heading)', async () => {
    await renderHeader(createProfile());
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Display Name');
  });
});
