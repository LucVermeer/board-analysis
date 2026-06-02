import { Text as RNText, type TextProps as RNTextProps, type ColorValue, StyleSheet } from 'react-native';
import { textStyles, type TextVariant } from '../theme/typography';
import { useOptionalTheme } from '../providers/theme-provider';

export type { TextVariant };

type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorValue;
};

export const variantStyles = StyleSheet.create(textStyles);

export function Text({ variant = 'body', color, style, ...props }: TextProps) {
  // Default to the adaptive label colour so uncoloured text is readable in
  // dark mode (RN's default text colour is a non-adaptive black). An explicit
  // `color` prop or a `style.color` still wins. `useOptionalTheme` keeps this
  // safe in the pre-provider error boundary (falls back to the RN default).
  const theme = useOptionalTheme();
  const resolvedColor = color ?? theme?.systemColors.label;

  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.5}
      style={[variantStyles[variant], resolvedColor != null ? { color: resolvedColor } : undefined, style]}
      {...props}
    />
  );
}
