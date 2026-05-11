import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import PageError from '../error';

function makeNotFoundError(message: string): Error {
  const error = new Error(message);
  error.name = 'NotFoundError';
  return error;
}

afterEach(() => {
  cleanup();
  captureException.mockClear();
  vi.useRealTimers();
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
});
