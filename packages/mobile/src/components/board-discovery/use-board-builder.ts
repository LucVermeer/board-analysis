import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardName, CreateBoardInput } from '@boardsesh/shared-schema';
import { SUPPORTED_BOARDS, ANGLES, normaliseSetIds } from '@boardsesh/board-config';
import {
  getBoardLayouts,
  getBoardSizesForLayoutId,
  getBoardSetsForLayoutAndSize,
  getDefaultBoardSizeForLayout,
} from '../../lib/custom-board-options';
import { cleanLayoutName } from './board-builder-labels';

/** A board config to pre-fill the builder with (e.g. a tapped Popular setup). */
export type BoardBuilderSeed = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  /** Comma-separated set ids. */
  setIds: string;
  angle?: number;
};

function defaultAngle(boardName: BoardName): number {
  const angles = ANGLES[boardName] ?? [];
  return angles.includes(40) ? 40 : (angles[0] ?? 0);
}

function parseSetIds(setIds: string): number[] {
  return setIds.split(',').map(Number).filter(Number.isFinite);
}

/**
 * The cascading board-config state machine behind the create-board builder
 * (board → layout → size → sets → angle), plus the optional "more options" meta
 * (name, ownership, visibility, location, serial). Pure of any rendering, so it
 * can drive a full screen and be unit-tested directly. Picking a size
 * auto-selects all of that size's sets, which is why the per-set toggles can
 * stay hidden behind Advanced for the 99% case.
 */
export function useBoardBuilder(seed?: BoardBuilderSeed | null) {
  const initialBoard = seed?.boardName ?? SUPPORTED_BOARDS[0];
  const [boardName, setBoardName] = useState<BoardName>(initialBoard);
  const [layoutId, setLayoutId] = useState<number | null>(seed?.layoutId ?? null);
  const [sizeId, setSizeId] = useState<number | null>(seed?.sizeId ?? null);
  const [setIds, setSetIds] = useState<number[]>(seed ? parseSetIds(seed.setIds) : []);
  const [angle, setAngle] = useState<number>(seed?.angle ?? defaultAngle(initialBoard));
  const [name, setName] = useState('');

  // "More options" / advanced. Owned + public default to the home-board case.
  const [isOwned, setIsOwned] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [isUnlisted, setIsUnlisted] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  // Most home boards with a kicker tilt are adjustable; default on.
  const [isAngleAdjustable, setIsAngleAdjustable] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [serialNumber, setSerialNumber] = useState('');

  // Re-seed when the seed's VALUES change (opened from a different Popular
  // config). Keyed on the serialized seed, not its object identity, so an
  // unmemoised seed prop can't cause an infinite re-seed→render loop. Read
  // through a ref so the effect deps stay just the key.
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const seedKey = seed ? `${seed.boardName}:${seed.layoutId}:${seed.sizeId}:${seed.setIds}:${seed.angle ?? ''}` : '';
  useEffect(() => {
    const current = seedRef.current;
    if (!current) return;
    setBoardName(current.boardName);
    setLayoutId(current.layoutId);
    setSizeId(current.sizeId);
    setSetIds(parseSetIds(current.setIds));
    setAngle(current.angle ?? defaultAngle(current.boardName));
  }, [seedKey]);

  const layouts = useMemo(() => getBoardLayouts(boardName), [boardName]);
  const sizes = useMemo(
    () => (layoutId != null ? getBoardSizesForLayoutId(boardName, layoutId) : []),
    [boardName, layoutId],
  );
  const sets = useMemo(
    () => (layoutId != null && sizeId != null ? getBoardSetsForLayoutAndSize(boardName, layoutId, sizeId) : []),
    [boardName, layoutId, sizeId],
  );
  const angles = ANGLES[boardName] ?? [];
  const rawLayoutName = layouts.find((layout) => layout.id === layoutId)?.name ?? boardName;

  // Each level resets everything below it so the cascade stays consistent.
  // Stable across renders (deps are only the levels above) so memoised chip
  // rows don't re-render when an unrelated field — e.g. the dragged angle —
  // changes.
  const selectBoard = useCallback((next: BoardName) => {
    setBoardName(next);
    setLayoutId(null);
    setSizeId(null);
    setSetIds([]);
    setAngle(defaultAngle(next));
  }, []);
  const selectLayout = useCallback(
    (next: number) => {
      setLayoutId(next);
      const defaultSize = getDefaultBoardSizeForLayout(boardName, next);
      setSizeId(defaultSize);
      setSetIds(
        defaultSize != null ? getBoardSetsForLayoutAndSize(boardName, next, defaultSize).map((set) => set.id) : [],
      );
    },
    [boardName],
  );
  const selectSize = useCallback(
    (next: number) => {
      // Pre-select every set for the size — the common case (a "Full Ride" owner
      // has them all), and why the set toggles live behind Advanced.
      setSizeId(next);
      setSetIds(layoutId != null ? getBoardSetsForLayoutAndSize(boardName, layoutId, next).map((set) => set.id) : []);
    },
    [boardName, layoutId],
  );
  const toggleSet = useCallback(
    (id: number) => setSetIds((prev) => (prev.includes(id) ? prev.filter((set) => set !== id) : [...prev, id])),
    [],
  );

  const canCreate = layoutId != null && sizeId != null && setIds.length > 0;

  /**
   * The validated CreateBoardInput, or null when the config is incomplete.
   * `fallbackName` (e.g. an auto-generated "Marco's Kilter Original 12×12") is
   * used when the user left the name blank; defaults to the cleaned layout name.
   */
  const buildCreateInput = (fallbackName?: string): CreateBoardInput | null => {
    if (layoutId == null || sizeId == null || setIds.length === 0) return null;
    return {
      boardType: boardName,
      layoutId,
      sizeId,
      // Canonical order so a re-ticked set matches an existing owned board.
      setIds: normaliseSetIds(setIds.join(',')),
      name: name.trim() || fallbackName?.trim() || cleanLayoutName(rawLayoutName, boardName),
      angle,
      isOwned,
      isPublic,
      isUnlisted,
      hideLocation,
      isAngleAdjustable,
      serialNumber: serialNumber.trim() || undefined,
      locationName: locationName.trim() || undefined,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    };
  };

  return {
    // config
    boardName,
    layoutId,
    sizeId,
    setIds,
    angle,
    // meta
    name,
    isOwned,
    isPublic,
    isUnlisted,
    hideLocation,
    isAngleAdjustable,
    locationName,
    coords,
    serialNumber,
    // derived
    layouts,
    sizes,
    sets,
    angles,
    rawLayoutName,
    canCreate,
    // actions
    selectBoard,
    selectLayout,
    selectSize,
    toggleSet,
    setAngle,
    setName,
    setIsOwned,
    setIsPublic,
    setIsUnlisted,
    setHideLocation,
    setIsAngleAdjustable,
    setLocationName,
    setCoords,
    setSerialNumber,
    buildCreateInput,
  };
}
