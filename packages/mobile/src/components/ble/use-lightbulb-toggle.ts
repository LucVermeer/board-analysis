import { useCallback } from 'react';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { hapticLight } from '../../lib/haptics';

/**
 * Shared press behaviour for the toolbar lightbulbs (iOS glass toolbar and
 * Android app bar): toggle the app-wide BLE connection, ignoring taps while a
 * connect is in flight, and silently reconnecting to the remembered board for
 * the current config instead of always opening the picker. `bluetooth` is null
 * when no board is selected yet — callers render nothing in that case.
 */
export function useLightbulbToggle() {
  const bluetooth = useOptionalBluetoothContext();
  const connected = bluetooth?.isConnected ?? false;

  const handlePress = useCallback(() => {
    if (!bluetooth) return;
    // The hook's own in-flight guard is what actually prevents a double
    // connect; skipping here just avoids a misleading haptic on a dead tap.
    if (bluetooth.loading) return;
    hapticLight();
    if (bluetooth.isConnected) {
      void bluetooth.disconnect();
    } else {
      void bluetooth.connect(undefined, undefined, bluetooth.reconnectSerialForCurrentBoard ?? undefined);
    }
  }, [bluetooth]);

  return { bluetooth, connected, handlePress };
}
