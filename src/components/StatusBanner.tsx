import { AlertTriangle, CircleAlert, X } from "lucide-react";
import type { ReactNode } from "react";

interface StatusBannerProps {
  tone: "error" | "warning";
  title: string;
  detail?: ReactNode;
  /** Actionable next step(s): Retry, "Did you mean…", etc. */
  actions?: ReactNode;
  onDismiss?: () => void;
}

/**
 * Inline status message above the viewer. Plain text with a colored left border and an
 * icon, so tone is conveyed by shape and wording as well as color. Announcements are
 * handled by the app-level live region, so this element is not itself a live region.
 */
export function StatusBanner({ tone, title, detail, actions, onDismiss }: StatusBannerProps) {
  const Icon = tone === "error" ? CircleAlert : AlertTriangle;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-ctl border border-line border-l-[3px] bg-panel py-2 pl-3 pr-2 ${
        tone === "error" ? "border-l-danger" : "border-l-warn"
      }`}
    >
      <Icon aria-hidden size={16} className={`mt-0.5 shrink-0 ${tone === "error" ? "text-danger" : "text-warn"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">
          <span className="sr-only">{tone === "error" ? "Error: " : "Warning: "}</span>
          {title}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
        {actions && <div className="mt-2 flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="touch-target inline-flex size-6 shrink-0 items-center justify-center rounded-ctl text-muted hover:bg-hover hover:text-fg"
        >
          <X aria-hidden size={14} />
        </button>
      )}
    </div>
  );
}

/** Small bordered button for banner actions. */
export function BannerAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-ctl border border-line px-2.5 text-xs font-medium text-fg transition-colors duration-150 hover:bg-hover pointer-coarse:h-11"
    >
      {children}
    </button>
  );
}
