import { View, Platform, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { Text } from './Text';
import { SectionHeader } from './SectionHeader';
import { useTheme } from '../providers/theme-provider';

type DevMetadata = {
  branchName: string | null;
  qaNotes: string | null;
  qaNotesFilePath: string | null;
};

function getDevMetadata(): DevMetadata | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object' || !('devMetadata' in extra)) {
    return null;
  }
  return extra.devMetadata as DevMetadata;
}

export function DevMetadataPanel() {
  const { systemColors, spacing, borderRadius } = useTheme();

  if (!__DEV__) {
    return null;
  }

  const devMetadata = getDevMetadata();

  if (!devMetadata) {
    return null;
  }

  const { branchName, qaNotes, qaNotesFilePath } = devMetadata;

  if (!branchName && !qaNotes) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <SectionHeader title="Dev Build" />
      <View
        style={[
          styles.card,
          {
            backgroundColor: systemColors.secondaryBackground,
            borderRadius: borderRadius.lg,
            marginHorizontal: spacing[4],
          },
        ]}
      >
        {branchName ? (
          <View style={styles.row}>
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              Branch
            </Text>
            <Text variant="footnote" color={systemColors.label} style={styles.monospace} selectable>
              {branchName}
            </Text>
          </View>
        ) : null}

        {branchName && qaNotes ? (
          <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />
        ) : null}

        {qaNotes ? (
          <View style={styles.notesSection}>
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              QA Notes
            </Text>
            <Text variant="caption1" color={systemColors.label} style={styles.notesText} selectable>
              {qaNotes}
            </Text>
            {qaNotesFilePath ? (
              <Text variant="caption2" color={systemColors.tertiaryLabel} style={styles.filePath} selectable>
                {qaNotesFilePath}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monospace: {
    ...Platform.select({
      ios: { fontFamily: 'Menlo' },
      android: { fontFamily: 'monospace' },
    }),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  notesSection: {
    gap: 4,
  },
  notesText: {
    marginTop: 4,
  },
  filePath: {
    marginTop: 2,
    ...Platform.select({
      ios: { fontFamily: 'Menlo' },
      android: { fontFamily: 'monospace' },
    }),
  },
});
