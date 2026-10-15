import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Optional tooltip (e.g. to show a keyboard shortcut). */
  tooltip?: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Hide text labels below this breakpoint and show icons only (labels stay as aria-labels). */
  compactLabels?: boolean;
  /** "sm" (32 px) for toolbars, "md" (36 px) to match the search input. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Flat segmented control with radio-group semantics: one tab stop, arrow keys move and
 * select. The selected segment gets a raised fill, full-strength text and an accent
 * underline, so the state never relies on color alone.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  compactLabels = false,
  size = "sm",
  className = "",
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    const option = next === null ? undefined : options[next];
    if (next === null || !option) return;
    event.preventDefault();
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex shrink-0 overflow-hidden rounded-ctl border border-line ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const button = (
          <button
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compactLabels ? option.label : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={[
              `inline-flex ${size === "md" ? "h-[34px]" : "h-[30px]"} items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-medium`,
              "transition-colors duration-150 pointer-coarse:h-[42px] pointer-coarse:px-3",
              "focus-visible:-outline-offset-2",
              index > 0 ? "border-l border-line" : "",
              selected
                ? "bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)]"
                : "bg-panel text-muted hover:bg-hover hover:text-fg",
            ].join(" ")}
          >
            {option.icon}
            <span className={compactLabels ? "hidden xl:inline" : undefined}>{option.label}</span>
          </button>
        );
        return option.tooltip ? (
          <Tooltip key={option.value} label={option.tooltip}>
            {button}
          </Tooltip>
        ) : (
          <span key={option.value} className="inline-flex">
            {button}
          </span>
        );
      })}
    </div>
  );
}
