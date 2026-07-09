'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { BOULDER_GRADES } from '@boardsesh/board-constants/boulder-grade-mapping';
import {
  BOARDSESH_GRADE,
  type BoardseshGradeResponse,
  type BoardseshGradeVariables,
} from '@boardsesh/graphql/operations/boardsesh-grade';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { themeTokens } from '@/app/theme/theme-config';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import { deriveBoardseshGradeView, isMoonBoard, type BoardseshGradeView } from './boardsesh-grade-view';

const GRADE_NAME_BY_ID: Map<number, string> = new Map(
  BOULDER_GRADES.map((grade) => [grade.difficulty_id, grade.difficulty_name]),
);

function difficultyNameFor(difficultyId: number): string | null {
  return GRADE_NAME_BY_ID.get(difficultyId) ?? null;
}

type BoardseshGradeSectionProps = {
  boardName?: string;
  climbUuid: string;
  angle: number;
};

export default function BoardseshGradeSection({ boardName, climbUuid, angle }: BoardseshGradeSectionProps) {
  const { t } = useTranslation('climbs');
  const isDark = useIsDarkMode();
  const { formatGrade, getGradeColor, loaded: gradeFormatLoaded } = useGradeFormat();

  const moonBoard = isMoonBoard(boardName);

  const {
    data: grade,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['boardseshGrade', boardName, climbUuid, angle],
    queryFn: async () => {
      const client = createGraphQLHttpClient();
      const result = await client.request<BoardseshGradeResponse, BoardseshGradeVariables>(BOARDSESH_GRADE, {
        boardName: boardName ?? '',
        climbUuid,
        angle,
      });
      return result.boardseshGrade;
    },
    // MoonBoard has no grade feed yet — never hit the network for it.
    enabled: !moonBoard && !!boardName && !!climbUuid,
    staleTime: 5 * 60 * 1000,
  });

  const view: BoardseshGradeView = useMemo(
    () => deriveBoardseshGradeView({ boardName, grade: grade ?? null }),
    [boardName, grade],
  );

  if (view.kind === 'moonboard') {
    return <MessageBlock title={t('boardseshGrade.moonboardTitle')} body={t('boardseshGrade.moonboardBody')} />;
  }

  if (isLoading || !gradeFormatLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (isError) {
    return <MessageBlock body={t('boardseshGrade.loadError')} />;
  }

  if (view.kind === 'setterOnly') {
    return <MessageBlock body={t('boardseshGrade.setterOnly')} />;
  }

  // Confirmed / provisional both render a coloured primary grade.
  const primaryName = difficultyNameFor(view.difficultyId);
  const primaryLabel = formatGrade(primaryName);
  if (!primaryLabel) {
    return <MessageBlock body={t('boardseshGrade.setterOnly')} />;
  }
  const gradeColor = getGradeColor(primaryName, isDark) ?? undefined;

  let gradeText = primaryLabel;
  if (view.kind === 'provisional' && view.isRange) {
    const lowLabel = formatGrade(difficultyNameFor(view.lowDifficultyId));
    const highLabel = formatGrade(difficultyNameFor(view.highDifficultyId));
    if (lowLabel && highLabel) {
      gradeText = `${lowLabel}–${highLabel}`;
    }
  }

  const scopeLabel = view.scope === 'universal' ? t('boardseshGrade.universalLabel') : t('boardseshGrade.localLabel');
  const comparisonName = view.comparisonDifficultyId == null ? null : difficultyNameFor(view.comparisonDifficultyId);
  const comparisonLabel = comparisonName == null ? null : formatGrade(comparisonName);

  const subline =
    view.kind === 'confirmed'
      ? t('boardseshGrade.confirmedSubline', { count: view.ascensionistCount })
      : t('boardseshGrade.provisionalSubline', { count: view.ascensionistCount });

  // The hold-geometry (Climb2Vec) grade estimate, shown alongside the community
  // grade so climbers can see both ways of estimating difficulty.
  const geometryName = grade?.contentGrade == null ? null : difficultyNameFor(Math.round(grade.contentGrade));
  const geometryLabel = geometryName == null ? null : formatGrade(geometryName);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: `${themeTokens.spacing[3]}px`, py: 1 }}>
      <Typography
        component="span"
        sx={{
          fontSize: themeTokens.typography.fontSize['3xl'],
          fontWeight: themeTokens.typography.fontWeight.bold,
          lineHeight: 1,
          color: gradeColor ?? 'text.primary',
          flexShrink: 0,
        }}
      >
        {gradeText}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            fontSize: themeTokens.typography.fontSize.sm,
            fontWeight: themeTokens.typography.fontWeight.semibold,
          }}
        >
          {scopeLabel}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary">
          {subline}
        </Typography>
        {comparisonLabel && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: '2px' }}>
            {t('boardseshGrade.universalComparison', { grade: comparisonLabel })}
          </Typography>
        )}
        {view.scope === 'local' && !view.hasUniversalGrade && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: '2px' }}>
            {t('boardseshGrade.localScopeNote')}
          </Typography>
        )}
        {geometryLabel && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: '2px' }}>
            {t('boardseshGrade.geometryEstimate', { grade: geometryLabel })}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function MessageBlock({ title, body }: { title?: string; body: string }) {
  return (
    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {title && (
        <Typography
          component="span"
          sx={{
            fontSize: themeTokens.typography.fontSize.base,
            fontWeight: themeTokens.typography.fontWeight.semibold,
          }}
        >
          {title}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Box>
  );
}
