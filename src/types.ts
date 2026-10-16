/** How the search box input should be interpreted. "auto" runs detectInput(). */
export type InputMode = "auto" | "name" | "smiles";

/** The concrete interpretation used for a lookup. */
export type InputType = "name" | "smiles";

export interface SearchRequest {
  /** Trimmed user input. */
  query: string;
  /** Mode selected in the UI when the search was made. */
  mode: InputMode;
  /** Resolved interpretation (equal to `mode` unless mode is "auto"). */
  type: InputType;
}

/** Normalized compound properties from any source. Missing values are `null`. */
export interface CompoundProperties {
  /** PubChem CID; null for structures that did not come from PubChem. */
  cid: number | null;
  title: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;
  exactMass: number | null;
  iupacName: string | null;
  /** Full SMILES including stereo and isotopes (PubChem "SMILES", formerly "IsomericSMILES"). */
  smiles: string | null;
  /** SMILES without stereo/isotopes (PubChem "ConnectivitySMILES", formerly "CanonicalSMILES"). */
  connectivitySmiles: string | null;
  logP: number | null;
  /** PubChem reports XLogP3; in-browser computation (OpenChemLib) reports cLogP. */
  logPMethod: "XLogP3" | "cLogP";
  tpsa: number | null;
  hBondDonors: number | null;
  hBondAcceptors: number | null;
  rotatableBonds: number | null;
  complexity: number | null;
}

/** Which coordinates the structure has. */
export type StructureDimension = "3d" | "2d";

/**
 * Where the structure came from: PubChem's database, NCI CACTUS (3D generated on their
 * server), or computed in the browser from SMILES with OpenChemLib.
 */
export type DataSource = "pubchem" | "cactus" | "local";

/** Why a non-PubChem source was used. */
export type FallbackReason = "pubchem-unavailable" | "not-in-pubchem";

export interface Molecule {
  /** The search that produced this molecule. */
  request: SearchRequest;
  source: DataSource;
  /** Null when the structure came from PubChem itself. */
  fallback: FallbackReason | null;
  /** PubChem CID; null for CACTUS and in-browser structures. */
  cid: number | null;
  /** Display name: PubChem title, else the searched name, else "CID n" / "Unnamed structure". */
  name: string;
  sdf: string;
  dimension: StructureDimension;
  properties: CompoundProperties;
  synonyms: string[];
  /** Atom count and element symbols parsed from the SDF (for the legend and aria-label). */
  atomCount: number;
  elements: string[];
  retrievedAt: Date;
}

export type ViewerStyle = "ballstick" | "stick" | "sphere" | "line";

export interface ViewerSettings {
  style: ViewerStyle;
  labels: boolean;
  surface: boolean;
  spin: boolean;
}

/** Category of a failed search, used to choose message and next step. */
export type SearchErrorKind =
  | "not_found"
  | "bad_input"
  | "busy"
  | "timeout"
  | "network"
  | "invalid_data"
  | "http";

export interface SearchError {
  kind: SearchErrorKind;
  /** One-line specific cause, e.g. `No compound found for "cafeine"`. */
  title: string;
  /** Optional supporting sentence. */
  detail?: string;
  /** Whether a plain retry might succeed. */
  retryable: boolean;
  /** "Did you mean…" candidates from PubChem autocomplete (name searches only). */
  suggestions?: string[];
}

/**
 * resolving: looking up the identifier on PubChem · fetching: structure and properties
 * fallback: PubChem unavailable, asking NCI CACTUS · computing: building 3D in the browser
 */
export type LoadStage = "resolving" | "fetching" | "fallback" | "computing";

export interface RecentSearch {
  query: string;
  mode: InputMode;
  /** Resolved compound name shown on the button. */
  label: string;
  /** Identity used for de-duplication: "cid:2519", or source + query for non-PubChem results. */
  key: string;
}

export type Theme = "dark" | "light";
