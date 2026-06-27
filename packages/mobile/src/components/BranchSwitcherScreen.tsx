import { useState, useCallback, useEffect, useRef } from 'react';
import { View, ScrollView, ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from './Text';
import { SectionHeader } from './SectionHeader';
import { ListRow } from './ListRow';
import { Icon } from './Icon';
import { InfoRow } from './InfoRow';
import { useTheme } from '../providers/theme-provider';
import { useConfirm } from '../providers/dialog-provider';
import { hapticLight, hapticError } from '../lib/haptics';
import { reportHandledError } from '../lib/error-reporting';
import { getPreference, setPreference, removePreference } from '../lib/preference-store';
import { applyChannelOverride } from '../lib/apply-channel-override';
import {
  OTA_CHANNEL_OVERRIDE_KEY,
  buildChannelList,
  performChannelSwitch,
  performChannelReset,
  type ChannelSwitchDeps,
} from '../lib/channel-switch';
import { isPreviewBuild } from '../lib/preview-build';

// The branch baked into the running update's manifest metadata (set by the OTA
// server). Read-only and tokenless — surfaced so a tester can see which branch
// they're on before switching.
function getCurrentBranchName(): string | null {
  const manifest = Updates.manifest;
  if (!manifest || typeof manifest !== 'object') return null;

  if ('metadata' in manifest) {
    const metadata = (manifest as { metadata?: Record<string, unknown> }).metadata;
    if (metadata && typeof metadata.branchName === 'string') {
      return metadata.branchName;
    }
  }

  return null;
}

// Preview-build sibling of the tester OTA Channel Switcher. Both repoint the
// running build at a different update target device-locally — overriding only the
// `expo-channel-name` request header (no EAS API token, no project-wide channel
// remap) — so they share the same override key and the same commit/revert state
// machine in `channel-switch.ts`. This screen is framed around branches: a tester
// picks a preview channel/branch (or types one) and the build pulls that branch's
// OTA on restart.
export function BranchSwitcherScreen() {
  const { systemColors, spacing, borderRadius } = useTheme();
  const confirm = useConfirm();
  const [override, setOverride] = useState<string | null>(null);
  const [customBranch, setCustomBranch] = useState('');
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  // Synchronous re-entrancy guard: `switchingTo` only updates after the async
  // confirm dialog resolves, so a ref blocks a second switch starting while the
  // dialog (or an in-flight switch) is open.
  const inFlightRef = useRef(false);
  // Mirror of `override` for the imperative revert path — reading the latest value
  // from a ref avoids reverting to a stale render-closure value if the mount load
  // resolved after a callback was created.
  const overrideRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPreference<string>(OTA_CHANNEL_OVERRIDE_KEY).then((stored) => {
      if (active) setOverride(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    overrideRef.current = override;
  }, [override]);

  const preview = isPreviewBuild();
  const buildChannel = Updates.channel ?? 'unknown';
  const currentBranch = getCurrentBranchName();
  const currentUpdateId = Updates.updateId ?? null;
  const runtimeVersion = Updates.runtimeVersion ?? 'unknown';
  const isEmbedded = Updates.isEmbeddedLaunch;
  const updatesUsable = Updates.isEnabled && !__DEV__;
  const isSwitching = switchingTo !== null;
  // The branch/channel currently targeted: the live override, else the build channel.
  const activeTarget = override ?? buildChannel;

  const makeDeps = useCallback(
    (): ChannelSwitchDeps => ({
      applyOverride: applyChannelOverride,
      checkForUpdate: () => Updates.checkForUpdateAsync(),
      fetchUpdate: () => Updates.fetchUpdateAsync(),
      reload: () => Updates.reloadAsync(),
      writeMirror: (channel) => setPreference(OTA_CHANNEL_OVERRIDE_KEY, channel),
      clearMirror: () => removePreference(OTA_CHANNEL_OVERRIDE_KEY),
      onMirrorError: reportHandledError,
    }),
    [],
  );

  const switchToBranch = useCallback(
    async (branch: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const previousOverride = overrideRef.current;
      try {
        hapticLight();
        const confirmed = await confirm({
          // i18n-ignore-next-line — preview-only dev screen
          title: 'Switch branch',
          // i18n-ignore-next-line
          message: `Pull the latest update from "${branch}" and restart? It must have an update published for this build's fingerprint.`,
          // i18n-ignore-next-line
          confirmLabel: 'Switch',
          // i18n-ignore-next-line
          cancelLabel: 'Cancel',
        });
        if (!confirmed) return;

        setSwitchingTo(branch);
        const result = await performChannelSwitch(branch, previousOverride, runtimeVersion, makeDeps());
        if (result.status === 'reverted') {
          hapticError();
          Alert.alert(
            // i18n-ignore-next-line
            'Switch failed',
            result.error instanceof Error
              ? result.error.message
              : // i18n-ignore-next-line
                'Could not switch branch. This build may not support OTA overrides.',
          );
        } else {
          // 'switched' (the app reloads) or 'pending-restart' — reflect the new branch.
          setOverride(branch);
          if (result.status === 'pending-restart') {
            // i18n-ignore-next-line
            Alert.alert('Restart to finish', `Downloaded "${branch}". Restart the app to switch onto it.`);
          }
        }
      } finally {
        setSwitchingTo(null);
        inFlightRef.current = false;
      }
    },
    [confirm, runtimeVersion, makeDeps],
  );

  const resetToBuildBranch = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const previousOverride = overrideRef.current;
    try {
      hapticLight();
      const confirmed = await confirm({
        // i18n-ignore-next-line
        title: 'Reset to build branch',
        // i18n-ignore-next-line
        message: `Clear the override and return to "${buildChannel}"? The app will restart.`,
        // i18n-ignore-next-line
        confirmLabel: 'Reset',
        // i18n-ignore-next-line
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      setSwitchingTo(buildChannel);
      const result = await performChannelReset(previousOverride, makeDeps());
      if (result.status === 'failed') {
        hapticError();
        const stayedOn = previousOverride ?? buildChannel;
        const reason = result.error instanceof Error ? result.error.message : 'Could not reset branch.';
        // i18n-ignore-next-line
        Alert.alert('Reset failed', `${reason} Stayed on "${stayedOn}".`);
      } else {
        setOverride(null);
        if (result.status === 'pending-restart') {
          // i18n-ignore-next-line
          Alert.alert('Restart to finish', `Cleared the override. Restart the app to return to "${buildChannel}".`);
        }
      }
    } finally {
      setSwitchingTo(null);
      inFlightRef.current = false;
    }
  }, [confirm, buildChannel, makeDeps]);

  if (!preview) {
    return null;
  }

  const branches = buildChannelList(override);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      {/* i18n-ignore-next-line */}
      <SectionHeader title="Current Update" />
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
        {isEmbedded ? (
          // i18n-ignore-next-line
          <InfoRow label="Status" value="No OTA update applied" />
        ) : null}
        {/* i18n-ignore-next-line */}
        <InfoRow label="Build channel" value={buildChannel} />
        {/* i18n-ignore-next-line */}
        <InfoRow label="Selected branch" value={override ?? `${buildChannel} (default)`} />
        {currentBranch ? (
          // i18n-ignore-next-line
          <InfoRow label="Running branch" value={currentBranch} />
        ) : null}
        {currentUpdateId ? (
          // i18n-ignore-next-line
          <InfoRow label="Update ID" value={currentUpdateId.slice(0, 8)} />
        ) : null}
        {/* i18n-ignore-next-line */}
        <InfoRow label="Runtime version" value={runtimeVersion} showSeparator={false} />
      </View>

      {!updatesUsable ? (
        <View style={[styles.notice, { marginHorizontal: spacing[4] }]}>
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {/* i18n-ignore-next-line */}
            OTA updates are disabled in this build (development or updates not enabled), so branch switching is
            unavailable here.
          </Text>
        </View>
      ) : (
        <>
          {/* i18n-ignore-next-line */}
          <SectionHeader title="Switch Branch" />
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
            {branches.map((branch, index) => {
              const isActive = branch === activeTarget;
              const isThisSwitching = switchingTo === branch;
              const isDisabled = isSwitching && !isThisSwitching;
              const trailing = isThisSwitching ? (
                <ActivityIndicator size="small" />
              ) : isActive ? (
                <Icon name="check.small" size={20} color={systemColors.label} />
              ) : null;

              return (
                <ListRow
                  key={branch}
                  title={branch}
                  trailing={trailing}
                  onPress={isActive || isDisabled ? undefined : () => void switchToBranch(branch)}
                  showSeparator={index < branches.length - 1}
                  style={isDisabled ? styles.disabledRow : undefined}
                />
              );
            })}
          </View>

          {/* i18n-ignore-next-line */}
          <SectionHeader title="Custom Branch" />
          <View style={[styles.customRow, { marginHorizontal: spacing[4] }]}>
            <TextInput
              value={customBranch}
              onChangeText={setCustomBranch}
              // i18n-ignore-next-line
              placeholder="branch name"
              placeholderTextColor={systemColors.secondaryLabel}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSwitching}
              // i18n-ignore-next-line
              accessibilityLabel="Custom branch name"
              style={[
                styles.input,
                {
                  color: systemColors.label,
                  backgroundColor: systemColors.secondaryBackground,
                  borderRadius: borderRadius.md,
                },
              ]}
            />
            <Pressable
              onPress={() => {
                const trimmed = customBranch.trim();
                if (trimmed) void switchToBranch(trimmed);
              }}
              disabled={isSwitching || customBranch.trim().length === 0}
              accessibilityRole="button"
              // i18n-ignore-next-line
              accessibilityLabel="Switch to the entered branch"
              accessibilityState={{ disabled: isSwitching || customBranch.trim().length === 0 }}
              style={[
                styles.goButton,
                {
                  backgroundColor: systemColors.tertiaryBackground,
                  borderRadius: borderRadius.md,
                  opacity: isSwitching || customBranch.trim().length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Icon name="transfer" size={16} color={systemColors.label} />
              <Text variant="footnote" color={systemColors.label}>
                {/* i18n-ignore-next-line */}
                Switch
              </Text>
            </Pressable>
          </View>

          {/* Always offered (not gated on `override`) so a native override stranded
              after an app-data clear — when the display mirror is gone — stays
              clearable. */}
          <Pressable
            onPress={() => void resetToBuildBranch()}
            disabled={isSwitching}
            accessibilityRole="button"
            // i18n-ignore-next-line
            accessibilityLabel="Reset to build branch"
            accessibilityState={{ disabled: isSwitching }}
            style={[styles.resetButton, { marginHorizontal: spacing[4], opacity: isSwitching ? 0.5 : 1 }]}
          >
            <Icon name="refresh" size={16} color={systemColors.label} />
            <Text variant="footnote" color={systemColors.label}>
              {/* i18n-ignore-next-line */}
              Reset to build branch ({buildChannel})
            </Text>
          </Pressable>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    overflow: 'hidden',
  },
  notice: {
    paddingVertical: 16,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 16,
  },
  disabledRow: {
    opacity: 0.5,
  },
  bottomSpacer: {
    height: 40,
  },
});
