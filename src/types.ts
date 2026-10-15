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

/** Normalized subset of PubChem's computed properties. Missing values are `null`. */
export interface CompoundProperties {
  cid: number;
  title: string | null;
  molecularFormula: string | null;
  molecularWeight: number | null;
  exactMass: number | null;
  iupacName: string | null;
  /** Full SMILES including stereo and isotopes (PubChem "SMILES", formerly "IsomericSMILES"). */
  smiles: string | null;
  /** SMILES without stereo/isotopes (PubChem "ConnectivitySMILES", formerly "CanonicalSMILES"). */
  connectivitySmiles: string | null;
  xlogp: number | null;
  tpsa: number | null;
  hBondDonors: number | null;
  hBondAcceptors: number | null;
  rotatableBonds: number | null;
  complexity: number | null;
}

/** Which coordinates PubChem supplied for the structure. */
export type StructureDimension = "3d" | "2d";

export interface Molecule {
  /** The search that produced this molecule. */
  request: SearchRequest;
  cid: number;
  /** Display name: PubChem title, else the searched name, else "CID n". */
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

export type LoadStage = "resolving" | "fetching";

export interface RecentSearch {
  query: string;
  mode: InputMode;
  /** Resolved compound name shown on the button. */
  label: string;
  cid: number;
}

export type Theme = "dark" | "light";
