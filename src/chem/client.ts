/**
 * Main-thread client for the chemistry worker. The worker (and OpenChemLib, ~1 MB plus
 * ~1.3 MB of parameter tables) is created on first use, so normal PubChem searches never
 * download it.
 *
 * Cancellation: a conformer search cannot be interrupted from outside, so aborting a job
 * terminates the worker. Jobs only belong to the current search (a new search aborts the
 * previous one first), so every job still pending at that point is stale.
 */
import { AbortedError, ApiError } from "../api/http";
import type { ChemRequest, ChemResponse, LocalProperties } from "./protocol";

export type { LocalProperties } from "./protocol";

/** Generous: paclitaxel (113 atoms with hydrogens) takes ~8 s on a laptop. */
const JOB_TIMEOUT_MS = 45_000;

/** A request before the client assigns its id (Omit distributed over the union). */
type JobMessage = ChemRequest extends infer R ? (R extends ChemRequest ? Omit<R, "id"> : never) : never;

type Pending = { resolve: (response: ChemResponse) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rejectAll(error: Error): void {
  for (const job of pending.values()) job.reject(error);
  pending.clear();
}

function stopWorker(error: Error): void {
  worker?.terminate();
  worker = null;
  rejectAll(error);
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./chem.worker.ts", import.meta.url), { type: "module", name: "chemistry" });
  created.onmessage = (event: MessageEvent<ChemResponse>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    job.resolve(event.data);
  };
  created.onerror = (event) => {
    event.preventDefault();
    stopWorker(new ApiError("invalid_data", "local", `The chemistry worker failed: ${event.message || "unknown error"}`));
  };
  worker = created;
  return created;
}

function run(message: JobMessage, signal?: AbortSignal): Promise<ChemResponse> {
  if (signal?.aborted) return Promise.reject(new AbortedError());
  const id = nextId++;
  return new Promise<ChemResponse>((resolve, reject) => {
    const onAbort = () => stopWorker(new AbortedError());
    const timer = setTimeout(
      () => stopWorker(new ApiError("timeout", "local", "Computing the 3D structure took too long.")),
      JOB_TIMEOUT_MS,
    );
    const settle = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    pending.set(id, {
      resolve: (response) => {
        settle();
        resolve(response);
      },
      reject: (error) => {
        settle();
        reject(error);
      },
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    getWorker().postMessage({ ...message, id } as ChemRequest);
  });
}

function toError(response: Extract<ChemResponse, { ok: false }>): ApiError {
  if (response.code === "parse") return new ApiError("bad_request", "local", response.message);
  return new ApiError("invalid_data", "local", response.message);
}

export interface Computed3d {
  molfile: string;
  properties: LocalProperties;
}

/** Build an MMFF94s-minimized 3D structure (with hydrogens) from SMILES, plus its properties. */
export async function computeFromSmiles(smiles: string, signal?: AbortSignal): Promise<Computed3d> {
  const response = await run({ type: "smilesTo3d", smiles }, signal);
  if (!response.ok) throw toError(response);
  if (!response.molfile) throw new ApiError("invalid_data", "local", "No structure was produced.");
  return { molfile: response.molfile, properties: response.properties };
}

/** Compute properties for an existing structure (used for NCI CACTUS results). */
export async function describeMolfile(molfile: string, signal?: AbortSignal): Promise<LocalProperties> {
  const response = await run({ type: "describeMolfile", molfile }, signal);
  if (!response.ok) throw toError(response);
  return response.properties;
}
