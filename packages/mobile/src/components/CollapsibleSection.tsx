import { type ReactNode, useCallback, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { hapticSelection } from '../lib/haptics';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing, borderRadius } from '../theme/tokens';
import { timing } from '../theme/animations';

type CollapsibleSectionProps = {
  title: string;
  defaultExpanded?: boolean;
  /**
   * When true the section header has no chevron and cannot be collapsed by
   * the user. Mirrors the web `keepExpanded` flag used for hero sections
   * (e.g. Beta Videos) where users should always see the content.
   */
  keepExpanded?: boolean;
  /** Optional trailing action rendered in the header (e.g. an Attach button). */
  headerAction?: ReactNode;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  keepExpanded = false,
  headerAction,
  children,
}: CollapsibleSectionProps) {
  if (keepExpanded) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headline" style={styles.title}>
            {title}
          </Text>
          {headerAction}
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <CollapsibleSectionInternal title={title} defaultExpanded={defaultExpanded} headerAction={headerAction}>
      {children}
    </CollapsibleSectionInternal>
  );
}

function CollapsibleSectionInternal({
  title,
  defaultExpanded,
  headerAction,
  children,
}: {
  title: string;
  defaultExpanded: boolean;
  headerAction: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const chevronRotation = useSharedValue(defaultExpanded ? 1 : 0);

  const toggleExpanded = useCallback(() => {
    hapticSelection();
    setExpanded((prev) => {
      const next = !prev;
      chevronRotation.value = withTiming(next ? 1 : 0, { duration: timing.normal });
      return next;
    });
  }, [chevronRotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}
      >
        <Text variant="headline" style={styles.title}>
          {title}
        </Text>
        {headerAction}
        <Animated.View style={chevronStyle}>
          <Icon name="chevron.down" size={16} color={iosSystemColors.systemGray} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.content}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    backgroundColor: `${iosSystemColors.systemGray}14`,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  title: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
});
