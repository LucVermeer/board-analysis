// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createElement, forwardRef, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  TextInput: forwardRef<
    HTMLInputElement,
    {
      value?: string;
      placeholder?: string;
      onChangeText?: (text: string) => void;
      onSubmitEditing?: () => void;
      onFocus?: () => void;
      onBlur?: () => void;
    }
  >(function TextInputMock({ value, placeholder, onChangeText, onSubmitEditing, onFocus, onBlur }, ref) {
    return createElement('input', {
      ref,
      value,
      placeholder,
      onChange: (event: ChangeEvent<HTMLInputElement>) => onChangeText?.(event.currentTarget.value),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') onSubmitEditing?.();
      },
      onFocus,
      onBlur,
    });
  }),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
}));

vi.mock('../GlassSurface', () => ({
  GlassSurface: () => createElement('div', { 'data-glass': 'true' }),
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { label: '#000', fill: '#eee' } }),
}));

vi.mock('../../theme/ios-colors', () => ({
  iosSystemColors: { systemGray: '#888', white: '#fff' },
}));

import { SearchHeader } from '../SearchHeader';

describe('SearchHeader', () => {
  it('submits the current text when the keyboard search action fires', () => {
    const onSubmit = vi.fn();
    const { getByPlaceholderText } = render(
      <SearchHeader
        placeholder="Search climbs"
        onChangeText={() => {}}
        onSubmit={onSubmit}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    );

    const input = getByPlaceholderText('Search climbs');
    fireEvent.change(input, { target: { value: 'Moonage' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('Moonage');
  });
});
