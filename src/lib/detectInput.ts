import type { InputMode, InputType } from "../types";

/**
 * One SMILES token: a bracket atom (an unterminated one is tolerated at the end), an
 * organic-subset atom (aliphatic or aromatic), a wildcard, a bond symbol, a ring-closure
 * digit (or %nn), a branch parenthesis, or the dot separating disconnected components.
 */
const SMILES_TOKEN = /^(?:\[[^[\]\s]+\]|\[[^[\]\s]*$|Cl|Br|[BCNOPSFI]|[bcnops]|\*|[-=#$:/\\.]|%\d{2}|\d|[()])/;

/** Characters that essentially never appear in a compound name but are common in SMILES. */
const SMILES_SYNTAX = /[=#()[\]@/\\+]/;

/**
 * True if the whole string uses only the SMILES alphabet. This is deliberately lexical:
 * syntax errors such as unbalanced parentheses still count as SMILES, so that PubChem
 * reports "SMILES could not be parsed" instead of "no compound named …".
 */
function tokenizesAsSmiles(input: string): boolean {
  let rest = input;
  while (rest.length > 0) {
    const match = SMILES_TOKEN.exec(rest);
    if (!match) return false;
    rest = rest.slice(match[0].length);
  }
  return true;
}

/**
 * Guess whether free text is a SMILES string or a compound name.
 *
 * The rule is stricter than "has digits or punctuation", because names such as
 * "2-butanol" or "1,4-dioxane" contain digits too. Input is treated as SMILES when:
 *   - it has no whitespace, and
 *   - it lexes completely as SMILES (so letters like "u", "a", "t" rule it out), and
 *   - it shows some SMILES signal: syntax characters (= # ( ) [ ] @ / \ +),
 *     ring-closure digits, or is an all-uppercase chain of 3+ organic atoms ("CCO").
 */
export function detectInputType(raw: string): InputType {
  const input = raw.trim();
  if (input.length === 0 || /\s/.test(input)) return "name";
  if (!tokenizesAsSmiles(input)) return "name";

  if (SMILES_SYNTAX.test(input)) return "smiles";
  if (/\d/.test(input) && /[A-Za-z]/.test(input)) return "smiles";
  if (input.length >= 3 && /^(?:Cl|Br|[BCNOPSFI])+$/.test(input)) return "smiles";
  return "name";
}

/** Resolve a UI mode to the concrete interpretation used for the lookup. */
export function resolveInputType(query: string, mode: InputMode): InputType {
  return mode === "auto" ? detectInputType(query) : mode;
}
