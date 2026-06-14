// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchState = vi.hoisted(() => ({
  mutate: vi.fn(),
  latestSearchQuery: '',
  latestSearchEnabled: false,
  searchRefetch: vi.fn(),
  dismiss: vi.fn(),
}));

const searchResult = {
  user: {
    id: 'friend-1',
    displayName: 'Marco',
    avatarUrl: null,
    followerCount: 5,
    followingCount: 6,
    isFollowedByMe: false,
  },
  recentAscentCount: 7,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const count = Number(options?.count ?? 0);
      const translations: Record<string, string> = {
        'mobile.home.closeSearch': 'Close climber search',
        'mobile.home.findClimbersTitle': 'Find climbers',
        'mobile.unknownName': 'Climber',
        'mobile.social.searchPlaceholder': 'Search climbers',
        'mobile.social.clearSearch': 'Clear search',
        'mobile.social.you': 'You',
        'mobile.social.followAction': 'Follow',
        'mobile.social.unfollowAction': 'Unfollow',
        'mobile.social.searchHint': 'Type at least 2 characters to search climbers',
        'mobile.social.emptySearch': 'No climbers found',
        'mobile.social.loadError': "Couldn't load climbers",
        'mobile.social.retry': 'Try again',
      };
      const name = typeof options?.name === 'string' ? options.name : '';
      const query = typeof options?.query === 'string' ? options.query : '';
      if (key === 'mobile.social.followUser') return `Follow ${name}`;
      if (key === 'mobile.social.unfollowUser') return `Unfollow ${name}`;
      if (key === 'mobile.social.followerCount') return `${count} follower${count === 1 ? '' : 's'}`;
      if (key === 'mobile.social.followingCount') return `${count} following`;
      if (key === 'mobile.social.recentAscents') return `${count} ascents this month`;
      if (key === 'mobile.social.emptySearchBody') return `No climbers match "${query}".`;
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (options: Record<string, unknown>) => options.android ?? options.default,
  },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
  TextInput: ({
    value,
    onChangeText,
    placeholder,
    accessibilityLabel,
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
    accessibilityLabel?: string;
  }) =>
    createElement('input', {
      value: value ?? '',
      placeholder,
      'aria-label': accessibilityLabel ?? placeholder,
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    }),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: forwardRef(({ children, onDismiss }: { children?: ReactNode; onDismiss?: () => void }, ref) => {
    useImperativeHandle(ref, () => ({
      present: vi.fn(),
      dismiss: () => {
        searchState.dismiss();
        onDismiss?.();
      },
    }));
    return createElement('div', { 'data-sheet': 'true' }, children);
  }),
  BottomSheetView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BottomSheetBackdrop: () => null,
  BottomSheetTextInput: ({
    value,
    onChangeText,
    placeholder,
    accessibilityLabel,
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
    accessibilityLabel?: string;
  }) =>
    createElement('input', {
      value: value ?? '',
      placeholder,
      'aria-label': accessibilityLabel ?? placeholder,
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    }),
  BottomSheetFlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data?: unknown[];
    renderItem: (input: { item: unknown; index: number }) => ReactNode;
    ListEmptyComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
  }) =>
    createElement(
      'div',
      null,
      data?.length
        ? data.map((item, index) => createElement('div', { key: index }, renderItem({ item, index })))
        : ListEmptyComponent,
      ListFooterComponent,
    ),
}));

