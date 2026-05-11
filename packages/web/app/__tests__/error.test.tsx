import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import PageError, { __resetSessionAutoResetCountForTesting } from '../error';

function makeNotFoundError(message: string): Error {
  const error = new Error(message);
  error.name = 'NotFoundError';
  return error;
}

afterEach(() => {
  cleanup();
  captureException.mockClear();
  vi.useRealTimers();
  __resetSessionAutoResetCountForTesting();
});

describe('PageError visible fallback', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders English retry copy on root path', () => {
    const { container } = render(<PageError error={new Error('boom')} reset={() => {}} />);
    expect(container.textContent).toContain('Something broke');
    expect(container.textContent).toContain('Try again');
  });

  it('renders Spanish copy on /es', () => {
    window.history.pushState({}, '', '/es/foo');
    const { container } = render(<PageError error={new Error('boom')} reset={() => {}} />);
    expect(container.textContent).toContain('Algo se rompió');
    expect(container.textContent).toContain('Reintentar');
  });

  it('reports non-translator errors to Sentry without auto-reset', () => {
    const error = new Error('upstream failure');
    const reset = vi.fn();
    render(<PageError error={error} reset={reset} />);
    expect(captureException).toHaveBeenCalledWith(error);
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('PageError translator-DOM auto-recovery', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.useFakeTimers();
  });

  it('auto-resets once on NotFoundError + removeChild', () => {
    const error = makeNotFoundError(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    );
    const reset = vi.fn();
    render(<PageError error={error} reset={reset} />);
    expect(captureException).toHaveBeenCalledWith(error, { tags: { autoRecovered: 'translator-dom' } });
    act(() => {
      vi.runAllTimers();
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('auto-resets once on NotFoundError + insertBefore', () => {
    const error = makeNotFoundError(
      "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
    );
    const reset = vi.fn();
    render(<PageError error={error} reset={reset} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not auto-reset a generic NotFoundError', () => {
    const error = makeNotFoundError('something else entirely');
    const reset = vi.fn();
    render(<PageError error={error} reset={reset} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(reset).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('shows the visible fallback when the translator error survives the first auto-reset', () => {
    const firstError = makeNotFoundError(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    );
    const reset = vi.fn();
    const { rerender, container } = render(<PageError error={firstError} reset={reset} />);

    // First render renders null while the auto-reset is in flight.
    expect(container.textContent ?? '').not.toContain('Something broke');

    act(() => {
      vi.runAllTimers();
    });
    expect(reset).toHaveBeenCalledTimes(1);

    // The translator is still mutating the DOM, so the same NotFoundError fires
    // again. The boundary should now surface the visible fallback instead of
    // leaving the user staring at a blank page.
    const secondError = makeNotFoundError(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    );
    rerender(<PageError error={secondError} reset={reset} />);
    act(() => {
      vi.runAllTimers();
    });

    expect(reset).toHaveBeenCalledTimes(1); // no second auto-reset
    expect(container.textContent).toContain('Something broke');
    expect(container.textContent).toContain('Try again');
    expect(captureException).toHaveBeenCalledWith(secondError);
  });

  it('does not auto-reset across navigations once the session budget is exhausted', () => {
    const firstError = makeNotFoundError(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    );
    const firstReset = vi.fn();
    const { unmount } = render(<PageError error={firstError} reset={firstReset} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(firstReset).toHaveBeenCalledTimes(1);

    // Simulate the user navigating to another page: previous boundary unmounts,
    // a new one mounts with a fresh error. The module-level counter must keep
    // the budget bounded — otherwise every navigation grants a new silent
    // recovery and the user never sees the fallback.
    unmount();

    const secondError = makeNotFoundError(
      "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
    );
    const secondReset = vi.fn();
    const { container } = render(<PageError error={secondError} reset={secondReset} />);
    act(() => {
      vi.runAllTimers();
    });

    expect(secondReset).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Something broke');
  });
});
