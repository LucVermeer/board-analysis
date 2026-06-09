import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/theme-provider';
import { useLightbulbToggle } from '../ble/use-lightbulb-toggle';
import { Icon } from '../Icon';
import { GlassToolbarAction } from './GlassActionToolbar';

/**
 * The lightbulb toolbar button that connects / disconnects the physical board's
 * LEDs over Bluetooth. Self-contained: reads the optional Bluetooth context and
 * renders nothing when BLE is unavailable (no board selected yet). The
 * connection is app-wide, so connecting here lights the wall once a climb is in
 * view. Used by both the Climbs and Discover chromes.
 */
export function LightbulbToolbarAction() {
  const { systemColors, brandColors } = useTheme();
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { bluetooth, connected, handlePress } = useLightbulbToggle();

  if (!bluetooth) return null;

  return (
    <GlassToolbarAction
      onPress={handlePress}
      accessibilityLabel={connected ? tCommon('lightControl.disconnect') : tSettings('ble.connectBoard')}
    >
      <Icon
        name={connected ? 'lightbulb.fill' : 'lightbulb'}
        size={23}
        color={connected ? brandColors.warning : systemColors.label}
      />
    </GlassToolbarAction>
  );
}
