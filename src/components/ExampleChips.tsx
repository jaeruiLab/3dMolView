import { ChipRow, chipClass } from "./ChipRow";

export const EXAMPLE_COMPOUNDS = [
  "Caffeine",
  "Aspirin",
  "Ibuprofen",
  "Paracetamol",
  "Penicillin G",
  "Glucose",
  "Cholesterol",
  "Dopamine",
  "Taxol",
  "Water",
] as const;

interface ExampleChipsProps {
  onSelect: (name: string) => void;
  /** "row": labeled single row with "+N more". "block": plain wrapped list (empty state). */
  variant?: "row" | "block";
}

export function ExampleChips({ onSelect, variant = "row" }: ExampleChipsProps) {
  const chips = EXAMPLE_COMPOUNDS.map((name) => (
    <button key={name} type="button" className={chipClass} onClick={() => onSelect(name)}>
      {name}
    </button>
  ));

  if (variant === "block") {
    return (
      <div role="group" aria-label="Example compounds" className="flex max-w-md flex-wrap justify-center gap-1.5">
        {chips}
      </div>
    );
  }

  return (
    <ChipRow label="Examples" count={chips.length}>
      {chips}
    </ChipRow>
  );
}
