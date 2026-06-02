'use client';

import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` in the browser, `useEffect` during SSR.
 *
 * `useLayoutEffect` runs before the browser paints — needed when an effect must
 * read or mutate the DOM in the same frame it commits (e.g. measuring layout,
 * hiding an element before it can flash). React warns when `useLayoutEffect`
 * runs on the server, so we fall back to `useEffect` there (it's a no-op during
 * SSR anyway). The branch is on a stable per-environment condition, so the rule
 * of hooks is preserved.
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
