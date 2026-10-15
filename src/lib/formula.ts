/** A run of formula text and how it should be set typographically. */
export interface FormulaPart {
  text: string;
  kind: "base" | "sub" | "sup";
}

const MINUS = "−";

/**
 * Split a PubChem molecular formula into base text, subscripts and superscripts.
 *
 *   "C8H10N4O2"        → C, 8(sub), H, 10(sub), …
 *   "C2H3O2-"          → … O, 2(sub), −(sup)
 *   "Ca+2"             → Ca, 2+(sup)              (PubChem writes charge as sign then number)
 *   "C16H18N2O4S.K"    → … S, " · ", K             (salt components joined with a middle dot)
 *   "2Na+"             → 2, Na, +(sup)             (leading stoichiometric coefficient stays inline)
 *   "[13C]H4"          → 13(sup), C, H, 4(sub)     (bracketed isotope label)
 */
export function parseFormula(formula: string): FormulaPart[] {
  const parts: FormulaPart[] = [];
  const components = formula.split(".");

  components.forEach((component, index) => {
    if (index > 0) parts.push({ text: " · ", kind: "base" });

    let body = component;

    // Trailing charge: "+", "-", "+2", "-3".
    let charge: string | null = null;
    const chargeMatch = /([+-])(\d*)$/.exec(body);
    if (chargeMatch) {
      const sign = chargeMatch[1] === "-" ? MINUS : "+";
      const magnitude = chargeMatch[2] ?? "";
      charge = magnitude === "" || magnitude === "1" ? sign : `${magnitude}${sign}`;
      body = body.slice(0, chargeMatch.index);
    }

    // Leading coefficient: "2Na" → "2" inline.
    const coefficient = /^\d+/.exec(body);
    if (coefficient) {
      parts.push({ text: coefficient[0], kind: "base" });
      body = body.slice(coefficient[0].length);
    }

    const token = /\[(\d+)([A-Z][a-z]?)\]|([A-Z][a-z]?)|(\d+)|(.)/g;
    for (let m = token.exec(body); m !== null; m = token.exec(body)) {
      const [, isoMass, isoElement, element, count, other] = m;
      if (isoMass && isoElement) {
        parts.push({ text: isoMass, kind: "sup" }, { text: isoElement, kind: "base" });
      } else if (element) {
        parts.push({ text: element, kind: "base" });
      } else if (count) {
        parts.push({ text: count, kind: "sub" });
      } else if (other) {
        parts.push({ text: other, kind: "base" });
      }
    }

    if (charge) parts.push({ text: charge, kind: "sup" });
  });

  return mergeAdjacent(parts);
}

/** Join consecutive parts of the same kind so the DOM stays small. */
function mergeAdjacent(parts: FormulaPart[]): FormulaPart[] {
  const merged: FormulaPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}
