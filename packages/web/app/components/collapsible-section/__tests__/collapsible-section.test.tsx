// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CollapsibleSection, { type CollapsibleSectionConfig } from '../collapsible-section';

const originalScrollIntoView = Element.prototype.scrollIntoView;
let scrollIntoViewMock: ReturnType<typeof vi.fn>;

function makeSections(): CollapsibleSectionConfig[] {
  return [
    {
      key: 'invite',
      label: 'Invite',
      title: 'Invite others',
      defaultSummary: 'Share link',
      content: <div data-testid="invite-body">Invite content</div>,
    },
    {
      key: 'activity',
      label: 'Activity',
      title: 'Recent activity',
      defaultSummary: 'No climbs yet',
      content: <div data-testid="activity-body">Activity content</div>,
    },
    {
      key: 'analytics',
      label: 'Analytics',
      title: 'Grade breakdown',
      defaultSummary: 'Grades climbed',
      content: <div data-testid="analytics-body">Analytics content</div>,
    },
  ];
}

function makeRect(top: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 0,
    bottom: top,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('CollapsibleSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  describe('uncontrolled mode (no forcedActiveKey)', () => {
    it('starts with no section active when there is no defaultActive', () => {
      render(<CollapsibleSection sections={makeSections()} />);
      expect(screen.getByText('Invite')).toBeDefined();
      expect(screen.getByText('Activity')).toBeDefined();
      // When inactive the label shows; when active the title does.
      expect(screen.queryByText('Invite others')).toBeNull();
    });

    it('clicking a section label opens it', () => {
      render(<CollapsibleSection sections={makeSections()} />);
      fireEvent.click(screen.getByText('Invite'));
      expect(screen.getByText('Invite others')).toBeDefined();
    });

    it('scrolls a user-opened section to the top of the nearest scroll container', () => {
      render(
        <div data-testid="scroll-parent" style={{ overflowY: 'auto' }}>
          <CollapsibleSection sections={makeSections()} />
        </div>,
      );

      const scrollParent = screen.getByTestId('scroll-parent') as HTMLElement;
      const scrollToMock = vi.fn();
      Object.defineProperty(scrollParent, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(scrollParent, 'clientHeight', { configurable: true, value: 200 });
      Object.defineProperty(scrollParent, 'scrollTop', { configurable: true, value: 20 });
      Object.defineProperty(scrollParent, 'scrollTo', { configurable: true, value: scrollToMock });
      scrollParent.getBoundingClientRect = vi.fn(() => makeRect(10));

      const activityCard = screen.getByText('Activity').closest('[class*="sectionCard"]') as HTMLElement;
      activityCard.getBoundingClientRect = vi.fn(() => makeRect(210));

      fireEvent.click(screen.getByText('Activity'));

      expect(screen.getByText('Recent activity')).toBeDefined();
      expect(scrollToMock).toHaveBeenCalledTimes(1);
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 220,
        behavior: 'smooth',
      });
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(275);
      expect(scrollToMock).toHaveBeenCalledTimes(2);
    });

    it('clicking the title of an active section collapses it', () => {
      render(<CollapsibleSection sections={makeSections()} />);
      fireEvent.click(screen.getByText('Invite')); // open
      expect(screen.getByText('Invite others')).toBeDefined();
      fireEvent.click(screen.getByText('Invite others')); // close
      expect(screen.queryByText('Invite others')).toBeNull();
    });

    it('honours defaultActive on initial render', () => {
      const sections = makeSections();
      sections[1].defaultActive = true;
      render(<CollapsibleSection sections={sections} />);
      expect(screen.getByText('Recent activity')).toBeDefined();
    });

    it('honours defaultActive when sections arrive on a later render', () => {
      // Simulates the play-drawer deferred-mount path: parent first renders
      // with no sections, then the climb-detail hook returns the real list
      // a tick later.
      const { rerender } = render(<CollapsibleSection sections={[]} />);
      expect(screen.queryByText('Recent activity')).toBeNull();

      const sections = makeSections();
      sections[1].defaultActive = true;
      rerender(<CollapsibleSection sections={sections} />);
      expect(screen.getByText('Recent activity')).toBeDefined();
    });
  });

  describe('controlled mode (forcedActiveKey)', () => {
    it('renders the forced section active', () => {
      render(<CollapsibleSection sections={makeSections()} forcedActiveKey="analytics" />);
      expect(screen.getByText('Grade breakdown')).toBeDefined();
      expect(screen.queryByText('Invite others')).toBeNull();
    });

    it('swaps the active section when forcedActiveKey changes', () => {
      const { rerender } = render(<CollapsibleSection sections={makeSections()} forcedActiveKey="invite" />);
      expect(screen.getByText('Invite others')).toBeDefined();

      rerender(<CollapsibleSection sections={makeSections()} forcedActiveKey="activity" />);
      expect(screen.getByText('Recent activity')).toBeDefined();
      expect(screen.queryByText('Invite others')).toBeNull();

      rerender(<CollapsibleSection sections={makeSections()} forcedActiveKey="analytics" />);
      expect(screen.getByText('Grade breakdown')).toBeDefined();
    });

    it('disables user-driven collapse/expand while forced', () => {
      render(<CollapsibleSection sections={makeSections()} forcedActiveKey="invite" />);

      // Click an inactive section label — nothing should change.
      fireEvent.click(screen.getByText('Activity'));
      expect(screen.getByText('Invite others')).toBeDefined();
      expect(screen.queryByText('Recent activity')).toBeNull();

      // Click the active title — nothing should collapse.
      fireEvent.click(screen.getByText('Invite others'));
      expect(screen.getByText('Invite others')).toBeDefined();
    });

    it('explicit null collapses all sections', () => {
      const sections = makeSections();
      sections[0].defaultActive = true;
      const { rerender } = render(<CollapsibleSection sections={sections} />);
      expect(screen.getByText('Invite others')).toBeDefined();

      rerender(<CollapsibleSection sections={sections} forcedActiveKey={null} />);
      expect(screen.queryByText('Invite others')).toBeNull();
    });

    it('transitioning back to uncontrolled mode restores the initial default', () => {
      const sections = makeSections();
      sections[0].defaultActive = true; // initial default = 'invite'

      // Start uncontrolled with the default active.
      const { rerender } = render(<CollapsibleSection sections={sections} />);
      expect(screen.getByText('Invite others')).toBeDefined();

      // Controlled: force 'analytics'.
      rerender(<CollapsibleSection sections={sections} forcedActiveKey="analytics" />);
      expect(screen.getByText('Grade breakdown')).toBeDefined();

      // Drop back to uncontrolled. The forced value must not leak — the
      // component resets to the original default ('invite').
      rerender(<CollapsibleSection sections={sections} />);
      expect(screen.getByText('Invite others')).toBeDefined();
      expect(screen.queryByText('Grade breakdown')).toBeNull();
    });

    it('transitioning back to uncontrolled with no default collapses to null', () => {
      const sections = makeSections(); // no defaultActive
      const { rerender } = render(<CollapsibleSection sections={sections} forcedActiveKey="invite" />);
      expect(screen.getByText('Invite others')).toBeDefined();

      rerender(<CollapsibleSection sections={sections} />);
      expect(screen.queryByText('Invite others')).toBeNull();
      expect(screen.queryByText('Recent activity')).toBeNull();
      expect(screen.queryByText('Grade breakdown')).toBeNull();
    });
  });

  describe('action slot', () => {
    function sectionsWithAction(defaultActive: boolean): CollapsibleSectionConfig[] {
      const base = makeSections();
      base[0] = {
        ...base[0],
        defaultActive,
        action: <button data-testid="invite-action">+</button>,
      };
      return base;
    }

    it('does not render the action while the section is collapsed', () => {
      render(<CollapsibleSection sections={sectionsWithAction(false)} />);
      expect(screen.queryByTestId('invite-action')).toBeNull();
    });

    it('renders the action when the section is expanded', () => {
      render(<CollapsibleSection sections={sectionsWithAction(true)} />);
      expect(screen.getByTestId('invite-action')).toBeDefined();
    });

    it('reveals the action after the user expands a collapsed section', () => {
      render(<CollapsibleSection sections={sectionsWithAction(false)} />);
      expect(screen.queryByTestId('invite-action')).toBeNull();

      fireEvent.click(screen.getByText('Invite'));
      expect(screen.getByTestId('invite-action')).toBeDefined();
    });

    it('clicking the action does not collapse the section', () => {
      render(<CollapsibleSection sections={sectionsWithAction(true)} />);
      expect(screen.getByText('Invite others')).toBeDefined();

      fireEvent.click(screen.getByTestId('invite-action'));

      // Section is still expanded (title visible).
      expect(screen.getByText('Invite others')).toBeDefined();
    });

    it('hides the summary when an action is provided and the section is expanded', () => {
      render(<CollapsibleSection sections={sectionsWithAction(true)} />);
      expect(screen.queryByText('Share link')).toBeNull();
    });
  });
});