vi.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      fill: '#eee',
      label: '#000',
      secondaryLabel: '#666',
      tertiaryLabel: '#999',
      secondaryBackground: '#fff',
      separator: '#ddd',
    },
    brandColors: { primary: '#6D28D9' },
    sheet: {
      scrimOpacity: 0.5,
      corners: {},
      handleStyle: {},
    },
  }),
}));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 8: 32, 16: 64 },
  borderRadius: { full: 9999, lg: 12 },
  sheetStyles: { background: {} },
}));
vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { systemGray: '#999' } }));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));
vi.mock('../../Avatar', () => ({ Avatar: () => createElement('div', { 'data-avatar': 'true' }) }));
vi.mock('../../ActivityIndicator', () => ({
  ActivityIndicator: () => createElement('div', { 'data-spinner': 'true' }),
}));
vi.mock('../../Button', () => ({
  Button: ({
    title,
    onPress,
    accessibilityLabel,
  }: {
    title: string;
    onPress: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, title),
}));
vi.mock('../../ListRow', () => ({
  ListRow: ({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) =>
    createElement(
      'div',
      null,
      createElement('span', null, title),
      subtitle ? createElement('span', null, subtitle) : null,
      trailing,
    ),
}));
vi.mock('../../GlassSheetBackground', () => ({
  GlassSheetBackground: () => createElement('div', { 'data-sheet-background': 'true' }),
}));
vi.mock('../../../lib/graphql/hooks', () => ({
  useSearchUsers: (query: string, enabled = true) => {
    searchState.latestSearchQuery = enabled ? query : '';
    searchState.latestSearchEnabled = enabled;
    return {
      data: enabled && query.length >= 2 ? { pages: [{ results: [searchResult], hasMore: false }] } : undefined,
      isPending: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      refetch: searchState.searchRefetch,
      fetchNextPage: vi.fn(),
    };
  },
  useToggleUserFollow: () => ({
    mutate: searchState.mutate,
    isPending: false,
    variables: undefined,
  }),
}));

import { HomeClimberSearchSheet } from '../HomeClimberSearchSheet';

describe('HomeClimberSearchSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchState.mutate.mockReset();
    searchState.searchRefetch.mockReset();
    searchState.dismiss.mockReset();
    searchState.latestSearchQuery = '';
    searchState.latestSearchEnabled = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search title and disabled-query hint initially', () => {
    const { getByText, getByPlaceholderText } = render(<HomeClimberSearchSheet currentUserId="me" />);

    expect(getByText('Find climbers')).toBeTruthy();
    expect(getByPlaceholderText('Search climbers')).toBeTruthy();
    expect(getByText('Type at least 2 characters to search climbers')).toBeTruthy();
    expect(searchState.latestSearchEnabled).toBe(false);
  });

  it('debounces climber search and follows a result', () => {
    const { getByText, getByPlaceholderText } = render(<HomeClimberSearchSheet currentUserId="me" />);

    fireEvent.change(getByPlaceholderText('Search climbers'), { target: { value: 'ma' } });
    expect(searchState.latestSearchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(searchState.latestSearchQuery).toBe('ma');
    expect(getByText('Marco')).toBeTruthy();
    expect(getByText('7 ascents this month')).toBeTruthy();

    fireEvent.click(getByText('Follow'));
    expect(searchState.mutate).toHaveBeenCalledWith({ userId: 'friend-1', isFollowedByMe: false });
  });

  it('does not enable search for one-character queries', () => {
    const { getByText, getByPlaceholderText } = render(<HomeClimberSearchSheet currentUserId="me" />);

    fireEvent.change(getByPlaceholderText('Search climbers'), { target: { value: 'm' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(searchState.latestSearchQuery).toBe('');
    expect(searchState.latestSearchEnabled).toBe(false);
    expect(getByText('Type at least 2 characters to search climbers')).toBeTruthy();
  });

  it('waits for current user identity before searching or showing follow actions', () => {
    const { container, getByPlaceholderText, queryByText } = render(
      <HomeClimberSearchSheet currentUserId={undefined} />,
    );

    fireEvent.change(getByPlaceholderText('Search climbers'), { target: { value: 'ma' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(searchState.latestSearchQuery).toBe('');
    expect(searchState.latestSearchEnabled).toBe(false);
    expect(container.querySelector('[data-spinner="true"]')).not.toBeNull();
    expect(queryByText('Marco')).toBeNull();
    expect(queryByText('Follow')).toBeNull();
  });

  it('shows a retryable error when identity loading fails', () => {
    const retryIdentity = vi.fn();
    const { container, getByPlaceholderText, getByText, queryByText } = render(
      <HomeClimberSearchSheet currentUserId={undefined} isIdentityError onRetryIdentity={retryIdentity} />,
    );

    fireEvent.change(getByPlaceholderText('Search climbers'), { target: { value: 'ma' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(container.querySelector('[data-spinner="true"]')).toBeNull();
    expect(getByText("Couldn't load climbers")).toBeTruthy();
    expect(queryByText('Marco')).toBeNull();

    fireEvent.click(getByText('Try again'));
    expect(retryIdentity).toHaveBeenCalledOnce();
    expect(searchState.searchRefetch).not.toHaveBeenCalled();
  });
});
