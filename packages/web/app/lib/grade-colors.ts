// Grade color data, lookups, and display utilities are owned by shared
// packages. This file is a thin re-export layer for back-compat with web
// call sites that import from '@/app/lib/grade-colors'.
//
// Format helpers (`formatGrade`, `formatVGrade`, `formatFontGrade`), softening
// helpers (`softenColor`, `getSoft*`) and the `GradeDisplayFormat` type now
// live in `@boardsesh/play-view` so mobile can reuse them.

export {
  V_GRADE_COLORS,
  FONT_GRADE_COLORS,
  DEFAULT_GRADE_COLOR,
  getVGradeColor,
  getFontGradeColor,
  getGradeColor,
} from '@boardsesh/board-constants/grade-colors';

export {
  getGradeTintColor,
  getGradeColorWithOpacity,
  isLightColor,
  getGradeTextColor,
  formatGrade,
  formatVGrade,
  formatFontGrade,
  softenColor,
  getSoftGradeColor,
  getSoftVGradeColor,
  getSoftFontGradeColor,
  getSoftGradeColorByFormat,
  DEFAULT_GRADE_DISPLAY_FORMAT,
} from '@boardsesh/play-view';
export type { GradeDisplayFormat } from '@boardsesh/play-view';
