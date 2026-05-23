import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { iconMap, type IconName } from './icon-map';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  weight?: 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
};

export function Icon({ name, size = 24, color, weight: _weight }: IconProps) {
  const mapping = iconMap[name];

  // TODO: Use expo-symbols (SymbolView) on iOS once we have a dev client build.
  // SF Symbols require native code that doesn't work in Expo Go.
  // For now, use MaterialCommunityIcons on both platforms.
  // The Icon component API is stable — swapping the implementation later is a one-file change.

  const iconName = mapping.android;

  return (
    <MaterialCommunityIcons
      name={iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={size}
      color={color}
    />
  );
}
