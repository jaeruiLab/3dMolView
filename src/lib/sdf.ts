import { sortHill } from "./elementColors";

export interface SdfSummary {
  atomCount: number;
  bondCount: number;
  /** Unique element symbols in Hill order. */
  elements: string[];
}

/**
 * Read the atom block of the first record in an SD file (V2000 or V3000).
 * Returns null if the text does not look like a usable molfile with at least one atom,
 * which callers treat as "empty or invalid SDF".
 */
export function summarizeSdf(sdf: string): SdfSummary | null {
  // Only the first record matters; PubChem returns one per CID.
  const record = sdf.split("$$$$")[0] ?? "";
  if (!record.includes("M  END")) return null;

  const lines = record.split(/\r?\n/);
  const counts = lines[3];
  if (counts === undefined) return null;

  if (counts.includes("V3000")) return summarizeV3000(lines);

  const atomCount = Number.parseInt(counts.slice(0, 3), 10);
  const bondCount = Number.parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return null;

  const symbols: string[] = [];
  for (let i = 4; i < 4 + atomCount; i++) {
    const line = lines[i];
    if (line === undefined) return null;
    // V2000 atom line: x, y, z in columns 1–30, element symbol in columns 32–34.
    const symbol = line.slice(31, 34).trim();
    if (!/^[A-Za-z]{1,3}$/.test(symbol)) return null;
    symbols.push(symbol);
  }

  return {
    atomCount,
    bondCount: Number.isFinite(bondCount) ? bondCount : 0,
    elements: sortHill(symbols),
  };
}

function summarizeV3000(lines: string[]): SdfSummary | null {
  const symbols: string[] = [];
  let bondCount = 0;
  let inAtoms = false;
  for (const line of lines) {
    if (line.startsWith("M  V30 BEGIN ATOM")) inAtoms = true;
    else if (line.startsWith("M  V30 END ATOM")) inAtoms = false;
    else if (inAtoms && line.startsWith("M  V30 ")) {
      // "M  V30 index symbol x y z ..."
      const symbol = line.slice(7).trim().split(/\s+/)[1];
      if (symbol) symbols.push(symbol);
    } else if (line.startsWith("M  V30 COUNTS")) {
      bondCount = Number.parseInt(line.slice(13).trim().split(/\s+/)[1] ?? "0", 10) || 0;
    }
  }
  if (symbols.length === 0) return null;
  return { atomCount: symbols.length, bondCount, elements: sortHill(symbols) };
}
