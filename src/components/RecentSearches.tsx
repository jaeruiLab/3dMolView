import type { RecentSearch } from "../types";
import { ChipRow, chipClass } from "./ChipRow";

interface RecentSearchesProps {
  items: RecentSearch[];
  onSelect: (item: RecentSearch) => void;
  onClear: () => void;
}

/** Labeled row of recent successful searches with a Clear action. Renders nothing when empty. */
export function RecentSearches({ items, onSelect, onClear }: RecentSearchesProps) {
  if (items.length === 0) return null;

  return (
    <ChipRow
      label="Recent"
      count={items.length}
      trailing={
        <button
          type="button"
          onClick={onClear}
          className="h-7 shrink-0 rounded-ctl px-1.5 text-xs text-muted hover:text-fg hover:underline pointer-coarse:h-11"
        >
          Clear
        </button>
      }
    >
      {items.map((item) => (
        <button
          key={`${item.key}-${item.query}`}
          type="button"
          className={chipClass}
          title={item.query === item.label ? undefined : `Searched: ${item.query}`}
          onClick={() => onSelect(item)}
        >
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </ChipRow>
  );
}
