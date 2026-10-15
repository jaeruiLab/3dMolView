import { useCallback, useLayoutEffect, useState } from "react";
import { readStorageString, writeStorageString } from "../lib/storage";
import type { Theme } from "../types";

/** Same key the inline script in index.html reads before first paint. */
const STORAGE_KEY = "theme";

function initialTheme(): Theme {
  const stored = readStorageString(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // index.html already applied prefers-color-scheme; trust it.
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Current theme, applied as `data-theme` on <html>. A stored choice wins; otherwise the
 * OS preference is followed (and tracked live) until the user picks a theme explicitly.
 *
 * The attribute is set in a layout effect so it is in place before any child's passive
 * effect reads CSS variables (the 3D viewer reads its background color that way).
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useLayoutEffect(() => {
    if (readStorageString(STORAGE_KEY)) return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (!readStorageString(STORAGE_KEY)) setTheme(query.matches ? "light" : "dark");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      writeStorageString(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
