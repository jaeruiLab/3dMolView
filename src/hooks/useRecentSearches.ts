import { useCallback, useState } from "react";
import { readStorage, removeStorage, writeStorage } from "../lib/storage";
import type { RecentSearch } from "../types";

const STORAGE_KEY = "recent-searches";
export const MAX_RECENT = 8;

function isRecentSearch(value: unknown): value is RecentSearch {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.query === "string" &&
    (v.mode === "auto" || v.mode === "name" || v.mode === "smiles") &&
    typeof v.label === "string" &&
    typeof v.cid === "number"
  );
}

function isRecentList(value: unknown): value is RecentSearch[] {
  return Array.isArray(value) && value.every(isRecentSearch);
}

export interface UseRecentSearches {
  items: RecentSearch[];
  add: (entry: RecentSearch) => void;
  clear: () => void;
}

/**
 * Most-recent-first list of successful searches, persisted in localStorage.
 * Deduplicated by CID, so "aspirin" and its SMILES count as one entry (the newest wins).
 */
export function useRecentSearches(): UseRecentSearches {
  const [items, setItems] = useState<RecentSearch[]>(() => readStorage(STORAGE_KEY, isRecentList) ?? []);

  const add = useCallback((entry: RecentSearch) => {
    setItems((current) => {
      if (current[0]?.cid === entry.cid && current[0].query === entry.query) return current;
      const next = [entry, ...current.filter((item) => item.cid !== entry.cid)].slice(0, MAX_RECENT);
      writeStorage(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    removeStorage(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, add, clear };
}
