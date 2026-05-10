import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { BoardDetails, SearchRequestPagination } from '@/app/lib/types';
import { DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockUpdateFilters = vi.fn();
let mockUISearchParams: SearchRequestPagination = { ...DEFAULT_SEARCH_PARAMS };

vi.mock('@/app/components/queue-control/ui-searchparams-provider', () => ({
  useUISearchParams: () => ({
    uiSearchParams: mockUISearchParams,
    updateFilters: mockUpdateFilters,
  }),
}));

vi.mock('@/app/components/board-provider/board-provider-context', () => ({
  useBoardProvider: () => ({ isAuthenticated: false }),
}));

vi.mock('@/app/components/providers/auth-modal-provider', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock('../search-climb-name-input', () => ({
  default: () => null,
}));

vi.mock('../setter-name-select', () => ({
  default: () => null,
}));

vi.mock('../climb-search-form', () => ({
  default: () => null,
}));

vi.mock('../search-summary-utils', () => ({
  getQualityPanelSummary: () => [],
  getStatusPanelSummary: () => [],
  getUserPanelSummary: () => [],
  getHoldsPanelSummary: () => [],
  getZonePanelSummary: () => [],
}));

import AccordionSearchForm from '../accordion-search-form';

const boardDetails = {
  board_name: 'kilter',
  layout_id: 1,
  size_id: 1,
  set_ids: [],
  size_name: '12 x 12',
} as unknown as BoardDetails;

describe('AccordionSearchForm — quality filter controls', () => {
  beforeEach(() => {
    mockUpdateFilters.mockClear();
    mockUISearchParams = { ...DEFAULT_SEARCH_PARAMS };
  });

  // The old numeric-input Sentry regressions are covered by controls that always emit concrete sentinels.
  it('renders quality controls without raw number inputs', () => {
    const { container } = render(<AccordionSearchForm boardDetails={boardDetails} />);
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  it('Min Ascents preset emits the selected threshold', () => {
    render(<AccordionSearchForm boardDetails={boardDetails} />);

    fireEvent.click(screen.getByRole('button', { name: '10+' }));

    expect(mockUpdateFilters.mock.calls.at(-1)?.[0]).toEqual({ minAscents: 10 });
  });

  it('Min Ascents selected zero bucket emits the 0 sentinel when clicked again', () => {
    render(<AccordionSearchForm boardDetails={boardDetails} />);

    fireEvent.click(screen.getByRole('button', { name: '0+' }));

    expect(mockUpdateFilters.mock.calls.at(-1)?.[0]).toEqual({ minAscents: 0 });
  });

  it('Min Rating star picker emits whole-star thresholds', () => {
    render(<AccordionSearchForm boardDetails={boardDetails} />);
    fireEvent.click(screen.getByRole('option', { name: '4 stars and up' }));
    expect(mockUpdateFilters.mock.calls.at(-1)?.[0]).toEqual({ minRating: 4 });
  });

  it('Min Rating clear option emits the 0 sentinel', () => {
    mockUISearchParams = { ...DEFAULT_SEARCH_PARAMS, minRating: 3 };
    render(<AccordionSearchForm boardDetails={boardDetails} />);
    fireEvent.click(screen.getByRole('option', { name: 'Any' }));
    const lastCall = mockUpdateFilters.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual({ minRating: 0 });
    expect(lastCall?.minRating).not.toBeUndefined();
  });

  it('rounds a legacy decimal Min Rating up to the next whole-star display', () => {
    mockUISearchParams = { ...DEFAULT_SEARCH_PARAMS, minRating: 2.5 };
    render(<AccordionSearchForm boardDetails={boardDetails} />);
    expect(screen.getByRole('option', { name: '3 stars and up' }).getAttribute('aria-selected')).toBe('true');
  });
});
