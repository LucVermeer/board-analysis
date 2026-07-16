// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import BoardIdentity from '../board-identity';

// The reserved empty third line renders a non-breaking space placeholder.
const NBSP = '\u00A0';

// Keys through as text so we can assert on the rendered line content.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: 'en-US' },
  }),
}));

function makeClimb(overrides: Partial<BoardPresenceClimb> = {}): BoardPresenceClimb {
  return {
    climbUuid: 'climb-1',
    name: 'The Crimp Line',
    grade: '7a',
    sentAt: '2026-07-16T10:00:00.000Z',
    seq: 1,
    ...overrides,
  };
}

/** Direct <span> children of the identity strip — one per identity line. */
function identityLines(container: HTMLElement): HTMLElement[] {
  const identity = container.firstElementChild;
  if (identity === null) throw new Error('identity strip did not render');
  return Array.from(identity.children).filter((el): el is HTMLElement => el.tagName === 'SPAN');
}

describe('BoardIdentity — reserved third line keeps cards symmetric', () => {
  it('renders exactly three lines for an active climb with a setter/lit-by line', () => {
    const { container } = render(
      <BoardIdentity
        boardName="Main Kilter"
        boardAngle={40}
        climb={makeClimb({ setter: 'Jane Setter', sentByDisplayName: 'Marco' })}
        lastLitClimb={null}
      />,
    );

    const lines = identityLines(container);
    expect(lines).toHaveLength(3);
    const secondary = lines[2];
    expect(secondary.getAttribute('aria-hidden')).toBeNull();
    expect(secondary.textContent).toContain('Jane Setter');
  });

  it('still renders three lines for an active climb with no secondary content', () => {
    const { container } = render(
      <BoardIdentity boardName="Main Kilter" boardAngle={40} climb={makeClimb()} lastLitClimb={null} />,
    );

    const lines = identityLines(container);
    expect(lines).toHaveLength(3);
    // Empty third line is a non-breaking-space placeholder, hidden from a11y.
    const secondary = lines[2];
    expect(secondary.getAttribute('aria-hidden')).toBe('true');
    expect(secondary.textContent).toBe(NBSP);
  });

  it('renders three lines for an idle wall with a last-lit climb', () => {
    const { container } = render(
      <BoardIdentity
        boardName="Main Kilter"
        boardAngle={40}
        climb={null}
        lastLitClimb={makeClimb({ name: 'Last Send', grade: '6c' })}
      />,
    );

    const lines = identityLines(container);
    expect(lines).toHaveLength(3);
    const secondary = lines[2];
    expect(secondary.getAttribute('aria-hidden')).toBeNull();
    expect(secondary.textContent).toContain('board.lastLit');
  });

  it('still renders three lines for an idle wall that has never been lit', () => {
    const { container } = render(
      <BoardIdentity boardName="Main Kilter" boardAngle={40} climb={null} lastLitClimb={null} />,
    );

    const lines = identityLines(container);
    expect(lines).toHaveLength(3);
    const secondary = lines[2];
    expect(secondary.getAttribute('aria-hidden')).toBe('true');
    expect(secondary.textContent).toBe(NBSP);
  });
});
