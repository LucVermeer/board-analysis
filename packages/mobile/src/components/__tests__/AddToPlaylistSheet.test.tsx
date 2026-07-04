// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';

const captured = vi.hoisted(() => ({
  sheetVisible: undefined as boolean | undefined,
  pickerProps: null as Record<string, unknown> | null,
}));

vi.mock('@expo/ui/community/bottom-sheet', () => ({
  BottomSheetTextInput: function BottomSheetTextInput() {
    return null;
  },
}));

vi.mock('../ModalSheet', () => ({
  ModalSheet: ({ visible, children }: { visible?: boolean; children?: ReactNode }) => {
    captured.sheetVisible = visible;
    return createElement('div', { 'data-modal-sheet': 'true' }, children);
  },
}));

vi.mock('../ClimbPreviewCard', () => ({
  ClimbPreviewCard: () => createElement('div', { 'data-climb-preview': 'true' }),
}));

vi.mock('../playlist/InlinePlaylistPicker', () => ({
  InlinePlaylistPicker: (props: Record<string, unknown>) => {
    captured.pickerProps = props;
    return createElement('div', { 'data-inline-picker': 'true' });
  },
}));

import { AddToPlaylistSheet } from '../AddToPlaylistSheet';

const climb = { uuid: 'climb-1', name: 'Big Move', frames: '' } as Climb;

function renderSheet(climbArg: Climb | null) {
  return render(
    <AddToPlaylistSheet
      visible
      climb={climbArg}
      boardName="kilter"
      layoutId={1}
      sizeId={10}
      setIds="1,2"
      angle={40}
      onClose={vi.fn()}
    />,
  );
}

describe('AddToPlaylistSheet', () => {
  beforeEach(() => {
    captured.sheetVisible = undefined;
    captured.pickerProps = null;
  });

  it('renders the preview + inline picker with the climb/board props when a climb is present', () => {
    const { container } = renderSheet(climb);
    expect(captured.sheetVisible).toBe(true);
    expect(container.querySelector('[data-climb-preview="true"]')).not.toBeNull();
    expect(container.querySelector('[data-inline-picker="true"]')).not.toBeNull();
    expect(captured.pickerProps).toMatchObject({
      climb,
      angle: 40,
      boardName: 'kilter',
      layoutId: 1,
    });
    // The sheet injects the native bottom-sheet text input (keyboard pushes the sheet).
    expect(typeof captured.pickerProps?.TextInputComponent).toBe('function');
    // No back affordance in the sheet host.
    expect(captured.pickerProps?.onBack).toBeUndefined();
  });

  it('keeps the sheet closed and renders no picker when there is no climb', () => {
    const { container } = renderSheet(null);
    expect(captured.sheetVisible).toBe(false);
    expect(container.querySelector('[data-inline-picker="true"]')).toBeNull();
  });
});
