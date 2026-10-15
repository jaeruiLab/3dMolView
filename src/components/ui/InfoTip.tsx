import { Info } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { FloatingLayer } from "./FloatingLayer";

interface InfoTipProps {
  /** Term being defined, used in the button's accessible name ("About XLogP"). */
  term: string;
  /** One-sentence plain-language definition. */
  definition: string;
}

/**
 * Small info button with a definition that opens on hover, keyboard focus or tap.
 * The definition is always in the DOM (hidden) and linked with aria-describedby, so
 * screen readers announce it without opening the popup.
 */
export function InfoTip({ term, definition }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const descriptionId = useId();

  // A tapped/clicked tip stays open until the next press elsewhere.
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!button?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pinned, button]);

  return (
    <>
      <button
        ref={setButton}
        type="button"
        aria-label={`About ${term}`}
        aria-describedby={descriptionId}
        aria-expanded={open}
        className="touch-target inline-flex size-5 shrink-0 items-center justify-center rounded-ctl text-muted transition-colors duration-150 hover:text-fg"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !pinned) setOpen(false);
        }}
        onFocus={(e) => {
          if (e.target.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setPinned(false);
            setOpen(false);
          }
        }}
      >
        <Info aria-hidden size={14} strokeWidth={2} />
      </button>
      <span id={descriptionId} hidden>
        {definition}
      </span>
      <FloatingLayer
        anchor={button}
        open={open}
        placement="bottom-start"
        aria-hidden
        className="pointer-events-none w-max max-w-64 rounded-ctl border border-line bg-raised px-2.5 py-2 text-xs text-fg shadow-pop"
      >
        {definition}
      </FloatingLayer>
    </>
  );
}
