/** Keyboard shortcuts: single source for the handler in App, tooltips and the help popover. */
export const SHORTCUTS = {
  focusSearch: { key: "/", description: "Focus search" },
  blur: { key: "Esc", description: "Leave the search field or close a popover" },
  reset: { key: "R", description: "Reset view" },
  style: { key: "S", description: "Cycle display style" },
  labels: { key: "L", description: "Toggle atom labels" },
  surface: { key: "V", description: "Toggle van der Waals surface" },
  spin: { key: "A", description: "Toggle auto-rotate" },
  fullscreen: { key: "F", description: "Toggle fullscreen" },
  help: { key: "?", description: "Show keyboard shortcuts" },
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;

/** True when a key event originates from a text-entry control, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}
