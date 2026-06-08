import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { CollapsibleSection } from '../CollapsibleSection';
import { LogbookSection } from './LogbookSection';
import { SimilarClimbsSection } from './SimilarClimbsSection';
import { CommunitySection } from './CommunitySection';
import { BetaVideosSection } from './BetaVideosSection';
import { spacing } from '../../theme/tokens';
import { useDeferredAfterInteractions } from '../../hooks/use-deferred-after-interactions';

type DeferredSectionsProps = {
  climb: Climb;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  enabled: boolean;
  onSimilarClimbPress: (climb: Climb) => void;
  /** Reports the measured height of the Beta Videos section header (drives the play
   *  drawer's first-screen reserve so the header teases at the bottom of the fold). */
  onBetaHeaderLayout?: (height: number) => void;
};

/**
 * Below-fold deferred content for the play drawer.
 * Uses InteractionManager.runAfterInteractions() to defer rendering
 * until after the drawer open animation completes, preventing jank.
 */
export const DeferredSections = memo(function DeferredSections({
  climb,
  boardName,
  layoutId,
  sizeId,
  setIds,
  angle,
  enabled,
  onSimilarClimbPress,
  onBetaHeaderLayout,
}: DeferredSectionsProps) {
  const { t } = useTranslation('session');
  // Defer the JS-heavy below-fold sections until just after the drawer's open
  // animation. Re-defers per climb (resetKey = uuid) and — unlike a bare
  // runAfterInteractions — falls back to a bounded timeout, so a starved
  // interaction queue can't leave these sections blank until the drawer reopens.
  const readyToRender = useDeferredAfterInteractions(enabled, climb.uuid);

  // Tally shown next to the collapsed Logbook header so the user sees their
  // history without expanding. Mirrors LogbookSection's summary fallback.
  const logbookSummary = useMemo(() => {
    const sends = climb.userAscents ?? 0;
    const attempts = climb.userAttempts ?? 0;
    if (sends > 0 && attempts > 0) return t('mobile.logbook.sendsAndAttempts', { sends, attempts });
    if (sends > 0) return t('mobile.logbook.sendsOnly', { sends });
    if (attempts > 0) return t('mobile.logbook.attemptsOnly', { attempts });
    return null;
  }, [climb.userAscents, climb.userAttempts, t]);

  if (!enabled) {
    return null;
  }

  // Beta Videos section renders eagerly so its header height is laid out
  // immediately — this is what drives the play drawer's first-screen reserve
  // (the header teases at the bottom of the fold). Without eager render the
  // reserve would only settle after InteractionManager fires, causing the board
  // to visibly resize on first open. BetaVideosSection's data fetch is React
  // Query and cheap to schedule; only the JS-heavy sub-sections wait below.
  return (
    <View style={styles.container}>
      <CollapsibleSection title={t('mobile.betaVideos.title')} keepExpanded onHeaderLayout={onBetaHeaderLayout}>
        <BetaVideosSection climbUuid={climb.uuid} boardName={boardName} angle={angle} />
      </CollapsibleSection>

      {readyToRender && (
        <>
          <CollapsibleSection title={t('mobile.logbook.title')} summary={logbookSummary}>
            <LogbookSection
              climbUuid={climb.uuid}
              boardName={boardName}
              userAscents={climb.userAscents}
              userAttempts={climb.userAttempts}
            />
          </CollapsibleSection>

          <CollapsibleSection title={t('mobile.community.title')} defaultExpanded>
            <CommunitySection
              climbUuid={climb.uuid}
              boardName={boardName}
              qualityAverage={climb.quality_average}
              ascensionistCount={climb.ascensionist_count}
            />
          </CollapsibleSection>

          <CollapsibleSection title={t('mobile.similarClimbs.title')}>
            <SimilarClimbsSection
              climbUuid={climb.uuid}
              boardName={boardName}
              layoutId={layoutId}
              sizeId={sizeId}
              setIds={setIds}
              angle={angle}
              onClimbPress={onSimilarClimbPress}
            />
          </CollapsibleSection>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
  },
});
