import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { Gym } from '@boardsesh/shared-schema';
import CommentsTab from '../comments-tab';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// The tab reuses the public gym page's CommentSection wholesale. Stub it so the
// test proves the wiring (entity + heading) without dragging in its GraphQL-WS
// subscription; the real thing — including the live count and empty state — is
// covered by the social comment tests.
vi.mock('@/app/components/social/comment-section', () => ({
  default: ({ entityType, entityId, title }: { entityType: string; entityId: string; title?: string }) => (
    <div data-testid="comment-section" data-entity-type={entityType} data-entity-id={entityId}>
      {title}
    </div>
  ),
}));

function makeGym(overrides: Partial<Gym> = {}): Gym {
  return {
    uuid: 'gym-uuid-1',
    slug: 'test-gym',
    ownerId: 'user-owner',
    name: 'Test Gym',
    boardCount: 3,
    memberCount: 4,
    followerCount: 7,
    commentCount: 0,
    isPublic: true,
    ...overrides,
  } as unknown as Gym;
}

describe('CommentsTab', () => {
  it('mounts the shared CommentSection against the gym entity by uuid', () => {
    render(<CommentsTab gym={makeGym({ uuid: 'gym-abc' })} />);

    const section = screen.getByTestId('comment-section');
    expect(section.getAttribute('data-entity-type')).toBe('gym');
    expect(section.getAttribute('data-entity-id')).toBe('gym-abc');
  });

  it('gives the thread a stable climber-voice heading, not a snapshot count', () => {
    // The header must not be derived from the load-time commentCount — the live
    // count and empty state are CommentSection's job — so it reads the same
    // whether the gym loaded with no comments or a full thread. This is the
    // regression guard against a stale header after an in-tab post.
    const { rerender } = render(<CommentsTab gym={makeGym({ commentCount: 0 })} />);
    expect(screen.getByTestId('comment-section').textContent).toContain("What your crew's saying");

    rerender(<CommentsTab gym={makeGym({ commentCount: 5 })} />);
    expect(screen.getByTestId('comment-section').textContent).toContain("What your crew's saying");
  });

  it('explains that replies happen without leaving the console', () => {
    render(<CommentsTab gym={makeGym()} />);

    // queryByText returns null rather than throwing, so this is a real assertion.
    expect(screen.queryByText(/without leaving the console/i)).not.toBeNull();
  });
});
