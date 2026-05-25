import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../providers/theme-provider';
import { spacing } from '../theme/tokens';
import { iosSystemColors } from '../theme/ios-colors';

export type SearchHeaderHandle = {
  blur: () => void;
  focus: () => void;
  getText: () => string;
  setText: (text: string) => void;
};

type SearchHeaderProps = {
  placeholder: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
};

export const SearchHeader = forwardRef<SearchHeaderHandle, SearchHeaderProps>(function SearchHeader(
  { placeholder, onChangeText, onFocus, onBlur },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const { systemColors } = useTheme();
  const [text, setText] = useState('');

  useImperativeHandle(ref, () => ({
    blur: () => inputRef.current?.blur(),
    focus: () => inputRef.current?.focus(),
    getText: () => text,
    setText: (newText: string) => {
      setText(newText);
      onChangeText(newText);
    },
  }));

  const handleChange = useCallback(
    (newText: string) => {
      setText(newText);
      onChangeText(newText);
    },
    [onChangeText],
  );

  const handleClear = useCallback(() => {
    setText('');
    onChangeText('');
    inputRef.current?.focus();
  }, [onChangeText]);

  return (
    <View style={[styles.container, { backgroundColor: systemColors.fill as string }]}>
      <Icon name="search" size={16} color={iosSystemColors.systemGray} />
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={iosSystemColors.systemGray}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        style={[styles.input, { color: systemColors.label as string }]}
        accessibilityLabel={placeholder}
      />
      {text.length > 0 && (
        <Pressable onPress={handleClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
          <View style={styles.clearButton}>
            <Icon name="close" size={12} color={iosSystemColors.white} />
          </View>
        </Pressable>
      )}
    </View>
  );
});

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
    backgroundColor: iosSystemColors.systemGray,
    opacity: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
