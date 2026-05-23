import { Text as RNText, type TextProps as RNTextProps, type ColorValue, StyleSheet } from 'react-native';

export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2';

type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorValue;
};

const variantStyles = StyleSheet.create({
  largeTitle: { fontSize: 34, fontWeight: '700', lineHeight: 41 },
  title1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  title2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  title3: { fontSize: 20, fontWeight: '600', lineHeight: 25 },
  headline: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 17, fontWeight: '400', lineHeight: 22 },
  callout: { fontSize: 16, fontWeight: '400', lineHeight: 21 },
  subheadline: { fontSize: 15, fontWeight: '400', lineHeight: 20 },
  footnote: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption1: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  caption2: { fontSize: 11, fontWeight: '400', lineHeight: 13 },
});

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
