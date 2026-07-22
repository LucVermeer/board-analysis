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
// test proves the wiring (entity + title) without dragging in its GraphQL-WS
// subscription; the real thing is covered by the social comment tests.
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
    render(<CommentsTab gym={makeGym({ uuid: 'gym-abc', commentCount: 5 })} />);

    const section = screen.getByTestId('comment-section');
    expect(section.getAttribute('data-entity-type')).toBe('gym');
    expect(section.getAttribute('data-entity-id')).toBe('gym-abc');
  });

  it('heads the thread with a climber-voice title when the crew has been talking', () => {
    render(<CommentsTab gym={makeGym({ commentCount: 5 })} />);
    // The header stays count-free — the live tally is CommentSection's job, so a
    // load-time snapshot can never show a stale number here.
    expect(screen.getByText("What your crew's saying")).toBeTruthy();
    expect(screen.queryByText("No one's chimed in yet.")).toBeNull();
  });

  it('shows the climber-voice empty state when the thread is empty', () => {
    render(<CommentsTab gym={makeGym({ commentCount: 0 })} />);
    expect(screen.getByText("No one's chimed in yet.")).toBeTruthy();
    expect(screen.queryByText("What your crew's saying")).toBeNull();
  });

  it('treats a missing commentCount as an empty thread', () => {
    render(<CommentsTab gym={makeGym({ commentCount: undefined as unknown as number })} />);
    expect(screen.getByText("No one's chimed in yet.")).toBeTruthy();
  });

  it('explains that replies happen without leaving the console', () => {
    render(<CommentsTab gym={makeGym()} />);
    expect(screen.getByText(/without leaving the console/i)).toBeTruthy();
  });

  it('re-heads the thread when the comment count crosses zero', () => {
    const { rerender } = render(<CommentsTab gym={makeGym({ commentCount: 0 })} />);
    expect(screen.getByText("No one's chimed in yet.")).toBeTruthy();

    rerender(<CommentsTab gym={makeGym({ commentCount: 1 })} />);
    expect(screen.getByText("What your crew's saying")).toBeTruthy();
    expect(screen.queryByText("No one's chimed in yet.")).toBeNull();
  });
});
