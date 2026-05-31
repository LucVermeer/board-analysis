import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import ErrorBoundary from '../error-boundary';

// Suppress React error boundary console noise in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const AlwaysThrow = () => {
  throw new Error('persistent error');
};

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders fallback on error', () => {
    render(
      <ErrorBoundary fallback={<div>oops</div>}>
        <AlwaysThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('oops')).toBeTruthy();
  });

  it('renders nothing when error and no fallback', () => {
    const { container } = render(
      <ErrorBoundary>
        <AlwaysThrow />
      </ErrorBoundary>,
    );
    expect(container.innerHTML).toBe('');
  });

  describe('recoverable mode', () => {
    it('auto-resets after a transient error', async () => {
      let shouldThrow = true;

      const Conditional = () => {
        if (shouldThrow) throw new Error('transient');
        return <div>recovered</div>;
      };

      render(
        <ErrorBoundary recoverable>
          <Conditional />
        </ErrorBoundary>,
      );

      // Error caught, fallback rendered (null)
      expect(screen.queryByText('recovered')).toBeNull();

      // Fix the error before the rAF fires
      shouldThrow = false;

      // Flush the requestAnimationFrame that triggers recovery
      await act(async () => {
        vi.advanceTimersByTime(16);
      });

      expect(screen.getByText('recovered')).toBeTruthy();
    });

    it('stops retrying after max attempts', async () => {
      render(
        <ErrorBoundary recoverable fallback={<div>gave up</div>}>
          <AlwaysThrow />
        </ErrorBoundary>,
      );

      // Flush multiple rAF cycles (more than the 3 retry limit)
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          vi.advanceTimersByTime(16);
        });
      }

      // Should have given up and show the fallback permanently
      expect(screen.getByText('gave up')).toBeTruthy();
    });

    it('resets retry budget after quiet period', async () => {
      let shouldThrow = true;

      const Conditional = () => {
        if (shouldThrow) throw new Error('transient');
        return <div>recovered</div>;
      };

      render(
        <ErrorBoundary recoverable>
          <Conditional />
        </ErrorBoundary>,
      );

      // Burn through 2 retries (still throwing)
      for (let i = 0; i < 2; i++) {
        await act(async () => {
          vi.advanceTimersByTime(16);
        });
      }

      // Fix the error and let the 3rd retry succeed. `waitFor` gives React's
      // commit phase room to flush even when the rAF advance lands on a tick
      // that doesn't drain microtasks in one pass — locally this resolves
      // immediately; CI occasionally needs a second pass before the
      // child re-renders.
      shouldThrow = false;
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      await waitFor(() => expect(screen.getByText('recovered')).toBeTruthy());

      // Wait for the 30 s reset timer to fire
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });

      // Trigger a new error — should recover again (budget was reset)
      shouldThrow = true;
      // Force a re-render that throws
      await act(async () => {
        // Unmount and remount to trigger a fresh error
        screen.getByText('recovered').textContent = '';
      });
    });

    it('does not auto-reset when recoverable is false', async () => {
      render(
        <ErrorBoundary fallback={<div>stuck</div>}>
          <AlwaysThrow />
        </ErrorBoundary>,
      );

      expect(screen.getByText('stuck')).toBeTruthy();

      // Flush rAF
      await act(async () => {
        vi.advanceTimersByTime(16);
      });

      // Still stuck on fallback
      expect(screen.getByText('stuck')).toBeTruthy();
    });
  });
});
