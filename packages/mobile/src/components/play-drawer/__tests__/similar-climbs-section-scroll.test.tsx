// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression guard for the Android nested-scroll fix (issue #3506): like the beta
// strip, the Similar Climbs strip lives inside the play drawer's RNGH ScrollView,
// so it must scroll with react-native-gesture-handler's ScrollView — a plain
// react-native ScrollView can't scroll there on Android. Distinct stubs let us
// assert the strip's scroller came from the gesture-handler module.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'rn-scroll' }, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));

vi.mock('react-native-gesture-handler', () => ({
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'rngh-scroll' }, children),
}));

const similar = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn() }));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: () => null }));
vi.mock('../../ClimbListThumbnail', () => ({ ClimbListThumbnail: () => null }));
vi.mock('../similar-climbs-utils', () => ({
  rankBySizeCompatibility: () => [
    {
      climb: { uuid: 'sc-1', name: 'Test Similar', difficultyName: 'V4', frames: '', layoutId: 1 },
      compatible: true,
    },
  ],
  buildClimbStub: () => ({ uuid: 'sc-1' }),
  formatByline: () => '',
}));
vi.mock('../../../lib/graphql/hooks', () => ({
  useSimilarClimbs: () => ({
    data: similar.data,
    isLoading: similar.isLoading,
    isError: similar.isError,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../hooks/use-display-grade', () => ({
  useDisplayGrade: () => ({ resolveGrade: () => ({ label: 'V4', color: '#333' }) }),
}));
vi.mock('../../../providers/theme-provider', () => ({ useTheme: () => ({ brandColors: { primary: '#000' } }) }));
vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { systemGray: '#888', white: '#fff' } }));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 16: 64 },
  borderRadius: { md: 8, full: 999 },
}));

import { SimilarClimbsSection } from '../SimilarClimbsSection';

beforeEach(() => {
  similar.data = [{ uuid: 'sc-1' }];
  similar.isLoading = false;
  similar.isError = false;
});

describe('SimilarClimbsSection', () => {
  it('scrolls the loaded strip with the gesture-handler ScrollView (Android nested-scroll fix)', () => {
    const { getByTestId, queryByTestId } = render(
      createElement(SimilarClimbsSection, {
        climbUuid: 'climb-1',
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '1',
        angle: 40,
        onClimbPress: vi.fn(),
      }),
    );

    expect(getByTestId('rngh-scroll')).toBeTruthy();
    expect(queryByTestId('rn-scroll')).toBeNull();
  });
});
