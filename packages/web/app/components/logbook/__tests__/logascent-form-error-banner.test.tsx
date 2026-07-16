/**
 * The form-level error banner exists because failed saves used to be silent
 * (console.error + dropped tick). These tests pin its lifecycle: a failed
 * save surfaces it and keeps the form open, a re-submit clears it, and
 * switching log type clears it (ascent-only validation doesn't apply to
 * attempts, so a stale banner would contradict the visible form).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { BoardDetails, BoardName, Climb } from '@/app/lib/types';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockSaveTick = vi.fn();

vi.mock('../../board-provider/board-provider-context', () => ({
  useBoardProvider: () => ({
    saveTick: mockSaveTick,
    logbook: [],
    boardName: 'kilter' as BoardName,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    isInitialized: true,
    getLogbook: vi.fn(),
    saveClimb: vi.fn(),
  }),
}));

vi.mock('../../board-presence/board-presence-context', () => ({
  useBoardPresenceControls: () => ({
    enabled: false,
    boardId: null,
    resolveAndBindBoard: vi.fn(),
  }),
}));

vi.mock('@/app/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/app/hooks/use-effective-angle', () => ({
  useEffectiveAngle: () => 40,
}));

// Keep the wall-drift banner out of the picture — these tests assert on the
// form-level error Alert and nothing else.
vi.mock('../../graphql-queue/QueueContext', () => ({
  useOptionalCurrentClimb: () => null,
}));

const { LogAscentForm } = await import('../logascent-form');

const SAVE_FAILED_COPY = /Couldn't save your tick/i;

function makeClimb(): Climb {
  return {
    uuid: 'climb-1',
    name: 'Banner Check',
    difficulty: 'V5',
    frames: 'p1r42',
    quality_average: '3.5',
    angle: 40,
    ascensionist_count: 10,
    display_difficulty: 5,
    difficulty_average: 12.5,
    setter_username: 'setter',
  } as unknown as Climb;
}

function makeBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter' as BoardName,
    layout_id: 1,
    size_id: 10,
    set_ids: [1, 2],
    layout_name: 'Original',
    size_name: '12x12',
    size_description: 'Full',
    set_names: ['Standard'],
    supportsMirroring: false,
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 0,
    edge_bottom: 0,
    edge_top: 0,
    boardHeight: 100,
    boardWidth: 100,
  } as BoardDetails;
}

function renderForm(onClose = vi.fn()) {
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <LogAscentForm currentClimb={makeClimb()} boardDetails={makeBoardDetails()} onClose={onClose} />
    </LocalizationProvider>,
  );
  return onClose;
}

const submitButton = () => screen.getByRole('button', { name: /Log at 40°/i });

describe('LogAscentForm — error banner lifecycle', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // The save-failure path console.errors by design — keep test output clean.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('surfaces the banner on a failed save and keeps the form open', async () => {
    mockSaveTick.mockRejectedValueOnce(new Error('network down'));
    const onClose = renderForm();

    fireEvent.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(SAVE_FAILED_COPY);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the banner when a re-submit succeeds', async () => {
    mockSaveTick.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined);
    const onClose = renderForm();

    fireEvent.click(submitButton());
    await screen.findByRole('alert');

    fireEvent.click(submitButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the banner when the log type is switched', async () => {
    mockSaveTick.mockRejectedValueOnce(new Error('network down'));
    renderForm();

    fireEvent.click(submitButton());
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Attempt/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
