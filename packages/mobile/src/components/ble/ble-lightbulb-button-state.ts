import type { IconName } from '../icon-map';

type BleLightbulbVisualStateInput = {
  isConnected: boolean;
  connectedColor: string;
  disconnectedColor: string;
};

type BleLightbulbVisualState = {
  iconName: IconName;
  iconColor: string;
  backgroundColor?: string;
  shadowColor?: string;
};

export function getBleLightbulbVisualState({
  isConnected,
  connectedColor,
  disconnectedColor,
}: BleLightbulbVisualStateInput): BleLightbulbVisualState {
  if (!isConnected) {
    return {
      iconName: 'lightbulb',
      iconColor: disconnectedColor,
    };
  }

  return {
    iconName: 'lightbulb.fill',
    iconColor: connectedColor,
    backgroundColor: `${connectedColor}24`,
    shadowColor: connectedColor,
  };
}

export function getBleLightbulbAccessibilityHint(
  isScanning: boolean,
  scanningAccessibilityHint?: string,
): string | undefined {
  return isScanning ? scanningAccessibilityHint : undefined;
}
