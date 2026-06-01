// Minimal async key-value contract for preference storage. Both methods
// resolve `null` when the key is absent so callers can distinguish "missing"
// from "set to a falsy value". Adapters must round-trip JSON-serialisable
// values; non-serialisable inputs are the caller's problem.

export type KeyValueStorage = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
};
