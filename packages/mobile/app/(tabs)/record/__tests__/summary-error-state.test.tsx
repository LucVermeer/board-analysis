// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type SummaryResult = {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
};

const hook = vi.hoisted(() => ({
  result: {
    data: undefined as unknown,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  } as SummaryResult,
}));

const router = vi.hoisted(() => ({ back: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'session-1' }),
  useRouter: () => router,
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('../../../../src/lib/graphql/hooks', () => ({ useSessionSummary: () => hook.result }));
vi.mock('../../../../src/providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: {}, brandColors: { primary: '#6D28D9' } }),
}));
vi.mock('../../../../src/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string) => grade }),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ActivityIndicator: () => createElement('div', { 'data-testid': 'spinner' }),
  StyleSheet: { create: (styles: unknown) => styles },
}));

// The screen pulls brandColors from the theme module, which evaluates
// PlatformColor at import time; stub it so the node test env stays happy.
vi.mock('../../../../src/theme/colors', () => ({ brandColors: { primary: '#6D28D9' } }));
vi.mock('../../../../src/theme/tokens', () => ({
  spacing: new Proxy({}, { get: () => 8 }),
  borderRadius: new Proxy({}, { get: () => 8 }),
}));

// Lightweight component stubs — Button renders its title as a clickable button.
vi.mock('../../../../src/components/Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
    createElement('button', { onClick: onPress }, title),
}));
vi.mock('../../../../src/components/Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../src/components/Icon', () => ({ Icon: () => createElement('i', null) }));
vi.mock('../../../../src/components/Avatar', () => ({ Avatar: () => createElement('div', null) }));
vi.mock('../../../../src/components/SectionHeader', () => ({ SectionHeader: () => createElement('div', null) }));
vi.mock('../../../../src/components/Separator', () => ({ Separator: () => createElement('div', null) }));

// Imported after mocks so it binds to the stubbed dependencies.
const { default: SessionSummaryScreen } = await import('../summary');

function setSummary(partial: Partial<SummaryResult>) {
  hook.result = {
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: hook.result.refetch,
    ...partial,
  };
}

describe('SessionSummaryScreen settled error/empty state', () => {
  beforeEach(() => {
    router.back.mockClear();
    hook.result.refetch = vi.fn();
  });

  it('shows a spinner while the summary is still loading', () => {
    setSummary({ isPending: true, isFetching: true });
    const { queryByText, getByTestId } = render(<SessionSummaryScreen />);
    expect(getByTestId('spinner')).toBeTruthy();
    expect(queryByText('summary.done')).toBeNull();
  });

  it('shows a Done button (not an endless spinner) when the query errors', () => {
    setSummary({ isError: true });
    const { queryByTestId, getByText } = render(<SessionSummaryScreen />);
    expect(queryByTestId('spinner')).toBeNull();
    expect(getByText('summary.done')).toBeTruthy();
    expect(getByText('summary.retry')).toBeTruthy();
    fireEvent.click(getByText('summary.done'));
    expect(router.back).toHaveBeenCalledOnce();
  });

  it('shows the error state (not a spinner) when the query settles with no summary', () => {
    setSummary({ data: undefined, isPending: false, isFetching: false });
    const { queryByTestId, getByText } = render(<SessionSummaryScreen />);
    expect(queryByTestId('spinner')).toBeNull();
    expect(getByText('summary.loadErrorTitle')).toBeTruthy();
    expect(getByText('summary.done')).toBeTruthy();
  });

  it('retry triggers refetch', () => {
    const refetch = vi.fn();
    setSummary({ isError: true });
    hook.result.refetch = refetch;
    const { getByText } = render(<SessionSummaryScreen />);
    fireEvent.click(getByText('summary.retry'));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
