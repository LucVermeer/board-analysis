import { V_GRADE_COLORS, FONT_GRADE_COLORS, type GradeDisplayFormat } from '@/app/lib/grade-colors';
import { SUPPORTED_BOARDS, BOULDER_GRADES } from '@/app/lib/board-data';
import { getLayout, ORPHANED_KILTER_LAYOUT_DEFAULTS } from '@boardsesh/board-constants/product-sizes';
import { MOONBOARD_LAYOUTS } from '@/app/lib/moonboard-config';
import { formatBoardDisplayName } from '@/app/lib/string-utils';
import type { BoardName } from '@/app/lib/types';

export type UserProfile = {
  id: string;
  email: string | undefined;
  name: string | null;
  image: string | null;
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    instagramUrl: string | null;
  } | null;
  credentials?: Array<{
    boardType: string;
    auroraUsername: string;
  }>;
  followerCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
};

export type LogbookEntry = {
  climbed_at: string;
  // Raw user override (null when the user did not attach a personal grade).
  difficulty: number | null;
  // COALESCE(difficulty, climb consensus). Use this for charts and bucketing
  // so ungraded ticks fall back to the climb's consensus grade rather than
  // dropping out of every per-grade aggregate. See docs/ascents-and-attempts.md.
  // Optional so test fixtures can omit it; producers in production always set it.
  effectiveDifficulty?: number | null;
  tries: number;
  angle: number;
  status?: 'flash' | 'send' | 'attempt';
  layoutId?: number | null;
  boardType?: string;
  climbUuid?: string;
};

export type UnifiedTimeframeType = 'all' | 'lastYear' | 'lastMonth' | 'lastWeek' | 'today' | 'custom';

export const BOARD_TYPES = SUPPORTED_BOARDS;

// Maps difficulty IDs to V-grades (e.g., 16 → "V3", 17 → "V3").
// Multiple Font grades collapse into the same V-grade, which is what we want
// for chart aggregation and display labels.
export const difficultyMapping: Record<number, string> = Object.fromEntries(
  BOULDER_GRADES.map((g) => [g.difficulty_id, g.v_grade]),
);

// Font grade mapping: difficulty_id → uppercase Font grade (e.g., 16 → "6A")
const fontGradeDifficultyMapping: Record<number, string> = Object.fromEntries(
  BOULDER_GRADES.map((g) => [g.difficulty_id, g.font_grade.toUpperCase()]),
);

// Get difficulty mapping based on format preference
export const getDifficultyMapping = (format: GradeDisplayFormat): Record<number, string> => {
  return format === 'font' ? fontGradeDifficultyMapping : difficultyMapping;
};

// Build reverse mapping from grade string to numeric difficulty for sorting
const buildGradeOrder = (mapping: Record<number, string>): Map<string, number> => {
  const order = new Map<string, number>();
  for (const [numStr, grade] of Object.entries(mapping)) {
    const num = parseInt(numStr, 10);
    // For grades that map to the same string (e.g., V0 from 10, 11, 12), keep the lowest number
    if (!order.has(grade) || num < (order.get(grade) ?? Infinity)) {
      order.set(grade, num);
    }
  }
  return order;
};

const vGradeOrder = buildGradeOrder(difficultyMapping);
const fontGradeOrderMap = buildGradeOrder(fontGradeDifficultyMapping);

// Sort grades by their numeric difficulty value
export const sortGrades = (grades: string[], format: GradeDisplayFormat): string[] => {
  const gradeOrder = format === 'font' ? fontGradeOrderMap : vGradeOrder;
  return [...grades].sort((a, b) => {
    const orderA = gradeOrder.get(a) ?? 999;
    const orderB = gradeOrder.get(b) ?? 999;
    return orderA - orderB;
  });
};

// Display name overrides for layouts whose constant name doesn't match the
// desired display style (e.g. "Original Layout" → "Tension Classic").
const LAYOUT_DISPLAY_OVERRIDES: Record<string, string> = {
  'tension-9': 'Tension Classic',
  'tension-10': 'Tension 2 Mirror',
  'tension-11': 'Tension 2 Spray',
  'moonboard-1': 'MoonBoard 2010',
  'moonboard-2': 'MoonBoard 2016',
  'moonboard-3': 'MoonBoard 2024',
  'moonboard-4': 'MoonBoard Masters 2017',
  'moonboard-5': 'MoonBoard Masters 2019',
  'decoy-2': 'Decoy Dungeon Trainer',
  'touchstone-1': 'Touchstone Winter 2020',
  'grasshopper-1': 'Grasshopper 2020',
};

