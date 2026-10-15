import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readStorage, writeStorage } from "../lib/storage";

/** useState that is initialized from and written back to localStorage. */
export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  validate: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = readStorage(key, validate);
    if (stored !== null) return stored;
    return typeof fallback === "function" ? (fallback as () => T)() : fallback;
  });

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
