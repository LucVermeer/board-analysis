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

  it('labels the thread with the live comment count when the crew has been talking', () => {
    render(<CommentsTab gym={makeGym({ commentCount: 5 })} />);
    // The count doubles as the section header — plural form for >1.
    expect(screen.getByText('5 comments')).toBeTruthy();
  });

  it('uses the singular count label for a single comment', () => {
    render(<CommentsTab gym={makeGym({ commentCount: 1 })} />);
    expect(screen.getByText('1 comment')).toBeTruthy();
  });

  it('shows the climber-voice empty state when the thread is empty', () => {
    render(<CommentsTab gym={makeGym({ commentCount: 0 })} />);
    expect(screen.getByText("No one's chimed in yet.")).toBeTruthy();
    // No count label when there's nothing to count.
    expect(screen.queryByText(/\d+ comments?/)).toBeNull();
  });

  it('explains that this is the same thread as the public gym page', () => {
    render(<CommentsTab gym={makeGym()} />);
    expect(screen.getByText(/reply, right from here/i)).toBeTruthy();
  });
});
