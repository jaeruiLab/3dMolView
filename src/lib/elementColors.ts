/**
 * CPK colors as used by Jmol (and by 3Dmol's "Jmol" colorscheme), plus element
 * names for the legend. Keep in sync with the viewer's `colorscheme: "Jmol"`.
 * Source: https://jmol.sourceforge.net/jscolors/
 */
export interface ElementInfo {
  symbol: string;
  name: string;
  color: string;
}

const TABLE: ReadonlyArray<readonly [symbol: string, name: string, color: string]> = [
  ["H", "Hydrogen", "#FFFFFF"],
  ["He", "Helium", "#D9FFFF"],
  ["Li", "Lithium", "#CC80FF"],
  ["Be", "Beryllium", "#C2FF00"],
  ["B", "Boron", "#FFB5B5"],
  ["C", "Carbon", "#909090"],
  ["N", "Nitrogen", "#3050F8"],
  ["O", "Oxygen", "#FF0D0D"],
  ["F", "Fluorine", "#90E050"],
  ["Ne", "Neon", "#B3E3F5"],
  ["Na", "Sodium", "#AB5CF2"],
  ["Mg", "Magnesium", "#8AFF00"],
  ["Al", "Aluminium", "#BFA6A6"],
  ["Si", "Silicon", "#F0C8A0"],
  ["P", "Phosphorus", "#FF8000"],
  ["S", "Sulfur", "#FFFF30"],
  ["Cl", "Chlorine", "#1FF01F"],
  ["Ar", "Argon", "#80D1E3"],
  ["K", "Potassium", "#8F40D4"],
  ["Ca", "Calcium", "#3DFF00"],
  ["Sc", "Scandium", "#E6E6E6"],
  ["Ti", "Titanium", "#BFC2C7"],
  ["V", "Vanadium", "#A6A6AB"],
  ["Cr", "Chromium", "#8A99C7"],
  ["Mn", "Manganese", "#9C7AC7"],
  ["Fe", "Iron", "#E06633"],
  ["Co", "Cobalt", "#F090A0"],
  ["Ni", "Nickel", "#50D050"],
  ["Cu", "Copper", "#C88033"],
  ["Zn", "Zinc", "#7D80B0"],
  ["Ga", "Gallium", "#C28F8F"],
  ["Ge", "Germanium", "#668F8F"],
  ["As", "Arsenic", "#BD80E3"],
  ["Se", "Selenium", "#FFA100"],
  ["Br", "Bromine", "#A62929"],
  ["Kr", "Krypton", "#5CB8D1"],
  ["Rb", "Rubidium", "#702EB0"],
  ["Sr", "Strontium", "#00FF00"],
  ["Y", "Yttrium", "#94FFFF"],
  ["Zr", "Zirconium", "#94E0E0"],
  ["Mo", "Molybdenum", "#54B5B5"],
  ["Ru", "Ruthenium", "#248F8F"],
  ["Rh", "Rhodium", "#0A7D8C"],
  ["Pd", "Palladium", "#006985"],
  ["Ag", "Silver", "#C0C0C0"],
  ["Cd", "Cadmium", "#FFD98F"],
  ["In", "Indium", "#A67573"],
  ["Sn", "Tin", "#668080"],
  ["Sb", "Antimony", "#9E63B5"],
  ["Te", "Tellurium", "#D47A00"],
  ["I", "Iodine", "#940094"],
  ["Xe", "Xenon", "#429EB0"],
  ["Cs", "Caesium", "#57178F"],
  ["Ba", "Barium", "#00C900"],
  ["La", "Lanthanum", "#70D4FF"],
  ["Gd", "Gadolinium", "#45FFC7"],
  ["W", "Tungsten", "#2194D6"],
  ["Pt", "Platinum", "#D0D0E0"],
  ["Au", "Gold", "#FFD123"],
  ["Hg", "Mercury", "#B8B8D0"],
  ["Tl", "Thallium", "#A6544D"],
  ["Pb", "Lead", "#575961"],
  ["Bi", "Bismuth", "#9E4FB5"],
  ["U", "Uranium", "#008FFF"],
];

const BY_SYMBOL = new Map<string, ElementInfo>(
  TABLE.map(([symbol, name, color]) => [symbol, { symbol, name, color }]),
);

/** Jmol's color for elements it has no entry for. */
const UNKNOWN_COLOR = "#FF1493";

/** Normalize "CL" / "cl" to "Cl". */
function normalizeSymbol(symbol: string): string {
  const s = symbol.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function getElementInfo(symbol: string): ElementInfo {
  const normalized = normalizeSymbol(symbol);
  return BY_SYMBOL.get(normalized) ?? { symbol: normalized, name: normalized, color: UNKNOWN_COLOR };
}

/**
 * Order element symbols the way formulas are written (Hill order):
 * carbon first, hydrogen second, then everything else alphabetically.
 * Without carbon, everything (including hydrogen) is alphabetical.
 */
export function sortHill(symbols: Iterable<string>): string[] {
  const unique = [...new Set([...symbols].map(normalizeSymbol))];
  const hasCarbon = unique.includes("C");
  const rank = (s: string) => (s === "C" ? 0 : hasCarbon && s === "H" ? 1 : 2);
  return unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
