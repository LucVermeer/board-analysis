import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useTheme } from './theme-provider';

export type ConfirmOptions = {
  title: string;
  /** Optional supporting text under the title. */
  message?: string;
  /** Label for the affirmative action (e.g. "Delete", "Switch"). */
  confirmLabel: string;
  /** Label for the dismissive action (e.g. "Cancel"). */
  cancelLabel: string;
  /** Style the confirm action as destructive (M3 error tint / iOS destructive). */
  destructive?: boolean;
};

type DialogContextValue = {
  /** Resolve `true` if the user confirms, `false` on cancel / scrim / back dismiss. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type PendingConfirm = ConfirmOptions & { id: number; resolve: (value: boolean) => void };

/**
 * One imperative confirm dialog for the whole app, rendered the right way per UI
 * variant: a Material 3 Paper `Dialog` (in a `Portal`) on Material, and the native
 * iOS `Alert` on Liquid Glass — both behind `useConfirm()`, which returns a promise
 * so callers can `if (await confirm(...))`.
 *
 * It's a provider (not a `createVariantComponent`) because the API is imperative
 * context, not a rendered element — and it must be reachable from other providers
 * (e.g. the Bluetooth board-config flow), not just screens. Mount it inside
 * `MaterialThemeProvider` (so the Paper `Dialog`/`Portal` has a host) and above any
 * provider that calls `confirm`. Providers are exempt from the variant guard, so the
 * `variant ===` branch here is the sanctioned place to resolve it.
 *
 * Concurrent confirms queue (one Material dialog shows at a time; the native iOS
 * Alert queues itself), so a Bluetooth confirm racing a UI confirm can't clobber the
 * other's resolver. Scrim / back dismiss resolves `false`.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const { variant, m3 } = useTheme();
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const idRef = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        if (variant === 'liquidGlass') {
          Alert.alert(
            options.title,
            options.message,
            [
              { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
              {
                text: options.confirmLabel,
                style: options.destructive ? 'destructive' : 'default',
                onPress: () => resolve(true),
              },
            ],
            { onDismiss: () => resolve(false) },
          );
          return;
        }
        idRef.current += 1;
        setQueue((q) => [...q, { ...options, id: idRef.current, resolve }]);
      }),
    [variant],
  );

  const value = useMemo<DialogContextValue>(() => ({ confirm }), [confirm]);

  const current = queue[0];
  // `current` is captured per render (the head of the queue), so each settle
  // resolves exactly that confirm's promise, then advances to the next queued one.
  const settle = (result: boolean) => {
    current?.resolve(result);
    setQueue((q) => q.slice(1));
  };

  return (
    <DialogContext value={value}>
      {children}
      {variant === 'material' && current ? (
        <Portal>
          <Dialog visible onDismiss={() => settle(false)}>
            <Dialog.Title>{current.title}</Dialog.Title>
            {current.message ? (
              <Dialog.Content>
                <Text variant="bodyMedium">{current.message}</Text>
              </Dialog.Content>
            ) : null}
            <Dialog.Actions>
              <Button onPress={() => settle(false)}>{current.cancelLabel}</Button>
              <Button textColor={current.destructive ? m3.error : undefined} onPress={() => settle(true)}>
                {current.confirmLabel}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      ) : null}
    </DialogContext>
  );
}

/**
 * Imperative confirm dialog. Returns a promise that resolves `true` on confirm,
 * `false` on cancel / dismiss — so `if (await confirm({ … })) { …action… }`.
 */
export function useConfirm(): DialogContextValue['confirm'] {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a DialogProvider');
  }
  return ctx.confirm;
}
