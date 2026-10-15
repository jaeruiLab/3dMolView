/**
 * Typed client for the PubChem PUG REST API (https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest).
 *
 * Every function takes an AbortSignal so callers can cancel stale requests, and every
 * request has its own timeout. Failures are thrown as PubChemError with a `kind` that the
 * UI maps to a specific message; cancellations are thrown as AbortedError and should be
 * ignored by callers.
 */
import type { CompoundProperties, StructureDimension } from "../types";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const AUTOCOMPLETE = "https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound";
export const DEFAULT_TIMEOUT_MS = 10_000;

export type PubChemErrorKind =
  | "not_found" // 404, or a SMILES that parses but matches no compound (CID 0)
  | "bad_request" // 400: e.g. SMILES PubChem cannot parse
  | "busy" // 429 / 503 / 502 / 504: throttled or overloaded
  | "timeout" // our client-side timeout fired
  | "network" // fetch rejected: offline, DNS, CORS-less error response
  | "invalid_data" // response arrived but is not what we expected
  | "http"; // any other non-OK status

export class PubChemError extends Error {
  readonly kind: PubChemErrorKind;
  readonly status: number | undefined;

  constructor(kind: PubChemErrorKind, message: string, status?: number) {
    super(message);
    this.name = "PubChemError";
    this.kind = kind;
    this.status = status;
  }
}

/** Thrown when the caller's signal aborted the request. Not an error from the user's point of view. */
export class AbortedError extends Error {
  constructor() {
    super("Request was cancelled");
    this.name = "AbortedError";
  }
}

export function isAbortedError(error: unknown): error is AbortedError {
  return error instanceof AbortedError;
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
}

/**
 * fetch() with a timeout and a caller-provided cancel signal, mapping every failure mode
 * to PubChemError / AbortedError. Resolves only for 2xx responses.
 */
async function request(url: string, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, init }: RequestOptions = {}): Promise<Response> {
  if (signal?.aborted) throw new AbortedError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new PubChemError("timeout", `PubChem did not respond within ${timeoutMs / 1000} s.`);
    if (signal?.aborted) throw new AbortedError();
    // fetch rejects with TypeError for network failures. PubChem's 503 pages sometimes
    // omit CORS headers, which also surfaces here; the message covers both.
    throw new PubChemError("network", error instanceof Error ? error.message : "Network request failed.");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (response.ok) return response;

  const detail = await readFaultMessage(response);
  const status = response.status;
  if (status === 404) throw new PubChemError("not_found", detail ?? "Not found.", status);
  if (status === 400) throw new PubChemError("bad_request", detail ?? "Bad request.", status);
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    throw new PubChemError("busy", detail ?? "PubChem is busy.", status);
  }
  throw new PubChemError("http", detail ?? `HTTP ${status}`, status);
}

/** PUG REST errors carry `{ Fault: { Code, Message, Details } }`; extract the message if present. */
async function readFaultMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const fault = isRecord(body) && isRecord(body.Fault) ? body.Fault : null;
    if (fault && typeof fault.Message === "string") {
      const details = Array.isArray(fault.Details) ? fault.Details.filter((d) => typeof d === "string") : [];
      return [fault.Message, ...details].join(" ");
    }
  } catch {
    // Body was not JSON; fall back to the generic message.
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PubChemError("invalid_data", "PubChem returned a response that is not valid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract the CID list from `{ IdentifierList: { CID: [...] } }`. */
function parseCidList(body: unknown): number[] {
  const list = isRecord(body) && isRecord(body.IdentifierList) ? body.IdentifierList.CID : null;
  if (!Array.isArray(list)) throw new PubChemError("invalid_data", "PubChem returned no identifier list.");
  return list.filter((cid): cid is number => typeof cid === "number" && Number.isInteger(cid));
}

/** Resolve a compound name (common, trade or systematic) to its first CID. */
export async function fetchCidByName(name: string, signal?: AbortSignal): Promise<number> {
  const url = `${PUG}/compound/name/${encodeURIComponent(name)}/cids/JSON`;
  const cids = parseCidList(await readJson(await request(url, { signal })));
  const cid = cids[0];
  if (cid === undefined || cid <= 0) throw new PubChemError("not_found", `No CID for "${name}".`);
  return cid;
}

/**
 * Resolve a SMILES string to its first CID.
 * Uses POST because SMILES contains '#', '/', '+' and '\' which break URL paths.
 * PubChem answers a valid-but-unknown structure with CID 0; that is reported as not_found.
 */
export async function fetchCidBySmiles(smiles: string, signal?: AbortSignal): Promise<number> {
  const response = await request(`${PUG}/compound/smiles/cids/JSON`, {
    signal,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ smiles }).toString(),
    },
  });
  const cids = parseCidList(await readJson(response));
  const cid = cids[0];
  if (cid === undefined || cid <= 0) throw new PubChemError("not_found", "No compound matches this structure.");
  return cid;
}

export interface StructureRecord {
  sdf: string;
  dimension: StructureDimension;
}

