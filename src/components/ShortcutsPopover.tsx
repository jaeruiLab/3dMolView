import { Keyboard } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { SHORTCUTS } from "../lib/shortcuts";
import { FloatingLayer } from "./ui/FloatingLayer";
import { ToolButton } from "./ui/ToolButton";
import { Tooltip } from "./ui/Tooltip";

interface ShortcutsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Help button with a small non-modal popover listing keyboard shortcuts. */
export function ShortcutsPopover({ open, onOpenChange }: ShortcutsPopoverProps) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Close on outside press. Escape is handled by the app-level key handler.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !trigger?.contains(target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, trigger, onOpenChange]);

  return (
    <>
      <Tooltip label={`Keyboard shortcuts · ${SHORTCUTS.help.key}`}>
        <ToolButton
          ref={setTrigger}
          icon={<Keyboard aria-hidden size={16} />}
          aria-label={`Keyboard shortcuts (${SHORTCUTS.help.key})`}
          aria-keyshortcuts="Shift+?"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => onOpenChange(!open)}
        />
      </Tooltip>
      <FloatingLayer anchor={trigger} open={open} placement="bottom-end">
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={headingId}
          className="w-72 rounded-panel border border-line bg-panel p-3 shadow-pop"
        >
          <h2 id={headingId} className="mb-2 text-xs font-semibold text-fg">
            Keyboard shortcuts
          </h2>
          <dl className="space-y-1.5">
            {Object.values(SHORTCUTS).map(({ key, description }) => (
              <div key={key} className="flex items-center justify-between gap-3 text-xs">
                <dt className="text-muted">{description}</dt>
                <dd>
                  <kbd className="inline-block min-w-6 rounded-ctl border border-line bg-raised px-1.5 text-center font-mono text-xs leading-5 text-fg">
                    {key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">Shortcuts are off while typing in the search field.</p>
        </div>
      </FloatingLayer>
    </>
  );
}
