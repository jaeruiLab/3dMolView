/**
 * Development-only PubChem mock. Enabled with `npm run dev:mock` (recorded fixtures) or
 * `npm run dev:pubchem-down` (every PubChem request answers 503, to exercise the fallbacks).
 * main.tsx installs it only when import.meta.env.DEV is true, so it never ships.
 *
 * Only requests to pubchem.ncbi.nlm.nih.gov are intercepted; NCI CACTUS and everything else
 * go to the network as usual. Unrecorded requests get the answer PubChem would give for an
 * unknown compound (404, or CID 0 for a well-formed SMILES), so error paths work offline too.
 */
import fixtureFile from "./fixtures.json";

export type MockMode = "fixtures" | "busy";

interface FixtureResponse {
  status: number;
  type: string;
  body: string;
}

interface FixtureFile {
  meta: { recordedAt: string; source: string; note?: string };
  /** Vocabulary for the autocomplete endpoint ("Did you mean"). */
  names: string[];
  responses: Record<string, FixtureResponse>;
}

const fixtures = fixtureFile as FixtureFile;
const HOST = "pubchem.ncbi.nlm.nih.gov";
/** Simulated network latency, so loading states are visible. */
const LATENCY_MS = 150;

/**
 * Lookup key shared with scripts/record-fixtures.mjs: method, lower-cased path and query
 * (PubChem names are case-insensitive), and for the SMILES POST the exact SMILES.
 */
export function fixtureKey(method: string, url: URL, body: string | null): string {
  const smiles = body ? new URLSearchParams(body).get("smiles") : null;
  return `${method.toUpperCase()} ${(url.pathname + url.search).toLowerCase()}${smiles ? ` ${smiles}` : ""}`;
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function fault(status: number, code: string, message: string): Response {
  return json(status, { Fault: { Code: code, Message: message } });
}

function delay(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    if (signal?.aborted) return abort();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      abort();
    });
  });
}

/** Rough SMILES well-formedness check, used to choose between "CID 0" and "400" when unrecorded. */
function looksParseable(smiles: string): boolean {
  let depth = 0;
  for (const ch of smiles) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function unrecorded(method: string, url: URL, body: string | null): Response {
  const path = url.pathname.toLowerCase();
  if (path.startsWith("/rest/autocomplete/compound/")) {
    const term = decodeURIComponent(path.split("/")[4] ?? "");
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const matches = fixtures.names.filter((name) => name.toLowerCase().startsWith(term)).slice(0, limit);
    return json(200, { status: { code: 0 }, total: matches.length, dictionary_terms: { compound: matches } });
  }
  if (method === "POST" && path.endsWith("/compound/smiles/cids/json")) {
    const smiles = new URLSearchParams(body ?? "").get("smiles") ?? "";
    return looksParseable(smiles)
      ? json(200, { IdentifierList: { CID: [0] } })
      : fault(400, "PUGREST.BadRequest", "Unable to standardize the given structure (mock).");
  }
  return fault(404, "PUGREST.NotFound", "No record found (mock: not in fixtures).");
}

export function installPubChemMock(mode: MockMode): void {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== HOST) return realFetch(input, init);

    await delay(LATENCY_MS, init?.signal);
    if (mode === "busy") {
      return fault(503, "PUGREST.ServerBusy", "Too many requests or server too busy (mock).");
    }

    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    const recorded = fixtures.responses[fixtureKey(method, url, body)];
    if (!recorded) return unrecorded(method, url, body);
    return new Response(recorded.body, { status: recorded.status, headers: { "Content-Type": recorded.type } });
  };

  console.info(
    `[MolView] PubChem is mocked (${mode}).` +
      (mode === "fixtures" ? ` Fixtures: ${fixtures.meta.source}, ${fixtures.meta.recordedAt}.` : ""),
  );
}

export const fixtureMeta = fixtures.meta;