// Colors for each layout — soft, muted palette that feels cohesive
const layoutColors: Record<string, string> = {
  'kilter-1': 'hsla(190, 55%, 52%, 0.7)', // Muted teal
  'kilter-8': 'hsla(160, 40%, 50%, 0.7)', // Soft sage green
  'tension-9': 'hsla(350, 50%, 58%, 0.7)', // Dusty rose
  'tension-10': 'hsla(20, 55%, 58%, 0.7)', // Warm terracotta
  'tension-11': 'hsla(42, 50%, 55%, 0.7)', // Muted gold
  'moonboard-1': 'hsla(270, 40%, 58%, 0.7)', // Soft lavender
  'moonboard-2': 'hsla(250, 40%, 55%, 0.7)', // Muted indigo
  'moonboard-3': 'hsla(290, 35%, 55%, 0.7)', // Soft plum
  'moonboard-4': 'hsla(230, 40%, 58%, 0.7)', // Dusty blue
  'moonboard-5': 'hsla(210, 45%, 55%, 0.7)', // Slate blue
  'decoy-2': 'hsla(100, 40%, 52%, 0.7)', // Soft green
  'touchstone-1': 'hsla(30, 50%, 55%, 0.7)', // Warm amber
  'grasshopper-1': 'hsla(75, 45%, 50%, 0.7)', // Yellow-green
};

export const getLayoutKey = (boardType: string, layoutId: number | null | undefined): string => {
  if (layoutId === null || layoutId === undefined) {
    return `${boardType}-unknown`;
  }
  return `${boardType}-${layoutId}`;
};

export const getLayoutDisplayName = (boardType: string, layoutId: number | null | undefined): string => {
  if (layoutId === null || layoutId === undefined) {
    return `${formatBoardDisplayName(boardType)} (Unknown Layout)`;
  }

  const key = getLayoutKey(boardType, layoutId);

  // Check display overrides first
  if (LAYOUT_DISPLAY_OVERRIDES[key]) return LAYOUT_DISPLAY_OVERRIDES[key];

  // MoonBoard layouts are defined separately from Aurora layouts
  if (boardType === 'moonboard') {
    const entry = Object.values(MOONBOARD_LAYOUTS).find((l) => l.id === layoutId);
    if (entry) return entry.name;
  } else {
    // Aurora layouts from board-constants
    const layout = getLayout(boardType as BoardName, layoutId);
    if (layout) {
      // Strip " Board " from names like "Kilter Board Original" → "Kilter Original"
      return layout.name.replace(' Board ', ' ');
    }

    // Orphaned Kilter layouts not in the main LAYOUTS config
    if (boardType === 'kilter') {
      const orphaned = ORPHANED_KILTER_LAYOUT_DEFAULTS[layoutId];
      if (orphaned) return orphaned.name;
    }
  }

  return `${formatBoardDisplayName(boardType)} (Layout ${layoutId})`;
};

export const getLayoutColor = (boardType: string, layoutId: number | null | undefined): string => {
  const key = getLayoutKey(boardType, layoutId);
  return layoutColors[key] || (boardType === 'kilter' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(239, 68, 68, 0.5)');
};

/**
 * Softened grade color for chart bars — preserves hue but lowers saturation
 * and raises lightness for a cohesive, muted look.
 */
export const getGradeChartColor = (grade: string): string => {
  // Try V-grade first (strip trailing "+"), then Font grade (lowercase)
  const normalized = grade.replace(/\+$/, '');
  const hexColor = V_GRADE_COLORS[normalized] ?? FONT_GRADE_COLORS[grade.toLowerCase()];
  if (!hexColor) return 'hsla(0, 0%, 78%, 0.7)';

  // Convert hex to HSL for smoother control
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // Muted: cap saturation at 50%, raise lightness to 55%, 75% opacity
  const hDeg = Math.round(h * 360);
  const sMuted = Math.min(Math.round(s * 100), 50);
  const lMuted = Math.max(Math.round(l * 100), 48);
  return `hsla(${hDeg}, ${sMuted}%, ${lMuted}%, 0.75)`;
};

export const boardOptions = [
  { label: 'All', value: 'all' },
  ...BOARD_TYPES.map((boardType) => ({
    label: formatBoardDisplayName(boardType),
    value: boardType,
  })),
];

export const unifiedTimeframeOptions: { label: string; value: UnifiedTimeframeType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Year', value: 'lastYear' },
  { label: 'Month', value: 'lastMonth' },
  { label: 'Week', value: 'lastWeek' },
  { label: 'Today', value: 'today' },
  { label: 'Custom', value: 'custom' },
];
