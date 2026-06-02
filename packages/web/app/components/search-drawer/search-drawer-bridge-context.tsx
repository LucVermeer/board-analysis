'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useIsomorphicLayoutEffect } from '@/app/lib/hooks/use-isomorphic-layout-effect';

// -------------------------------------------------------------------
// State context (consumed by GlobalHeader)
// -------------------------------------------------------------------

type SearchDrawerBridgeState = {
  /** Callback to open the climb search drawer. null when no board list page is active. */
  openClimbSearchDrawer: (() => void) | null;
  /** Filter summary text like "V5-V7 · Tall" or "Search climbs..." */
  searchPillSummary: string | null;
  /** Whether any climb filters are active (for indicator dot). */
  hasActiveFilters: boolean;
  /** Current name filter value for the header search input. */
  nameFilter: string;
  /** Callback to update the name filter from the header search input. null when not on list page. */
  setNameFilter: ((name: string) => void) | null;
  /** Whether any filters other than name are active (for filter button indicator). */
  hasActiveNonNameFilters: boolean;
};

const SearchDrawerBridgeContext = createContext<SearchDrawerBridgeState>({
  openClimbSearchDrawer: null,
  searchPillSummary: null,
  hasActiveFilters: false,
  nameFilter: '',
  setNameFilter: null,
  hasActiveNonNameFilters: false,
});

export function useSearchDrawerBridge() {
  return useContext(SearchDrawerBridgeContext);
}

// -------------------------------------------------------------------
// Setter context (consumed by the injector in BoardSeshHeader)
// -------------------------------------------------------------------

type SearchDrawerBridgeSetters = {
  register: (
    openDrawer: () => void,
    summary: string,
    active: boolean,
    nameFilter: string,
    setNameFilter: (name: string) => void,
    nonNameActive: boolean,
  ) => void;
  update: (summary: string, active: boolean, nameFilter: string, nonNameActive: boolean) => void;
  deregister: () => void;
};

const SearchDrawerBridgeSetterContext = createContext<SearchDrawerBridgeSetters>({
  register: () => {},
  update: () => {},
  deregister: () => {},
});

// -------------------------------------------------------------------
// Provider (placed at root level in PersistentSessionWrapper)
// -------------------------------------------------------------------

export function SearchDrawerBridgeProvider({ children }: { children: React.ReactNode }) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [nameFilter, setNameFilterState] = useState('');
  const [nonNameActive, setNonNameActive] = useState(false);
  const openDrawerRef = useRef<(() => void) | null>(null);
  const setNameFilterRef = useRef<((name: string) => void) | null>(null);

  const register = useCallback(
    (openDrawer: () => void, s: string, a: boolean, nf: string, snf: (name: string) => void, nna: boolean) => {
      openDrawerRef.current = openDrawer;
      setNameFilterRef.current = snf;
      setSummary(s);
      setActive(a);
      setNameFilterState(nf);
      setNonNameActive(nna);
      setIsRegistered(true);
    },
    [],
  );

  const update = useCallback((s: string, a: boolean, nf: string, nna: boolean) => {
    setSummary(s);
    setActive(a);
    setNameFilterState(nf);
    setNonNameActive(nna);
  }, []);

  const deregister = useCallback(() => {
    openDrawerRef.current = null;
    setNameFilterRef.current = null;
    setIsRegistered(false);
    setSummary(null);
    setActive(false);
    setNameFilterState('');
    setNonNameActive(false);
  }, []);

  const stableOpenDrawer = useCallback(() => {
    openDrawerRef.current?.();
  }, []);

  const stableSetNameFilter = useCallback((name: string) => {
    setNameFilterRef.current?.(name);
  }, []);

  const state = useMemo<SearchDrawerBridgeState>(
    () => ({
      openClimbSearchDrawer: isRegistered ? stableOpenDrawer : null,
      searchPillSummary: summary,
      hasActiveFilters: active,
      nameFilter,
      setNameFilter: isRegistered ? stableSetNameFilter : null,
      hasActiveNonNameFilters: nonNameActive,
    }),
    [isRegistered, stableOpenDrawer, stableSetNameFilter, summary, active, nameFilter, nonNameActive],
  );

  const setters = useMemo<SearchDrawerBridgeSetters>(
    () => ({ register, update, deregister }),
    [register, update, deregister],
  );

  return (
    <SearchDrawerBridgeSetterContext.Provider value={setters}>
      <SearchDrawerBridgeContext.Provider value={state}>{children}</SearchDrawerBridgeContext.Provider>
    </SearchDrawerBridgeSetterContext.Provider>
  );
}

// -------------------------------------------------------------------
// Injector (placed inside BoardSeshHeader on list pages)
// -------------------------------------------------------------------

type SearchDrawerBridgeInjectorProps = {
  openDrawer: () => void;
  summary: string;
  hasActiveFilters: boolean;
  isOnListPage: boolean;
  nameFilter: string;
  onNameFilterChange: (name: string) => void;
  hasActiveNonNameFilters: boolean;
};

export function SearchDrawerBridgeInjector({
  openDrawer,
  summary,
  hasActiveFilters: active,
  isOnListPage,
  nameFilter,
  onNameFilterChange,
  hasActiveNonNameFilters: nonNameActive,
}: SearchDrawerBridgeInjectorProps) {
  const { register, update, deregister } = useContext(SearchDrawerBridgeSetterContext);

  // Store mutable values in refs so effects don't depend on their identity
  const openDrawerRef = useRef(openDrawer);
  const summaryRef = useRef(summary);
  const activeRef = useRef(active);
  const nameFilterRef = useRef(nameFilter);
  const onNameFilterChangeRef = useRef(onNameFilterChange);
  const nonNameActiveRef = useRef(nonNameActive);
  openDrawerRef.current = openDrawer;
  summaryRef.current = summary;
  activeRef.current = active;
  nameFilterRef.current = nameFilter;
  onNameFilterChangeRef.current = onNameFilterChange;
  nonNameActiveRef.current = nonNameActive;

  // Register/deregister based on whether we're on the list page
  useIsomorphicLayoutEffect(() => {
    if (isOnListPage) {
      register(
        () => openDrawerRef.current(),
        summaryRef.current,
        activeRef.current,
        nameFilterRef.current,
        (name: string) => onNameFilterChangeRef.current(name),
        nonNameActiveRef.current,
      );
    } else {
      deregister();
    }
    return () => {
      deregister();
    };
  }, [isOnListPage, register, deregister]);

  // Update summary, active filters, and name filter when they change (while on list page)
  useEffect(() => {
    if (isOnListPage) {
      update(summary, active, nameFilter, nonNameActive);
    }
  }, [summary, active, nameFilter, nonNameActive, isOnListPage, update]);

  return null;
}
