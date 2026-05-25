type SetterListener = (setters: string[]) => void;

const setterListeners = new Set<SetterListener>();

export function emitSetterSelection(setters: string[]): void {
  for (const listener of setterListeners) {
    listener(setters);
  }
}

export function subscribeToSetterSelection(listener: SetterListener): () => void {
  setterListeners.add(listener);
  return () => {
    setterListeners.delete(listener);
  };
}
