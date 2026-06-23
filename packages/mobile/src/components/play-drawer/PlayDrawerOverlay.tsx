import { type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { GlassSurface } from '../GlassSurface';
import { useTheme } from '../../providers/theme-provider';
import { playDrawerMaterialTint } from '../../theme/colors';

// iOS portals above the persistent queue bar + native tab bar/accessory via a
// window-level overlay; Android uses a transparent Modal (which also gives a
// hardware-back handler). Same split as ClimbReactionMenu's OverlayPortal — the
// proven way to paint above the UIKit chrome without a UIViewController modal
// (so the @expo/ui sub-drawer .sheet()s still present cleanly over the player).
function OverlayPortal({ children, onRequestClose }: { children: ReactNode; onRequestClose: () => void }) {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return (
    <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

type PlayDrawerOverlayProps = {
  /** 0 = fully off-screen (hidden), 1 = fully open. Owned by PlayDrawer so the
   *  deferred-open machinery and the drag-to-dismiss gesture can drive it. */
  progress: SharedValue<number>;
  /** Android hardware-back / Modal onRequestClose. */
  onRequestClose: () => void;
  children: ReactNode;
};

/**
 * Full-screen "now playing" presentation shell for the PlayDrawer (Spotify-style
 * track view). Renders a window-level overlay that covers the tab bar + native
 * bottom accessory, with an edge-to-edge glass/material background and a
 * reanimated slide driven by `progress`. Replaces the native bottom sheet, which
 * could only render as a card (top gap + rounded corners + system background).
 */
export function PlayDrawerOverlay({ progress, onRequestClose, children }: PlayDrawerOverlayProps) {
  const { systemColors, colorScheme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * windowHeight }],
  }));

  return (
    <OverlayPortal onRequestClose={onRequestClose}>
      <Animated.View style={[StyleSheet.absoluteFill, slideStyle]}>
        {/* Edge-to-edge glass/material background with NO radius — the deleted
            GlassSheetBackground's flatTop + opaqueMaterial look, full-screen.
            GlassSurface resolves Liquid Glass / blur / Material / Reduce-
            Transparency-solid per device, so this works on every variant. */}
        <GlassSurface
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          role="low"
          fallbackColor={systemColors.secondaryBackground}
          tintColor={playDrawerMaterialTint[colorScheme]}
        />
        {children}
      </Animated.View>
    </OverlayPortal>
  );
}
