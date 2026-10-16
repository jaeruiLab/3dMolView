/**
 * Typed client for the PubChem PUG REST API (https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest).
 *
 * Every function takes an AbortSignal so callers can cancel stale requests. Failures are
 * thrown as ApiError (service "pubchem") with a `kind` the UI maps to a specific message;
 * cancellations are thrown as AbortedError and should be ignored by callers.
 *
 * Politeness: requests are rate limited to PubChem's published 5 per second, a "busy"
 * answer is retried once after a short pause, and if PubChem still refuses, the client
 * stops contacting it for a cool-down period (so the app doesn't prolong a block) and
 * callers fall back to other sources.
 */
import type { CompoundProperties, StructureDimension } from "../types";
import {
  ApiError,
  RateLimiter,
  httpRequest,
  isRecord,
  readJson as readJsonFrom,
  sleep,
  type RequestOptions,
  type ServiceConfig,
} from "./http";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const AUTOCOMPLETE = "https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound";

const PUBCHEM: ServiceConfig = {
  service: "pubchem",
  label: "PubChem",
  // 5 per second, with a slightly longer window for clock jitter between us and PubChem.
  limiter: new RateLimiter(5, 1_100),
  timeoutMs: 10_000,
};

/** Pause before the single automatic retry of a "busy" response. */
const BUSY_RETRY_DELAY_MS = 2_000;
/** Cool-down after PubChem refuses twice, when it doesn't tell us how long (its usual value). */
const DEFAULT_COOLDOWN_S = 30;

let cooldownUntil = 0;

/** Seconds until PubChem will be contacted again, or 0 if it is not cooling down. */
export function pubchemCooldownRemaining(): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

/**
 * Rate-limited request with one automatic retry for "busy" responses: a momentary
 * overload usually clears within a couple of seconds. If the retry is also refused,
 * PubChem enters a cool-down during which requests fail immediately without being sent.
 */
async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const remaining = pubchemCooldownRemaining();
  if (remaining > 0) {
    throw new ApiError("busy", "pubchem", "PubChem is cooling down after refusing requests.", {
      retryAfterSeconds: remaining,
    });
  }
  try {
    return await httpRequest(PUBCHEM, url, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.kind !== "busy") throw error;
    await sleep(BUSY_RETRY_DELAY_MS, options.signal);
    try {
      return await httpRequest(PUBCHEM, url, options);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.kind === "busy") {
        const seconds = retryError.retryAfterSeconds ?? DEFAULT_COOLDOWN_S;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + seconds * 1000);
      }
      throw retryError;
    }
  }
}

const readJson = (response: Response) => readJsonFrom(response, "pubchem");

/** Extract the CID list from `{ IdentifierList: { CID: [...] } }`. */
function parseCidList(body: unknown): number[] {
  const list = isRecord(body) && isRecord(body.IdentifierList) ? body.IdentifierList.CID : null;
  if (!Array.isArray(list)) throw new ApiError("invalid_data", "pubchem", "PubChem returned no identifier list.");
  return list.filter((cid): cid is number => typeof cid === "number" && Number.isInteger(cid));
}

/** Resolve a compound name (common, trade or systematic) to its first CID. */
export async function fetchCidByName(name: string, signal?: AbortSignal): Promise<number> {
  const url = `${PUG}/compound/name/${encodeURIComponent(name)}/cids/JSON`;
  const cids = parseCidList(await readJson(await request(url, { signal })));
  const cid = cids[0];
  if (cid === undefined || cid <= 0) throw new ApiError("not_found", "pubchem", `No CID for "${name}".`);
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
  if (cid === undefined || cid <= 0) throw new ApiError("not_found", "pubchem", "No compound matches this structure.");
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
    if (error instanceof ApiError && error.kind === "not_found") {
      return { sdf: await fetchSdf(cid, "2d", signal), dimension: "2d" };
    }
    throw error;
  }
}

async function fetchSdf(cid: number, recordType: StructureDimension, signal?: AbortSignal): Promise<string> {
  const response = await request(`${PUG}/compound/cid/${cid}/record/SDF?record_type=${recordType}`, { signal });
  const text = await response.text();
  if (!text.includes("M  END")) {
    throw new ApiError("invalid_data", "pubchem", `PubChem returned an empty or invalid ${recordType.toUpperCase()} SDF.`);
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
    if (error instanceof ApiError && error.kind === "bad_request") {
      response = await request(url(LEGACY_PROPERTY_FIELDS), { signal });
    } else {
      throw error;
    }
  }

  const body = await readJson(response);
  const table = isRecord(body) && isRecord(body.PropertyTable) ? body.PropertyTable.Properties : null;
  const row: unknown = Array.isArray(table) ? table[0] : null;
  if (!isRecord(row)) throw new ApiError("invalid_data", "pubchem", "PubChem returned no properties.");
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
    logP: toNumber(row.XLogP),
    logPMethod: "XLogP3",
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
