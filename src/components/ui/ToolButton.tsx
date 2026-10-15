import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Visible text. Omit for icon-only buttons (then pass aria-label). */
  text?: string;
  /** For toggles: renders aria-pressed and the "on" styling. */
  pressed?: boolean;
  /** Hide the visible text below the xl breakpoint (keep aria-label in that case). */
  compactText?: boolean;
  /** Element after the text, e.g. a dropdown chevron. */
  trailing?: ReactNode;
}

/**
 * Flat toolbar button. Toggles in the "on" state get the same treatment as a selected
 * segment (raised fill, accent icon, accent underline) plus aria-pressed.
 */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { icon, text, pressed, compactText = false, trailing, className = "", type = "button", ...rest },
  ref,
) {
  const on = pressed === true;
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={[
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl text-xs font-medium",
        "transition-colors duration-150 pointer-coarse:h-11 disabled:opacity-40",
        text ? "px-2.5 pointer-coarse:px-3" : "w-8 pointer-coarse:w-11",
        on
          ? "bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)] [&>svg]:text-accent"
          : "text-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg disabled:hover:bg-transparent disabled:hover:text-muted",
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
      {text && <span className={compactText ? "hidden xl:inline" : undefined}>{text}</span>}
      {trailing}
    </button>
  );
});
