import { useMemo } from "react";
import { parseFormula } from "../lib/formula";

/** Molecular formula with real subscripts (counts) and superscripts (charges, isotopes). */
export function Formula({ value, className = "" }: { value: string; className?: string }) {
  const parts = useMemo(() => parseFormula(value), [value]);
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {parts.map((part, i) =>
        part.kind === "sub" ? (
          <sub key={i} className="text-[0.75em] leading-none">
            {part.text}
          </sub>
        ) : part.kind === "sup" ? (
          <sup key={i} className="text-[0.75em] leading-none">
            {part.text}
          </sup>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}
