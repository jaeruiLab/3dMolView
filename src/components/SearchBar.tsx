import { Search } from "lucide-react";
import { forwardRef, useId, type FormEvent, type ReactNode } from "react";
import { detectInputType } from "../lib/detectInput";
import type { InputMode } from "../types";
import { SegmentedControl, type SegmentOption } from "./ui/SegmentedControl";

const MODE_OPTIONS: ReadonlyArray<SegmentOption<InputMode>> = [
  { value: "auto", label: "Auto" },
  { value: "name", label: "Name" },
  { value: "smiles", label: "SMILES" },
];

interface SearchBarProps {
  value: string;
  onValueChange: (value: string) => void;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  onSubmit: () => void;
}

/**
 * Single search input with an Auto / Name / SMILES interpretation toggle. The line under
 * the input always states how the current text will be interpreted.
 * Layout: one row on wide screens; on narrow screens the input takes the first row and the
 * mode toggle, interpretation and Search button share the second (DOM order = tab order).
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onValueChange, mode, onModeChange, onSubmit },
  inputRef,
) {
  const inputId = useId();
  const statusId = useId();
  const trimmed = value.trim();

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  let interpretation: ReactNode;
  if (mode === "auto") {
    interpretation =
      trimmed === "" ? (
        "Auto-detects names and SMILES"
      ) : (
        <>
          Detected: <span className="font-medium text-fg">{detectInputType(trimmed) === "smiles" ? "SMILES" : "Name"}</span>
        </>
      );
  } else {
    interpretation = (
      <>
        Searching as <span className="font-medium text-fg">{mode === "smiles" ? "SMILES" : "name"}</span>
      </>
    );
  }

  return (
    <form role="search" aria-label="Compound search" onSubmit={onFormSubmit} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <label htmlFor={inputId} className="sr-only">
        Compound name or SMILES
      </label>
      <div className="relative order-1 min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <Search aria-hidden size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Compound name or SMILES (e.g. caffeine, CC(=O)OC1=CC=CC=C1C(=O)O)"
          aria-describedby={statusId}
          aria-keyshortcuts="/"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-9 w-full rounded-ctl border border-control bg-page pl-8 pr-8 text-sm text-fg placeholder:text-muted pointer-coarse:h-11"
        />
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-ctl border border-line px-1.5 font-mono text-xs leading-4 text-muted sm:block"
        >
          /
        </kbd>
      </div>

      <SegmentedControl label="Interpret input as" options={MODE_OPTIONS} value={mode} onChange={onModeChange} size="md" className="order-2" />

      <p id={statusId} className="order-3 min-w-0 flex-1 truncate text-xs text-muted sm:order-4 sm:basis-full">
        {interpretation}
      </p>

      <button
        type="submit"
        className="order-4 inline-flex h-9 shrink-0 items-center rounded-ctl bg-accent-solid px-4 text-sm font-medium text-on-accent transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent-solid)_85%,black)] pointer-coarse:h-11 sm:order-3"
      >
        Search
      </button>
    </form>
  );
});
