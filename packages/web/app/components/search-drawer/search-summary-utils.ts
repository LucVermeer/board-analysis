import type { SearchRequestPagination } from '@/app/lib/types';
import { TENSION_KILTER_GRADES } from '@/app/lib/board-data';
import { DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';
import { normalizeMinRatingFilter } from '@/app/lib/climb-quality-filter-options';

type SearchSummaryTranslate = (key: string, options?: Record<string, unknown>) => string;

function getGradeName(gradeId: number, labels: ClimbSummaryLabels): string {
  const grade = TENSION_KILTER_GRADES.find((g) => g.difficulty_id === gradeId);
  return grade?.v_grade ?? labels.gradeFallback(gradeId);
}

export function hasActiveFilters(params: SearchRequestPagination): boolean {
  return Object.entries(params).some(([key, value]) => {
    if (key === 'holdsFilter') {
      return Object.keys(value || {}).length > 0;
    }
    if (key === 'zoneBox') {
      return value !== null;
    }
    if (key === 'zoneMode') {
      return params.zoneBox !== null && value !== DEFAULT_SEARCH_PARAMS.zoneMode;
    }
    return value !== DEFAULT_SEARCH_PARAMS[key as keyof typeof DEFAULT_SEARCH_PARAMS];
  });
}

export function hasActiveNonNameFilters(params: SearchRequestPagination): boolean {
  return Object.entries(params).some(([key, value]) => {
    if (key === 'name') return false;
    if (key === 'holdsFilter') {
      return Object.keys(value || {}).length > 0;
    }
    if (key === 'zoneBox') {
      return value !== null;
    }
    if (key === 'zoneMode') {
      return params.zoneBox !== null && value !== DEFAULT_SEARCH_PARAMS.zoneMode;
    }
    return value !== DEFAULT_SEARCH_PARAMS[key as keyof typeof DEFAULT_SEARCH_PARAMS];
  });
}

export type ClimbSummaryLabels = {
  gradeFallback: (gradeId: number) => string;
  upToGrade: (gradeName: string) => string;
  setterCount: (count: number) => string;
};

export function getClimbPanelSummary(params: SearchRequestPagination, labels: ClimbSummaryLabels): string[] {
  const parts: string[] = [];

  if (params.minGrade && params.maxGrade) {
    parts.push(`${getGradeName(params.minGrade, labels)}-${getGradeName(params.maxGrade, labels)}`);
  } else if (params.minGrade) {
    parts.push(`${getGradeName(params.minGrade, labels)}+`);
  } else if (params.maxGrade) {
    parts.push(labels.upToGrade(getGradeName(params.maxGrade, labels)));
  }

  if (params.name) {
    parts.push(`"${params.name}"`);
  }

  if (params.settername.length > 0) {
    parts.push(params.settername.length === 1 ? params.settername[0] : labels.setterCount(params.settername.length));
  }

  return parts;
}

export type QualitySummaryLabels = {
  ascents: (count: number) => string;
  rating: (rating: number) => string;
  classics: string;
  gradeAccuracy: string;
  tallClimbsOnly: string;
  wideClimbsOnly: string;
};

export function getQualityPanelSummary(params: SearchRequestPagination, labels: QualitySummaryLabels): string[] {
  const parts: string[] = [];

  // minAscents >= 2 is reflected by the Ascent Status "Established" chip; avoid dup.
  if (params.minAscents && params.minAscents < 2) {
    parts.push(labels.ascents(params.minAscents));
  }
  const minRating = normalizeMinRatingFilter(params.minRating);
  if (minRating) {
    parts.push(labels.rating(minRating));
  }
  if (params.onlyClassics) {
    parts.push(labels.classics);
  }

  if (params.gradeAccuracy && params.gradeAccuracy !== DEFAULT_SEARCH_PARAMS.gradeAccuracy) {
    parts.push(labels.gradeAccuracy);
  }
  if (params.onlyTallClimbs) {
    parts.push(labels.tallClimbsOnly);
  }
  if (params.onlyWideClimbs) {
    parts.push(labels.wideClimbsOnly);
  }

  return parts;
}

export type StatusSummaryLabels = {
  drafts: string;
  projects: string;
  established: string;
};

export function getStatusPanelSummary(params: SearchRequestPagination, labels: StatusSummaryLabels): string[] {
  if (params.onlyDrafts) return [labels.drafts];
  if (params.projectsOnly) return [labels.projects];
  if (params.minAscents >= 2) return [labels.established];
  return [];
}

export type UserSummaryLabels = {
  attempted: string;
  completed: string;
  hide: (filters: string) => string;
  only: (filters: string) => string;
};

export function getUserPanelSummary(params: SearchRequestPagination, labels: UserSummaryLabels): string[] {
  // Merge "Hide" filters into single entry
  const hideFilters: string[] = [];
  if (params.hideAttempted) hideFilters.push(labels.attempted);
  if (params.hideCompleted) hideFilters.push(labels.completed);

  // Merge "Only" filters into single entry
  const onlyFilters: string[] = [];
  if (params.showOnlyAttempted) onlyFilters.push(labels.attempted);
  if (params.showOnlyCompleted) onlyFilters.push(labels.completed);

  const parts: string[] = [];
  if (hideFilters.length > 0) {
    parts.push(labels.hide(hideFilters.join(', ')));
  }
  if (onlyFilters.length > 0) {
    parts.push(labels.only(onlyFilters.join(', ')));
  }
  return parts;
}

export type HoldsSummaryLabels = {
  count: (count: number) => string;
};

export function getHoldsPanelSummary(params: SearchRequestPagination, labels: HoldsSummaryLabels): string[] {
  const holdsCount = Object.keys(params.holdsFilter || {}).length;
  if (holdsCount === 0) return [];
  return [labels.count(holdsCount)];
}

export type ZoneSummaryModeLabels = {
  allHolds: string;
  anyHold: string;
};

export function getZonePanelSummary(
  params: SearchRequestPagination,
  label: string,
  modeLabels: ZoneSummaryModeLabels,
): string[] {
  if (!params.zoneBox) return [];
  const modeLabel = params.zoneMode === 'anyHold' ? modeLabels.anyHold : modeLabels.allHolds;
  return [`${label}: ${modeLabel}`];
}

/**
 * Pre-translated labels used by the search-pill summary helpers.
 * Pass these in from the React layer where i18n is available.
 */
export type SearchPillLabels = {
  empty: string;
  climb: ClimbSummaryLabels;
  quality: QualitySummaryLabels;
  status: StatusSummaryLabels;
  user: UserSummaryLabels;
  holds: HoldsSummaryLabels;
  zone: string;
  zoneModes: ZoneSummaryModeLabels;
  more: (count: number) => string;
};

export function createSearchSummaryLabels(t: SearchSummaryTranslate): SearchPillLabels {
  return {
    empty: t('search.summary.default'),
    climb: {
      gradeFallback: (gradeId) => t('search.summary.gradeFallback', { gradeId }),
      upToGrade: (gradeName) => t('search.summary.upToGrade', { grade: gradeName }),
      setterCount: (count) => t('search.summary.setterCount', { count }),
    },
    quality: {
      ascents: (count) => t('search.summary.ascents', { count }),
      rating: (rating) => t('search.summary.rating', { rating }),
      classics: t('search.summary.classics'),
      gradeAccuracy: t('search.summary.gradeAccuracy'),
      tallClimbsOnly: t('search.quality.tallClimbsOnly'),
      wideClimbsOnly: t('search.quality.wideClimbsOnly'),
    },
    status: {
      drafts: t('search.summary.drafts'),
      projects: t('search.status.projects'),
      established: t('search.status.established'),
    },
    user: {
      attempted: t('search.summary.attempted'),
      completed: t('search.summary.completed'),
      hide: (filters) => t('search.summary.hide', { filters }),
      only: (filters) => t('search.summary.only', { filters }),
    },
    holds: {
      count: (count) => t('search.summary.holds', { count }),
    },
    zone: t('search.panels.zone'),
    zoneModes: {
      allHolds: t('search.zone.allHolds'),
      anyHold: t('search.zone.anyHold'),
    },
    more: (count) => t('search.summary.more', { count }),
  };
}

/**
 * Get compact search pill summary (max 2 items + "+N more")
 * Used for display in the search bar and recent search pills
 */
export function getSearchPillSummary(params: SearchRequestPagination, labels: SearchPillLabels): string {
  const allParts = [
    ...getClimbPanelSummary(params, labels.climb),
    ...getQualityPanelSummary(params, labels.quality),
    ...getStatusPanelSummary(params, labels.status),
    ...getUserPanelSummary(params, labels.user),
    ...getHoldsPanelSummary(params, labels.holds),
    ...getZonePanelSummary(params, labels.zone, labels.zoneModes),
  ];

  if (allParts.length === 0) return labels.empty;

  // Show max 2 items, append "+N more" if more
  if (allParts.length <= 2) {
    return allParts.join(' \u00B7 ');
  }
  const remaining = allParts.length - 2;
  return `${allParts.slice(0, 2).join(' \u00B7 ')} \u00B7 ${labels.more(remaining)}`;
}

/**
 * Get full search pill summary (all items, no truncation)
 * Used for tooltips to show the complete filter list
 */
export function getSearchPillFullSummary(params: SearchRequestPagination, labels: SearchPillLabels): string {
  const allParts = [
    ...getClimbPanelSummary(params, labels.climb),
    ...getQualityPanelSummary(params, labels.quality),
    ...getStatusPanelSummary(params, labels.status),
    ...getUserPanelSummary(params, labels.user),
    ...getHoldsPanelSummary(params, labels.holds),
    ...getZonePanelSummary(params, labels.zone, labels.zoneModes),
  ];

  if (allParts.length === 0) return labels.empty;
  return allParts.join(' \u00B7 ');
}
