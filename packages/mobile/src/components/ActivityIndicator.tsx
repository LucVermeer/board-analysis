import { ActivityIndicator as RNActivityIndicator, type ActivityIndicatorProps } from 'react-native';

type Props = Omit<ActivityIndicatorProps, 'color'> & {
  color?: string;
};

export function ActivityIndicator({ color = '#8C4A52', ...props }: Props) {
  return <RNActivityIndicator color={color} {...props} />;
}
