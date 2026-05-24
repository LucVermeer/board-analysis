import { ActivityIndicator as RNActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { brandColors } from '../theme/colors';

type Props = Omit<ActivityIndicatorProps, 'color'> & {
  color?: string;
};

export function ActivityIndicator({ color = brandColors.primary, ...props }: Props) {
  return <RNActivityIndicator color={color} {...props} />;
}
