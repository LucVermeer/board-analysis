import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
import { render, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('../attach-beta-link-form', () => ({
  default: () => <div data-testid="form" />,
}));

import BoardseshBetaAddPanel from '../boardsesh-beta-add-panel';

afterEach(() => {
  vi.useRealTimers();
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof BoardseshBetaAddPanel>> = {}) {
  const onCancel = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <BoardseshBetaAddPanel
      boardType="kilter"
      climbUuid="climb-1"
      angle={40}
      onCancel={onCancel}
      onSuccess={onSuccess}
      {...overrides}
    />,
  );
  return { ...utils, onCancel, onSuccess };
}

describe('BoardseshBetaAddPanel — unmount cancel guard', () => {
  it('does not call onCancel inside React.StrictMode (mount → cleanup → remount)', () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const onSuccess = vi.fn();
    render(
      <React.StrictMode>
        <BoardseshBetaAddPanel
          boardType="kilter"
          climbUuid="climb-1"
          angle={40}
          onCancel={onCancel}
          onSuccess={onSuccess}
        />
      </React.StrictMode>,
    );

    // The strict-mode double-invoke runs the cleanup once between the two
    // mounts. The setup of the second mount must clear that pending cancel
    // before its timer fires.
    act(() => {
      vi.runAllTimers();
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on a real unmount (section collapse via lazy:true)', () => {
    vi.useFakeTimers();
    const { unmount, onCancel } = renderPanel();

    unmount();
    act(() => {
      vi.runAllTimers();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
