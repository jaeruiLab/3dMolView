import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../../lib/clipboard";

interface CopyButtonProps {
  value: string;
  /** What is being copied, for the accessible name: "Copy SMILES". */
  subject: string;
}

const RESET_MS = 1500;

/** Small text button that copies `value` and reads "Copied" for 1.5 s. */
export function CopyButton({ value, subject }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), RESET_MS);
  };

  const text = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === "idle" ? `Copy ${subject}` : `${subject}: ${text.toLowerCase()}`}
      className="touch-target inline-flex h-6 shrink-0 items-center gap-1 rounded-ctl px-1.5 text-xs text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
    >
      {state === "copied" ? <Check aria-hidden size={12} /> : <Copy aria-hidden size={12} />}
      <span aria-live="polite">{text}</span>
    </button>
  );
}
