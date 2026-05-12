// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LogbookEntryCard } from '../logbook-entry-card';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/app/components/ascent-status/ascent-status-icon', () => ({
  AscentStatusIcon: ({ status }: { status: string }) => <div data-testid="ascent-status-icon" data-status={status} />,
}));

vi.mock('@mui/material/Rating', () => ({
  default: ({ value }: { value: number }) => <div data-testid="rating">{value}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/components/social/vote-button', () => ({
  default: ({
    entityType,
    entityId,
    initialUpvotes,
  }: {
    entityType: string;
    entityId: string;
    initialUpvotes?: number;
  }) => (
    <div
      data-testid="vote-button"
      data-entity-type={entityType}
      data-entity-id={entityId}
      data-initial-upvotes={initialUpvotes ?? 0}
    />
  ),
}));

vi.mock('@/app/components/social/feed-comment-button', () => ({
  default: ({
    entityType,
    entityId,
    commentCount,
  }: {
    entityType: string;
    entityId: string;
    commentCount?: number;
  }) => (
    <div
      data-testid="feed-comment-button"
      data-entity-type={entityType}
      data-entity-id={entityId}
      data-comment-count={commentCount ?? 0}
    />
  ),
}));

const baseEntry = {
  climbedAt: '2025-01-02T12:00:00Z',
  angle: 40,
  isMirror: false,
  status: 'send' as const,
  attemptCount: 3,
  quality: 4,
  comment: 'Nice moves',
};

describe('LogbookEntryCard', () => {
  it('renders entry fields without a user header when user is absent', () => {
    render(<LogbookEntryCard entry={baseEntry} showMirrorTag={false} />);

    expect(screen.getByText('Attempts: 3')).toBeTruthy();
    expect(screen.getByText('Nice moves')).toBeTruthy();
    expect(screen.getByTestId('rating').textContent).toBe('4');
    // No user link / avatar without a user prop
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders a profile link and display name when user is provided', () => {
    render(
      <LogbookEntryCard
        entry={baseEntry}
        showMirrorTag={false}
        user={{ userId: 'user-42', displayName: 'Alex', avatarUrl: 'https://example.test/a.png' }}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/profile/user-42');
    }
    expect(screen.getByText('Alex')).toBeTruthy();
  });

  it('falls back to "Climber" when the user has no display name', () => {
    render(
      <LogbookEntryCard
        entry={baseEntry}
        showMirrorTag={false}
        user={{ userId: 'user-42', displayName: null, avatarUrl: null }}
      />,
    );

    expect(screen.getByText('Climber')).toBeTruthy();
  });

  it('always shows the angle chip and status icon', () => {
    render(<LogbookEntryCard entry={baseEntry} showMirrorTag={false} />);
    const icon = screen.getByTestId('ascent-status-icon');
    expect(icon.getAttribute('data-status')).toBe('send');
    expect(screen.getByText('40°')).toBeTruthy();
  });

  it('renders the entry angle even when it differs from typical board angles', () => {
    render(<LogbookEntryCard entry={{ ...baseEntry, angle: 50 }} showMirrorTag={false} />);
    const icon = screen.getByTestId('ascent-status-icon');
    expect(icon.getAttribute('data-status')).toBe('send');
    expect(screen.getByText('50°')).toBeTruthy();
  });

  it('shows the Mirrored chip only when showMirrorTag is true and the entry is mirrored', () => {
    const { rerender } = render(<LogbookEntryCard entry={{ ...baseEntry, isMirror: true }} showMirrorTag={false} />);
    expect(screen.queryByText('Mirrored')).toBeNull();

    rerender(<LogbookEntryCard entry={{ ...baseEntry, isMirror: true }} showMirrorTag={true} />);
    expect(screen.getByText('Mirrored')).toBeTruthy();
  });

  it('hides the rating when the entry is an attempt', () => {
    render(<LogbookEntryCard entry={{ ...baseEntry, status: 'attempt', quality: null }} showMirrorTag={false} />);
    expect(screen.queryByTestId('rating')).toBeNull();
  });

  it('falls back to attempt when status is an unknown string', () => {
    render(
      <LogbookEntryCard
        entry={{
          ...baseEntry,
          status: 'weird-string',
          quality: null,
          angle: 50,
        }}
        showMirrorTag={false}
      />,
    );
    const icon = screen.getByTestId('ascent-status-icon');
    expect(icon.getAttribute('data-status')).toBe('attempt');
    expect(screen.queryByTestId('rating')).toBeNull();
  });

  it('does not render the social footer when tickUuid is absent', () => {
    render(<LogbookEntryCard entry={baseEntry} showMirrorTag={false} />);
    expect(screen.queryByTestId('vote-button')).toBeNull();
    expect(screen.queryByTestId('feed-comment-button')).toBeNull();
  });

  it('renders a like + comment footer wired to the tick when tickUuid is set', () => {
    render(
      <LogbookEntryCard
        entry={{
          ...baseEntry,
          tickUuid: 'tick-99',
          upvotes: 7,
          downvotes: 1,
          commentCount: 3,
        }}
        showMirrorTag={false}
      />,
    );

    const vote = screen.getByTestId('vote-button');
    expect(vote.getAttribute('data-entity-type')).toBe('tick');
    expect(vote.getAttribute('data-entity-id')).toBe('tick-99');
    expect(vote.getAttribute('data-initial-upvotes')).toBe('7');

    const comments = screen.getByTestId('feed-comment-button');
    expect(comments.getAttribute('data-entity-type')).toBe('tick');
    expect(comments.getAttribute('data-entity-id')).toBe('tick-99');
    expect(comments.getAttribute('data-comment-count')).toBe('3');
  });
});
