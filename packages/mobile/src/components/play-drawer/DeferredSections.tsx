import { memo, useEffect, useRef, useState } from 'react';
import { InteractionManager, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { CollapsibleSection } from './CollapsibleSection';
import { LogbookSection } from './LogbookSection';
import { SimilarClimbsSection } from './SimilarClimbsSection';
import { CommunitySection } from './CommunitySection';
import { BetaVideosSection } from './BetaVideosSection';
import { spacing } from '../../theme/tokens';

type DeferredSectionsProps = {
  climb: Climb;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  enabled: boolean;
  onSimilarClimbPress: (climb: Climb) => void;
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
}: DeferredSectionsProps) {
  const { t } = useTranslation('session');
  const [readyToRender, setReadyToRender] = useState(false);
  const previousClimbUuid = useRef(climb.uuid);

  // Both effects key on climb.uuid. React runs effects in declaration order
  // within the same commit, so the reset below always fires before the
  // InteractionManager re-schedule — readyToRender goes false, then the
  // deferred callback sets it back to true after animations settle.
  useEffect(() => {
    if (climb.uuid !== previousClimbUuid.current) {
      previousClimbUuid.current = climb.uuid;
      setReadyToRender(false);
    }
  }, [climb.uuid]);

  useEffect(() => {
    if (!enabled) {
      setReadyToRender(false);
      return;
    }

    const handle = InteractionManager.runAfterInteractions(() => {
      setReadyToRender(true);
    });

    return () => {
      handle.cancel();
    };
  }, [enabled, climb.uuid]);

  if (!readyToRender || !enabled) {
    return null;
  }

  return (
    <View style={styles.container}>
      <CollapsibleSection title={t('mobile.betaVideos.title')} keepExpanded>
        <BetaVideosSection climbUuid={climb.uuid} boardName={boardName} angle={angle} />
      </CollapsibleSection>

      <CollapsibleSection title={t('mobile.logbook.title')} defaultExpanded>
        <LogbookSection
          climbUuid={climb.uuid}
          boardName={boardName}
          angle={angle}
          userAscents={climb.userAscents}
          userAttempts={climb.userAttempts}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('mobile.community.title')} defaultExpanded>
        <CommunitySection
          climbUuid={climb.uuid}
          boardName={boardName}
          angle={angle}
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
