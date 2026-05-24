import { Text as RNText, type TextProps as RNTextProps, type ColorValue, StyleSheet } from 'react-native';
import { textStyles, type TextVariant } from '../theme/typography';

export type { TextVariant };

type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorValue;
};

export const variantStyles = StyleSheet.create(textStyles);

export function Text({ variant = 'body', color, style, ...props }: TextProps) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.5}
      style={[variantStyles[variant], color ? { color } : undefined, style]}
      {...props}
    />
  );
}
