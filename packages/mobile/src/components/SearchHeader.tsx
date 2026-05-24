import { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInput as TextInputType } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../providers/theme-provider';
import { spacing } from '../theme/tokens';
import { iosSystemColors } from '../theme/ios-colors';

export type SearchHeaderHandle = {
  blur: () => void;
  focus: () => void;
};

type SearchHeaderProps = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
};

export const SearchHeader = forwardRef<SearchHeaderHandle, SearchHeaderProps>(
  function SearchHeader({ value, placeholder, onChangeText, onFocus, onBlur }, ref) {
    const inputRef = useRef<TextInputType>(null);
    const { systemColors } = useTheme();

    useImperativeHandle(ref, () => ({
      blur: () => inputRef.current?.blur(),
      focus: () => inputRef.current?.focus(),
    }));

    const handleClear = () => {
      onChangeText('');
      inputRef.current?.focus();
    };

    return (
      <View style={[styles.container, { backgroundColor: systemColors.fill as string }]}>
        <Icon name="search" size={16} color={iosSystemColors.systemGray} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={iosSystemColors.systemGray}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.input, { color: systemColors.label as string }]}
        />
        {value.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8} accessibilityRole="button">
            <View style={styles.clearButton}>
              <Icon name="close" size={12} color={iosSystemColors.white} />
            </View>
          </Pressable>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 10,
    paddingHorizontal: spacing[2],
    gap: spacing[1],
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 0,
  },
  clearButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(142, 142, 147, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
