import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const supportsHaptics = Platform.OS === 'ios' || Platform.OS === 'android';

/** Subtle tick for selection changes (pickers, segmented controls). */
export function hapticSelection(): void {
  if (supportsHaptics) {
    void Haptics.selectionAsync();
  }
}

/** Light tap for minor UI interactions (toggle, checkbox). */
export function hapticLight(): void {
  if (supportsHaptics) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Medium tap for standard interactions (button press, swipe action). */
export function hapticMedium(): void {
  if (supportsHaptics) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/** Heavy tap for significant interactions (drag drop, destructive actions). */
export function hapticHeavy(): void {
  if (supportsHaptics) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

/** Success notification (climb logged, action completed). */
export function hapticSuccess(): void {
  if (supportsHaptics) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/** Error notification (validation failure, network error). */
export function hapticError(): void {
  if (supportsHaptics) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/** Warning notification (destructive confirmation, rate limit). */
export function hapticWarning(): void {
  if (supportsHaptics) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
}
