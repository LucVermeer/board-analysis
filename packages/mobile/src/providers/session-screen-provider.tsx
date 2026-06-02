import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type SessionScreenContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const SessionScreenContext = createContext<SessionScreenContextValue | null>(null);

export function SessionScreenProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const value = useMemo<SessionScreenContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return <SessionScreenContext value={value}>{children}</SessionScreenContext>;
}

export function useSessionScreen(): SessionScreenContextValue {
  const ctx = useContext(SessionScreenContext);
  if (!ctx) throw new Error('useSessionScreen must be used within SessionScreenProvider');
  return ctx;
}