/**
 * Fetch the SDF record for a CID: the computed 3D conformer if PubChem has one,
 * otherwise the 2D depiction coordinates. Large, salt and highly flexible compounds
 * have no 3D conformer and return 404 for record_type=3d.
 */
export async function fetchStructure(cid: number, signal?: AbortSignal): Promise<StructureRecord> {
  try {
    return { sdf: await fetchSdf(cid, "3d", signal), dimension: "3d" };
  } catch (error) {
    if (error instanceof PubChemError && error.kind === "not_found") {
      return { sdf: await fetchSdf(cid, "2d", signal), dimension: "2d" };
    }
    throw error;
  }
}

async function fetchSdf(cid: number, recordType: StructureDimension, signal?: AbortSignal): Promise<string> {
  const response = await request(`${PUG}/compound/cid/${cid}/record/SDF?record_type=${recordType}`, { signal });
  const text = await response.text();
  if (!text.includes("M  END")) {
    throw new PubChemError("invalid_data", `PubChem returned an empty or invalid ${recordType.toUpperCase()} SDF.`);
  }
  return text;
}

/** Property names requested from PubChem (current naming, mid-2025 onward). */
const PROPERTY_FIELDS = [
  "Title",
  "MolecularFormula",
  "MolecularWeight",
  "IUPACName",
  "SMILES",
  "ConnectivitySMILES",
  "XLogP",
  "TPSA",
  "HBondDonorCount",
  "HBondAcceptorCount",
  "RotatableBondCount",
  "Complexity",
  "ExactMass",
];

/** Same set using the legacy SMILES names, used if the current names are rejected. */
const LEGACY_PROPERTY_FIELDS = PROPERTY_FIELDS.map((field) =>
  field === "SMILES" ? "IsomericSMILES" : field === "ConnectivitySMILES" ? "CanonicalSMILES" : field,
);

export async function fetchProperties(cid: number, signal?: AbortSignal): Promise<CompoundProperties> {
  const url = (fields: string[]) => `${PUG}/compound/cid/${cid}/property/${fields.join(",")}/JSON`;
  let response: Response;
  try {
    response = await request(url(PROPERTY_FIELDS), { signal });
  } catch (error) {
    // A mirror or older deployment that does not know "SMILES"/"ConnectivitySMILES"
    // answers 400 for the whole request; retry once with the legacy names.
    if (error instanceof PubChemError && error.kind === "bad_request") {
      response = await request(url(LEGACY_PROPERTY_FIELDS), { signal });
    } else {
      throw error;
    }
  }

  const body = await readJson(response);
  const table = isRecord(body) && isRecord(body.PropertyTable) ? body.PropertyTable.Properties : null;
  const row: unknown = Array.isArray(table) ? table[0] : null;
  if (!isRecord(row)) throw new PubChemError("invalid_data", "PubChem returned no properties.");
  return normalizeProperties(cid, row);
}

/** PubChem returns some numbers as strings (MolecularWeight, ExactMass); accept both. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeProperties(cid: number, row: Record<string, unknown>): CompoundProperties {
  return {
    cid,
    title: toText(row.Title),
    molecularFormula: toText(row.MolecularFormula),
    molecularWeight: toNumber(row.MolecularWeight),
    exactMass: toNumber(row.ExactMass),
    iupacName: toText(row.IUPACName),
    // Current names first, then the pre-2025 names for the same values.
    smiles: toText(row.SMILES) ?? toText(row.IsomericSMILES),
    connectivitySmiles: toText(row.ConnectivitySMILES) ?? toText(row.CanonicalSMILES),
    xlogp: toNumber(row.XLogP),
    tpsa: toNumber(row.TPSA),
    hBondDonors: toNumber(row.HBondDonorCount),
    hBondAcceptors: toNumber(row.HBondAcceptorCount),
    rotatableBonds: toNumber(row.RotatableBondCount),
    complexity: toNumber(row.Complexity),
  };
}

/** All synonyms PubChem lists for a CID, most common first. */
export async function fetchSynonyms(cid: number, signal?: AbortSignal): Promise<string[]> {
  const body = await readJson(await request(`${PUG}/compound/cid/${cid}/synonyms/JSON`, { signal }));
  const info = isRecord(body) && isRecord(body.InformationList) ? body.InformationList.Information : null;
  const first: unknown = Array.isArray(info) ? info[0] : null;
  const synonyms = isRecord(first) ? first.Synonym : null;
  return Array.isArray(synonyms) ? synonyms.filter((s): s is string => typeof s === "string") : [];
}

/** Spelling suggestions for a compound name, for "Did you mean…". */
export async function fetchNameSuggestions(term: string, signal?: AbortSignal, limit = 5): Promise<string[]> {
  const url = `${AUTOCOMPLETE}/${encodeURIComponent(term)}/json?limit=${limit}`;
  const body = await readJson(await request(url, { signal, timeoutMs: 5_000 }));
  const terms = isRecord(body) && isRecord(body.dictionary_terms) ? body.dictionary_terms.compound : null;
  return Array.isArray(terms) ? terms.filter((t): t is string => typeof t === "string") : [];
}

export function compoundPageUrl(cid: number): string {
  return `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
}
