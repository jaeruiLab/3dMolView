/**
 * NCI/CADD Chemical Identifier Resolver ("CACTUS"): https://cactus.nci.nih.gov/chemical/structure
 *
 * Used as the fallback for *name* searches when PubChem is unavailable. CACTUS resolves
 * names and returns a 3D structure generated on its server. It answers unknown or invalid
 * identifiers with HTTP 500 (not 404), and rejects SMILES containing "/" (an encoded slash
 * in the path), so SMILES fallbacks are computed in the browser instead (see chem/).
 */
import { ApiError, RateLimiter, httpRequest, type ServiceConfig } from "./http";

const BASE = "https://cactus.nci.nih.gov/chemical/structure";

const CACTUS: ServiceConfig = {
  service: "cactus",
  label: "NCI CACTUS",
  // No published limit; stay well below PubChem's to be a polite fallback.
  limiter: new RateLimiter(3, 1_100),
  // 3D generation happens on their side and can take a few seconds.
  timeoutMs: 15_000,
  classifyStatus: (status) => (status === 404 || status === 500 ? "not_found" : undefined),
};

function url(identifier: string, representation: string): string {
  return `${BASE}/${encodeURIComponent(identifier)}/${representation}`;
}

/** 3D SD file for a compound name. Throws ApiError("not_found") if CACTUS cannot resolve it. */
export async function fetchCactusSdf(name: string, signal?: AbortSignal): Promise<string> {
  const response = await httpRequest(CACTUS, url(name, "file?format=sdf&get3d=true"), { signal });
  const text = await response.text();
  if (!text.includes("M  END")) {
    throw new ApiError("invalid_data", "cactus", "NCI CACTUS returned an empty or invalid SDF.");
  }
  return text;
}

/** IUPAC name, or null if unavailable. Never throws except on cancellation. */
export async function fetchCactusIupacName(name: string, signal?: AbortSignal): Promise<string | null> {
  const lines = await fetchLines(name, "iupac_name", signal);
  return lines[0] ?? null;
}

/** CACTUS's canonical SMILES, or null if unavailable. Never throws except on cancellation. */
export async function fetchCactusSmiles(name: string, signal?: AbortSignal): Promise<string | null> {
  const lines = await fetchLines(name, "smiles", signal);
  return lines[0] ?? null;
}

/** Known names (first is usually the IUPAC name). Empty if unavailable. Never throws except on cancellation. */
export async function fetchCactusNames(name: string, signal?: AbortSignal): Promise<string[]> {
  return fetchLines(name, "names", signal);
}

async function fetchLines(name: string, representation: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const response = await httpRequest(CACTUS, url(name, representation), { signal });
    return (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

export const CACTUS_HOME = "https://cactus.nci.nih.gov/chemical/structure";
