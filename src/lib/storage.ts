/**
 * localStorage helpers that never throw (private mode, disabled storage, quota, bad JSON).
 * All keys are namespaced with "molview:".
 */
const PREFIX = "molview:";

export function readStorage<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the app works without persistence.
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore.
  }
}

/** Raw (non-JSON) string access, used for the theme key shared with index.html. */
export function readStorageString(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeStorageString(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Ignore.
  }
}
