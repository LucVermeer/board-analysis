import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolView } from 'expo-symbols';
import { Platform } from 'react-native';
import { iconMap, type IconName } from './icon-map';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string | import('react-native').OpaqueColorValue;
};

// iOS renders native SF Symbols (expo-symbols); Android keeps MaterialCommunityIcons.
// Both glyph names live in icon-map.ts keyed by the same semantic IconName, so call
// sites stay platform-agnostic.
export function Icon({ name, size = 24, color }: IconProps) {
  const mapping = iconMap[name];

  if (Platform.OS === 'ios') {
    return <SymbolView name={mapping.ios} size={size} tintColor={color} />;
  }

  return (
    <MaterialCommunityIcons
      name={mapping.android as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={size}
      color={color}
    />
  );
}
