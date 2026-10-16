/** Message types shared by the chemistry worker and its client. */

/** Properties OpenChemLib can compute from a structure. */
export interface LocalProperties {
  /** Hill-order formula, e.g. "C8H10N4O2". */
  formula: string;
  molecularWeight: number;
  /** Monoisotopic mass. */
  exactMass: number;
  /** OpenChemLib cLogP (not PubChem's XLogP3). */
  logP: number;
  tpsa: number;
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  /** Isomeric SMILES as written by OpenChemLib. */
  smiles: string;
}

export type ChemRequest =
  | { id: number; type: "smilesTo3d"; smiles: string }
  | { id: number; type: "describeMolfile"; molfile: string };

export type ChemErrorCode = "parse" | "embed" | "internal";

export type ChemResponse =
  | { id: number; ok: true; molfile?: string; properties: LocalProperties }
  | { id: number; ok: false; code: ChemErrorCode; message: string };
