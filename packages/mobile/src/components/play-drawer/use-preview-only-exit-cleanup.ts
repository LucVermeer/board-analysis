import { useEffect, useRef } from 'react';

/**
 * Runs `onExitPreviewOnly` exactly when party preview-only mode flips true→false.
 * Transition-gated so mounting and entering preview-only never fire. The callback
 * is read through a ref so callers may pass an inline closure without memoizing and
 * the effect keeps a single [isPartyPreviewOnly] dependency (preserving the original
 * inline-effect semantics).
 */
export function usePreviewOnlyExitCleanup(isPartyPreviewOnly: boolean, onExitPreviewOnly: () => void): void {
  const onExitRef = useRef(onExitPreviewOnly);
  onExitRef.current = onExitPreviewOnly;
  const wasPartyPreviewOnlyRef = useRef(isPartyPreviewOnly);
  useEffect(() => {
    const wasPreviewOnly = wasPartyPreviewOnlyRef.current;
    wasPartyPreviewOnlyRef.current = isPartyPreviewOnly;
    if (wasPreviewOnly && !isPartyPreviewOnly) {
      onExitRef.current();
    }
  }, [isPartyPreviewOnly]);
}
