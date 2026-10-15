import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FloatingLayer } from "./FloatingLayer";
import { ToolButton } from "./ToolButton";
import { Tooltip } from "./Tooltip";

export interface MenuItem {
  label: string;
  /** Muted secondary text, e.g. the file extension. */
  hint?: string;
  onSelect: () => void;
}

interface MenuProps {
  text: string;
  icon: ReactNode;
  tooltip: string;
  items: MenuItem[];
  disabled?: boolean;
  compactText?: boolean;
}

/**
 * Toolbar dropdown menu (WAI-ARIA menu button pattern): Enter/Space/ArrowDown opens and
 * focuses the first item, arrows/Home/End move, Escape closes and returns focus, Tab or an
 * outside press closes.
 */
export function Menu({ text, icon, tooltip, items, disabled, compactText }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger?.focus();
  };

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !trigger?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, trigger]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      // Wait for the portal to mount before focusing.
      requestAnimationFrame(() => focusItem(0));
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <>
      <Tooltip label={tooltip}>
        <ToolButton
          ref={setTrigger}
          icon={icon}
          text={text}
          compactText={compactText}
          aria-label={compactText ? text : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          trailing={<ChevronDown aria-hidden size={14} className="-mr-0.5 opacity-70" />}
        />
      </Tooltip>
      <FloatingLayer anchor={trigger} open={open} placement="bottom-end">
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={text}
          onKeyDown={onMenuKeyDown}
          className="min-w-44 rounded-ctl border border-line bg-panel p-1 shadow-pop"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="flex h-8 w-full items-center justify-between gap-4 rounded-ctl px-2.5 text-left text-sm text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-offset-0 pointer-coarse:h-11"
            >
              <span>{item.label}</span>
              {item.hint && <span className="font-mono text-xs text-muted">{item.hint}</span>}
            </button>
          ))}
        </div>
      </FloatingLayer>
    </>
  );
}
