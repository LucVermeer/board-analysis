// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import type { ClimbActionProps } from '../../types';
import type { BoardDetails, Climb } from '@/app/lib/types';

const VIEW_PATH = '/kilter/original/12x14/screw_bolt/40/view/test-climb-test-uuid-789';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const showMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage }),
}));

vi.mock('@/app/lib/url-utils', () => ({
  getContextAwareClimbViewUrl: () => VIEW_PATH,
}));

const shareWithFallback = vi.fn().mockResolvedValue(true);
vi.mock('@/app/lib/share-utils', () => ({
  shareWithFallback: (options: unknown) => shareWithFallback(options),
}));

vi.mock('@/app/components/board-renderer/util', () => ({
  buildOgBoardRenderUrl: vi.fn(() => 'https://ws.boardsesh.com/og/climb?og'),
}));

vi.mock('@mui/icons-material/IosShare', () => ({ default: () => 'IosShareIcon' }));
vi.mock('@mui/material/Button', () => ({ default: ({ children }: { children?: React.ReactNode }) => children }));
vi.mock('../../action-tooltip', () => ({
  ActionTooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/app/theme/theme-config', () => ({
  themeTokens: { colors: {}, spacing: { 4: '16px' }, typography: { fontSize: { base: '14px' } } },
}));

import { ShareAction } from '../share-action';
import { buildOgBoardRenderUrl } from '@/app/components/board-renderer/util';

function createTestClimb(overrides?: Partial<Climb>): Climb {
  return {
    uuid: 'test-uuid-789',
    name: 'Test Climb',
    setter_username: 'testuser',
    description: 'A test climb',
    frames: 'p1r12p2r13',
    angle: 40,
    ascensionist_count: 5,
    difficulty: '6a/V3',
    quality_average: '3.5',
    stars: 3,
    difficulty_error: '0.50',
    benchmark_difficulty: null,
    ...overrides,
  };
}

function createTestBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 10,
    set_ids: '1,2',
  } as unknown as BoardDetails;
}

const onComplete = vi.fn();
function createTestProps(overrides?: Partial<ClimbActionProps>): ClimbActionProps {
  return {
    climb: createTestClimb(),
    boardDetails: createTestBoardDetails(),
    angle: 40,
    viewMode: 'icon',
    onComplete,
    ...overrides,
  };
}

const expectedShareUrl = `${window.location.origin}${VIEW_PATH}`;

describe('ShareAction prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildOgBoardRenderUrl).mockReturnValue('https://ws.boardsesh.com/og/climb?og');
    shareWithFallback.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fires both warm fetches (share page + og image) before sharing', async () => {
    const { result } = renderHook(() => ShareAction(createTestProps()));

    await act(async () => {
      result.current.menuItem.onClick?.();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(1, expectedShareUrl);
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://ws.boardsesh.com/og/climb?og', { mode: 'no-cors' });
    expect(shareWithFallback).toHaveBeenCalledTimes(1);
  });

  it('still shares when the warm fetches reject', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => ShareAction(createTestProps()));

    await act(async () => {
      result.current.menuItem.onClick?.();
      await Promise.resolve();
    });

    expect(shareWithFallback).toHaveBeenCalledTimes(1);
    expect(shareWithFallback).toHaveBeenCalledWith(expect.objectContaining({ url: expectedShareUrl }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('warms only the share page when the og url is the relative fallback', async () => {
    vi.mocked(buildOgBoardRenderUrl).mockReturnValue('/api/og/climb?relative');

    const { result } = renderHook(() => ShareAction(createTestProps()));

    await act(async () => {
      result.current.menuItem.onClick?.();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expectedShareUrl);
  });
});
