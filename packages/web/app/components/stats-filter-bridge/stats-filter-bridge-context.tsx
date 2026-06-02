'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useIsomorphicLayoutEffect } from '@/app/lib/hooks/use-isomorphic-layout-effect';

// -------------------------------------------------------------------
// State context (consumed by GlobalHeader)
// -------------------------------------------------------------------

type StatsFilterBridgeState = {
  /** Whether a statistics page is currently active. */
  isActive: boolean;
  /** Page title for the header (e.g. "Statistics", "Progress"). */
  pageTitle: string | null;
  /** Back button fallback URL. null = no back button. */
  backUrl: string | null;
  /** Callback to open the filter drawer. null when not active. */
  openFilterDrawer: (() => void) | null;
  /** Whether any non-default filters are active (for indicator dot). */
  hasActiveFilters: boolean;
};

const StatsFilterBridgeContext = createContext<StatsFilterBridgeState>({
  isActive: false,
  pageTitle: null,
  backUrl: null,
  openFilterDrawer: null,
  hasActiveFilters: false,
});

export function useStatsFilterBridge() {
  return useContext(StatsFilterBridgeContext);
}

// -------------------------------------------------------------------
// Setter context (consumed by the injector in page content)
// -------------------------------------------------------------------

type StatsFilterBridgeSetters = {
  register: (openDrawer: () => void, pageTitle: string, backUrl: string | null, hasActiveFilters: boolean) => void;
  update: (hasActiveFilters: boolean) => void;
  deregister: () => void;
};

const StatsFilterBridgeSetterContext = createContext<StatsFilterBridgeSetters>({
  register: () => {},
  update: () => {},
  deregister: () => {},
});

// -------------------------------------------------------------------
// Provider (placed at root level in PersistentSessionWrapper)
// -------------------------------------------------------------------

export function StatsFilterBridgeProvider({ children }: { children: React.ReactNode }) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const openDrawerRef = useRef<(() => void) | null>(null);

  const register = useCallback((openDrawer: () => void, title: string, url: string | null, active: boolean) => {
    openDrawerRef.current = openDrawer;
    setPageTitle(title);
    setBackUrl(url);
    setHasActiveFilters(active);
    setIsRegistered(true);
  }, []);

  const update = useCallback((active: boolean) => {
    setHasActiveFilters(active);
  }, []);

  const deregister = useCallback(() => {
    openDrawerRef.current = null;
    setIsRegistered(false);
    setPageTitle(null);
    setBackUrl(null);
    setHasActiveFilters(false);
  }, []);

  const stableOpenDrawer = useCallback(() => {
    openDrawerRef.current?.();
  }, []);

  const state = useMemo<StatsFilterBridgeState>(
    () => ({
      isActive: isRegistered,
      pageTitle,
      backUrl,
      openFilterDrawer: isRegistered ? stableOpenDrawer : null,
      hasActiveFilters,
    }),
    [isRegistered, pageTitle, backUrl, stableOpenDrawer, hasActiveFilters],
  );

  const setters = useMemo<StatsFilterBridgeSetters>(
    () => ({ register, update, deregister }),
    [register, update, deregister],
  );

  return (
    <StatsFilterBridgeSetterContext.Provider value={setters}>
      <StatsFilterBridgeContext.Provider value={state}>{children}</StatsFilterBridgeContext.Provider>
    </StatsFilterBridgeSetterContext.Provider>
  );
}

// -------------------------------------------------------------------
// Injector (placed inside page content)
// -------------------------------------------------------------------

type StatsFilterBridgeInjectorProps = {
  openDrawer: () => void;
  pageTitle: string;
  backUrl: string | null;
  hasActiveFilters: boolean;
  isActive: boolean;
};

export function StatsFilterBridgeInjector({
  openDrawer,
  pageTitle,
  backUrl,
  hasActiveFilters,
  isActive,
}: StatsFilterBridgeInjectorProps) {
  const { register, update, deregister } = useContext(StatsFilterBridgeSetterContext);

  const openDrawerRef = useRef(openDrawer);
  const pageTitleRef = useRef(pageTitle);
  const backUrlRef = useRef(backUrl);
  const hasActiveFiltersRef = useRef(hasActiveFilters);
  openDrawerRef.current = openDrawer;
  pageTitleRef.current = pageTitle;
  backUrlRef.current = backUrl;
  hasActiveFiltersRef.current = hasActiveFilters;

  useIsomorphicLayoutEffect(() => {
    if (isActive) {
      register(() => openDrawerRef.current(), pageTitleRef.current, backUrlRef.current, hasActiveFiltersRef.current);
    } else {
      deregister();
    }
    return () => {
      deregister();
    };
  }, [isActive, register, deregister]);

  useEffect(() => {
    if (isActive) {
      update(hasActiveFilters);
    }
  }, [hasActiveFilters, isActive, update]);

  return null;
}
