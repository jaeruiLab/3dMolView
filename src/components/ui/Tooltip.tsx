import { useEffect, useRef, useState, type ReactNode } from "react";
import { FloatingLayer, type Placement } from "./FloatingLayer";

interface TooltipProps {
  /** Tooltip text. Supplementary only: the wrapped control must have its own accessible name. */
  label: string;
  placement?: Placement;
  children: ReactNode;
  className?: string;
}

const HOVER_DELAY_MS = 350;

/**
 * Text tooltip for a control. Shows on mouse hover (after a short delay) and on keyboard
 * focus; hides on leave, blur, press and Escape. Touch users never depend on it because
 * every wrapped control also has a visible label or an aria-label.
 */
export function Tooltip({ label, placement = "bottom", children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      ref={setAnchor}
      className={className ?? "inline-flex shrink-0"}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show(HOVER_DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) show(0);
      }}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {children}
      <FloatingLayer
        anchor={anchor}
        open={open}
        placement={placement}
        role="tooltip"
        className="pointer-events-none whitespace-nowrap rounded-ctl border border-line bg-raised px-2 py-1 text-xs text-fg shadow-pop"
      >
        {label}
      </FloatingLayer>
    </span>
  );
}
