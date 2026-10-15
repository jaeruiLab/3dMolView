import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface ChipRowProps {
  label: string;
  /** Number of chips, used to re-measure when the list changes. */
  count: number;
  children: ReactNode;
  /** Rendered after the chips (e.g. a "Clear" button). */
  trailing?: ReactNode;
}

/**
 * A labeled single row of small bordered buttons. Chips that don't fit are hidden behind
 * a "+N more" toggle; hidden chips are made inert so keyboard users never tab into
 * invisible controls.
 */
export function ChipRow({ label, count, children, trailing }: ChipRowProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const labelId = useId();
  const listId = useId();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const items = Array.from(list.children) as HTMLElement[];
      const firstTop = items[0]?.offsetTop ?? 0;
      let hidden = 0;
      for (const item of items) {
        const overflows = item.offsetTop > firstTop;
        if (overflows) hidden += 1;
        const conceal = overflows && !expanded;
        item.style.visibility = conceal ? "hidden" : "";
        item.inert = conceal;
      }
      setHiddenCount(hidden);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [expanded, count]);

  const showToggle = hiddenCount > 0 || expanded;

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 items-start gap-2">
      <span id={labelId} className="w-16 shrink-0 text-xs leading-7 text-muted pointer-coarse:leading-11">
        {label}
      </span>
      <div
        ref={listRef}
        id={listId}
        className={`flex min-w-0 flex-1 flex-wrap gap-1.5 ${expanded ? "" : "max-h-7 overflow-hidden pointer-coarse:max-h-11"}`}
      >
        {children}
      </div>
      {showToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((e) => !e)}
          className="h-7 shrink-0 rounded-ctl px-1.5 text-xs text-accent hover:underline pointer-coarse:h-11"
        >
          {expanded ? "Show less" : `+${hiddenCount} more`}
        </button>
      )}
      {trailing}
    </div>
  );
}

/** Shared chip styling for ChipRow children. */
export const chipClass =
  "inline-flex h-7 max-w-48 shrink-0 items-center rounded-ctl border border-line px-2 text-xs text-fg " +
  "transition-colors duration-150 hover:bg-hover pointer-coarse:h-11 pointer-coarse:px-3";
