import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { GlassSurface } from './GlassSurface';
import { useTheme } from '../providers/theme-provider';
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
  /** Seeds the field on mount — reflects a restored per-board search. */
  initialValue?: string;
  /** Capsule height (defaults to 44). The bottom toolbar passes 56 so the
   *  expanded field matches its FABs. The radius tracks height/2 for a pill. */
  height?: number;
};

/**
 * The climb-name search field, styled as a Liquid Glass capsule for the
 * climb-list search row. The glass fills a clipped pill behind the magnifier +
 * input; it degrades to a solid `systemColors.fill` capsule on Android / Reduce
 * Transparency / cold-start via GlassSurface. Keeps an imperative handle so the
 * screen can blur it and seed restored text without a remount.
 */
export const SearchHeader = forwardRef<SearchHeaderHandle, SearchHeaderProps>(function SearchHeader(
  { placeholder, onChangeText, onFocus, onBlur, initialValue = '', height = 44 },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const { systemColors } = useTheme();
  const [text, setText] = useState(initialValue);
  const radius = height / 2;

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
    <View style={[styles.capsule, { height, borderRadius: radius }]}>
      <GlassSurface
        glassEffectStyle="regular"
        fallbackColor={systemColors.fill}
        borderRadius={radius}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.content, { height }]}>
        <Icon name="search" size={18} color={iosSystemColors.systemGray} />
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
    </View>
  );
});

const styles = StyleSheet.create({
  capsule: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 14,
    gap: 6,
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
