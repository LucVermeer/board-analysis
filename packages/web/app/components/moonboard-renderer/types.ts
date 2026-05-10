import type { MoonBoardCoordinate } from '@/app/lib/moonboard-config';
import type { LitUpHoldsMap, SvgFetchPriority } from '../board-renderer/types';

// MoonBoard hold types (simpler than Aurora) - used for internal conversions
export type MoonBoardHoldType = 'start' | 'hand' | 'finish';

// A hold on the MoonBoard
export type MoonBoardHold = {
  coordinate: MoonBoardCoordinate;
  type: MoonBoardHoldType;
  holdId: number; // Computed from coordinate (1-198)
};

// MoonBoard climb data structure
export type MoonBoardClimb = {
  name: string;
  setter?: string;
  grade?: string;
  description?: string;
  holds: MoonBoardHold[];
  angle: number;
  isBenchmark?: boolean;
};

// Props for the MoonBoard renderer component
export type MoonBoardRendererProps = {
  layoutFolder: string; // e.g., 'moonboard2024'
  holdSetImages: string[]; // e.g., ['holdsetd.png', 'holdsete.png']
  litUpHoldsMap?: LitUpHoldsMap;
  mirrored?: boolean;
  thumbnail?: boolean;
  fillHeight?: boolean;
  /** Set fetchpriority on the background image — use 'high' for the
   *  LCP-critical card on a page, 'low' to deprioritize background prefetches. */
  fetchPriority?: SvgFetchPriority;
  onHoldClick?: (holdId: number, anchor: Element) => void;
};
