import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { BoardDetails } from '@/app/lib/types';
import BoardSlot from '../board-slot';

// No live presence -> the img (raster) branch renders and BoardRenderer stays
// out of the tree; keeps this focused on the install-QR conditional.
vi.mock('@/app/components/kiosk/presence/use-kiosk-board-presence', () => ({
  useKioskBoardPresence: () => null,
}));
vi.mock('@/app/components/board-renderer/board-renderer', () => ({
  default: () => <div data-testid="board-renderer" />,
}));
vi.mock('@/app/components/kiosk/board-slot/board-identity', () => ({
  default: () => <div data-testid="board-identity" />,
}));
vi.mock('@/app/components/kiosk/board-slot/board-install-qr', () => ({
  default: ({ slug }: { slug: string }) => <div data-testid="install-qr" data-slug={slug} />,
}));

const boardDetails = { board_name: 'kilter' } as unknown as BoardDetails;

function renderSlot(overrides: Partial<React.ComponentProps<typeof BoardSlot>> = {}) {
  return render(
    <BoardSlot
      boardId={1}
      boardName="Main Kilter"
      angle={40}
      boardDetails={boardDetails}
      initialClimb={null}
      initialClimbImageUrl={null}
      bareBoardImageUrl="/bare.webp"
      slug="main-kilter"
      showInstallQr
      {...overrides}
    />,
  );
}

describe('BoardSlot install QR', () => {
  it('renders the QR (with the board slug) when the toggle is on and a slug is present', () => {
    renderSlot();
    expect(screen.getByTestId('install-qr').getAttribute('data-slug')).toBe('main-kilter');
  });

  it('hides the QR when the toggle is off', () => {
    renderSlot({ showInstallQr: false });
    expect(screen.queryByTestId('install-qr')).toBeNull();
  });

  it('hides the QR when the slug is empty', () => {
    renderSlot({ slug: '' });
    expect(screen.queryByTestId('install-qr')).toBeNull();
  });
});
