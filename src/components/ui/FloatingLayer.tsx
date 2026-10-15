import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type Placement = "bottom" | "bottom-start" | "bottom-end" | "top";

interface FloatingLayerProps extends HTMLAttributes<HTMLDivElement> {
  anchor: HTMLElement | null;
  open: boolean;
  placement?: Placement;
  gap?: number;
  children: ReactNode;
}

const MARGIN = 8;

/**
 * Renders children in a fixed-position layer next to `anchor`, flipping above/below and
 * clamping to the viewport. Portaled so overflow:auto ancestors (the scrollable viewer
 * toolbar) cannot clip it, and into the fullscreen element when one is active, because
 * nothing outside that element is visible in fullscreen.
 */
export function FloatingLayer({
  anchor,
  open,
  placement = "bottom",
  gap = 6,
  children,
  style,
  ...rest
}: FloatingLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const update = useCallback(() => {
    const layer = ref.current;
    if (!anchor || !layer) return;
    const a = anchor.getBoundingClientRect();
    const f = layer.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const above = a.top - gap - f.height;
    const below = a.bottom + gap;
    let top = placement === "top" ? above : below;
    if (placement === "top" && top < MARGIN) top = below;
    if (placement !== "top" && top + f.height > vh - MARGIN && above >= MARGIN) top = above;

    let left =
      placement === "bottom-start"
        ? a.left
        : placement === "bottom-end"
          ? a.right - f.width
          : a.left + a.width / 2 - f.width / 2;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - MARGIN - f.width));

    setPosition({ top: Math.round(top), left: Math.round(left) });
  }, [anchor, placement, gap]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  if (!open) return null;
  const container = document.fullscreenElement ?? document.body;
  return createPortal(
    <div
      ref={ref}
      {...rest}
      style={{
        ...style,
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        // Measured on the first layout pass, then shown in place.
        visibility: position ? "visible" : "hidden",
        zIndex: 50,
      }}
    >
      {children}
    </div>,
    container,
  );
}
