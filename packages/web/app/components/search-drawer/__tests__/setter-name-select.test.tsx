import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { SearchRequestPagination } from '@/app/lib/types';
import { DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';
import SetterNameSelect from '../setter-name-select';

// Issue #2068 / Sentry BOARDSESH-7C: `f.map is not a function` in the
// setter-username filter builder. Root cause was `fetcher` in
// setter-name-select.tsx resolving a non-2xx response's error body
// (`{ error: "..." }`, truthy but not an array) as if it were the setter
// list, which then crashed `setterStats.map(...)`. These tests pin the fix:
// a failed fetch must degrade to an empty, non-crashing dropdown instead.

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
}));

const mockUpdateFilters = vi.fn();
let mockUISearchParams: SearchRequestPagination = { ...DEFAULT_SEARCH_PARAMS };

vi.mock('../../queue-control/ui-searchparams-provider', () => ({
  useUISearchParams: () => ({
    uiSearchParams: mockUISearchParams,
    updateFilters: mockUpdateFilters,
  }),
}));

vi.mock('../../graphql-queue', () => ({
  useSearchData: () => ({
    parsedParams: { board_name: 'kilter', layout_id: 1, size_id: 1, set_ids: [1], angle: 40 },
  }),
}));

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SetterNameSelect />
    </QueryClientProvider>,
  );
}

describe('SetterNameSelect', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUISearchParams = { ...DEFAULT_SEARCH_PARAMS };
    mockUpdateFilters.mockReset();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('does not crash and shows the empty state when the setters API returns a 500 error body', async () => {
    // The route handler's catch block returns `{ error: '...' }` (an object,
    // not an array) with a 500 status — exactly the shape that used to reach
    // `.map` unguarded.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Failed to fetch setter stats' }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithQueryClient();

    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);

    await waitFor(
      () => {
        expect(screen.getByText('No setters found')).toBeTruthy();
      },
      { timeout: 8000 },
    );

    vi.restoreAllMocks();
  }, 15000);

  it('renders setter options from a successful array response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ setter_username: 'abc', climb_count: 5 }]),
    });

    renderWithQueryClient();

    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);

    await waitFor(
      () => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('abc (5)')).toBeTruthy();
      },
      { timeout: 8000 },
    );
  }, 15000);

  it('does not crash when a 2xx response body is not an array (defense-in-depth guard)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    renderWithQueryClient();

    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);

    await waitFor(
      () => {
        expect(screen.getByText('No setters found')).toBeTruthy();
      },
      { timeout: 8000 },
    );
  }, 15000);
});
