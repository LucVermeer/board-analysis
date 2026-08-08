import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnalyzedBetaVideo, PrivateAttemptVideo } from '@boardsesh/shared-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AnalyzedBetaPlayer } from '../../beta-videos/analyzed-beta-videos';
import { PrivateAttemptVideoRow } from '../private-attempt-videos';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'attemptVideos.videoAria': 'Private attempt video',
        'attemptVideos.playbackSpeed': 'Playback speed',
        'attemptVideos.deleteAria': 'Delete attempt video',
        'analyzedBeta.videoAria': 'Analyzed beta video',
        'analyzedBeta.previousMoveAria': 'Previous move',
        'analyzedBeta.nextMoveAria': 'Next move',
        'analyzedBeta.moveLabel': 'Move',
      };
      if (key === 'attemptVideos.duration') return `${String(options?.seconds)} seconds`;
      if (key === 'analyzedBeta.moveCount') return `Move ${String(options?.move)} of ${String(options?.count)}`;
      return labels[key] ?? key;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/app/lib/backend-url', () => ({
  getBackendHttpUrl: () => 'http://127.0.0.1:8080',
}));

const privateVideo: PrivateAttemptVideo = {
  uuid: 'video-1',
  tickUuid: 'tick-1',
  boardType: 'moonboard',
  climbProvider: 'boardsesh_public_graphql_search_climbs',
  climbUuid: 'climb-1',
  layoutId: 3,
  angle: 40,
  isMirror: false,
  mimeType: 'video/webm',
  byteSize: 100,
  durationMs: 5_000,
  recordedAt: '2026-08-08T10:00:00.000Z',
  createdAt: '2026-08-08T10:00:05.000Z',
  playbackPath: '/api/internal/attempt-videos/video-1/stream',
};

const analyzedBeta: AnalyzedBetaVideo = {
  id: 'scraped-beta-1',
  provider: 'boardsesh_public_graphql_search_climbs',
  providerClimbId: 'climb-1',
  boardType: 'moonboard',
  boardLayout: 'MoonBoard 2024',
  sourceAccount: 'setter',
  postKey: 'post-1',
  postUrl: 'https://example.test/post-1',
  mediaItemKey: 'post-1:item-1',
  mediaItemIndex: 1,
  mediaItemCount: 1,
  segmentKey: 'post-1:item-1:segment-1',
  evidenceScope: 'segment',
  resolutionScope: 'segment',
  assignmentState: 'manual',
  assignmentMethod: 'manual_review',
  uncertaintyReasons: [],
  isDefinitive: true,
  hasMoveAnalysis: true,
  candidateClimbs: [],
  climb: null,
  playbackPath: '/api/analyzed-beta-videos/scraped-beta-1/stream?climbUuid=climb-1',
  movesPath: '/api/analyzed-beta-videos/scraped-beta-1/moves?climbUuid=climb-1',
};
const mediaPlayMock = vi.fn<() => Promise<void>>();
const mediaPauseMock = vi.fn<() => void>();

function renderAnalyzed(beta: AnalyzedBetaVideo) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyzedBetaPlayer beta={beta} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mediaPlayMock.mockReset();
  mediaPlayMock.mockResolvedValue();
  mediaPauseMock.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(mediaPlayMock);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(mediaPauseMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('attempt and analyzed beta players', () => {
  it('offers stable playback speeds and no move navigation for private attempts', () => {
    render(<PrivateAttemptVideoRow video={privateVideo} onDelete={vi.fn()} />);
    const video = screen.getByLabelText('Private attempt video') as HTMLVideoElement;

    fireEvent.click(screen.getByRole('button', { name: '0.5x' }));
    expect(video.playbackRate).toBe(0.5);
    expect(screen.queryByLabelText('Previous move')).toBeNull();
    expect(screen.queryByLabelText('Next move')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Move' })).toBeNull();
  });

  it('shows no false move controls for an unanalyzed beta video', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAnalyzed({ ...analyzedBeta, hasMoveAnalysis: false, movesPath: null });

    expect(screen.queryByLabelText('Previous move')).toBeNull();
    expect(screen.queryByLabelText('Next move')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Move' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains previous, next, and direct move navigation for analyzed beta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          moves: [
            { number: 1, kind: 'move', playback: { start_s: 0.5, end_s: 1.5 } },
            { number: 2, kind: 'move', playback: { start_s: 2.5, end_s: 3.5 } },
          ],
        }),
      }),
    );
    renderAnalyzed(analyzedBeta);

    expect(await screen.findByLabelText('Previous move')).toBeTruthy();
    expect(screen.getByLabelText('Next move')).toBeTruthy();
    const video = screen.getByLabelText('Analyzed beta video') as HTMLVideoElement;
    video.currentTime = 2;
    fireEvent.timeUpdate(video);
    expect(mediaPauseMock).not.toHaveBeenCalled();

    const selector = screen.getByRole('combobox', { name: 'Move' });
    fireEvent.mouseDown(selector);
    fireEvent.click(await screen.findByRole('option', { name: 'Move 2 of 2' }));

    await waitFor(() => expect(video.currentTime).toBe(2.5));
    expect(mediaPlayMock).toHaveBeenCalled();
    video.currentTime = 3.5;
    fireEvent.timeUpdate(video);
    expect(mediaPauseMock).toHaveBeenCalledOnce();
  });
});
