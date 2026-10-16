import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, isAbortedError } from "../api/http";
import { fetchNameSuggestions } from "../api/pubchem";
import { resolveMolecule } from "../api/resolveMolecule";
import { editDistance, isPlausibleCorrection } from "../lib/similarity";
import type { LoadStage, Molecule, SearchError, SearchRequest } from "../types";

/**
 * Search state machine. `molecule` is always the last successfully loaded compound, so the
 * viewer can keep showing (dimmed) the previous structure while loading or after an error.
 */
export type MoleculeState =
  | { status: "idle"; molecule: null }
  | { status: "loading"; request: SearchRequest; stage: LoadStage; molecule: Molecule | null }
  | { status: "success"; request: SearchRequest; molecule: Molecule }
  | { status: "error"; request: SearchRequest; error: SearchError; molecule: Molecule | null };

type Action =
  | { type: "start"; request: SearchRequest }
  | { type: "stage"; stage: LoadStage }
  | { type: "success"; molecule: Molecule }
  | { type: "error"; error: SearchError }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "dismiss" };

function reducer(state: MoleculeState, action: Action): MoleculeState {
  switch (action.type) {
    case "start":
      return { status: "loading", request: action.request, stage: "resolving", molecule: state.molecule };
    case "stage":
      return state.status === "loading" ? { ...state, stage: action.stage } : state;
    case "success":
      return state.status === "loading" ? { status: "success", request: state.request, molecule: action.molecule } : state;
    case "error":
      return state.status === "loading"
        ? { status: "error", request: state.request, error: action.error, molecule: state.molecule }
        : state;
    case "suggestions":
      return state.status === "error" && action.suggestions.length > 0
        ? { ...state, error: { ...state.error, suggestions: action.suggestions } }
        : state;
    case "dismiss":
      if (state.status !== "error") return state;
      return state.molecule
        ? { status: "success", request: state.request, molecule: state.molecule }
        : { status: "idle", molecule: null };
  }
}

/** Translate a low-level failure into a specific, user-facing message. */
function toSearchError(error: unknown, request: SearchRequest): SearchError {
  if (!(error instanceof ApiError)) {
    return { kind: "http", title: "Something went wrong while loading this compound", retryable: true };
  }
  const isSmiles = request.type === "smiles";
  const source = error.service === "cactus" ? "NCI CACTUS" : "PubChem";

  switch (error.kind) {
    case "not_found":
      if (error.service === "cactus") {
        return {
          kind: "not_found",
          title: `No compound found for "${request.query}"`,
          detail: "PubChem is unavailable right now, and NCI CACTUS has no match either. Check the spelling, or search by SMILES.",
          retryable: true,
        };
      }
      return isSmiles
        ? {
            kind: "not_found",
            title: "No PubChem compound matches this SMILES",
            detail: "The structure is valid, but PubChem has no record of it.",
            retryable: false,
          }
        : {
            kind: "not_found",
            title: `No compound found for "${request.query}"`,
            detail: "Check the spelling, or search by SMILES instead.",
            retryable: false,
          };
    case "bad_request":
      return isSmiles
        ? {
            kind: "bad_input",
            title: error.service === "local" ? "SMILES could not be parsed" : "SMILES could not be parsed by PubChem",
            detail: "Check ring-closure digits, brackets and charges.",
            retryable: false,
          }
        : {
            kind: "bad_input",
            title: `${source} could not interpret "${request.query}"`,
            detail: "Remove unusual characters and try again.",
            retryable: false,
          };
    case "busy": {
      // The client already retried once after a short pause, so this is a longer block.
      // PubChem's Retry-After is normally 30 s but is rarely readable from the browser.
      const wait = error.retryAfterSeconds ?? 30;
      return {
        kind: "busy",
        title: `${source} is busy, try again in about ${wait} seconds`,
        detail: `${source} limits how often it can be queried and is temporarily refusing requests.`,
        retryable: true,
      };
    }
    case "timeout":
      return { kind: "timeout", title: "Request timed out", detail: error.message, retryable: true };
    case "network":
      return {
        kind: "network",
        title: `Could not reach ${source}`,
        detail: "Check your connection. The service may also be briefly unavailable.",
        retryable: true,
      };
    case "invalid_data":
      return error.service === "local"
        ? {
            kind: "invalid_data",
            title: "Could not compute a 3D structure for this SMILES",
            detail: error.message,
            retryable: false,
          }
        : { kind: "invalid_data", title: `${source} returned unusable data`, detail: error.message, retryable: true };
    case "http":
      return {
        kind: "http",
        title: `${source} returned an unexpected error${error.status ? ` (HTTP ${error.status})` : ""}`,
        retryable: true,
      };
  }
}

/**
 * Spelling corrections for an unknown name. PubChem's autocomplete matches prefixes, so a
 * typo early in the word ("asprin") finds nothing useful on its own. Query the full term
 * plus short prefixes, then keep and rank candidates by edit distance to what was typed.
 */
async function suggestCorrections(query: string, signal: AbortSignal): Promise<string[]> {
  const term = query.trim();
  const probes = [...new Set([term, term.slice(0, 3), term.slice(0, Math.ceil(term.length / 2))])].filter(
    (probe) => probe.length >= 3,
  );
  const results = await Promise.allSettled(probes.map((probe) => fetchNameSuggestions(probe, signal, 20)));
  const seen = new Set<string>();
  const candidates: Array<{ name: string; distance: number }> = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const name of result.value) {
      const key = name.toLowerCase();
      if (seen.has(key) || !isPlausibleCorrection(term, name)) continue;
      seen.add(key);
      candidates.push({ name, distance: editDistance(term.toLowerCase(), key) });
    }
  }
  return candidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((c) => c.name);
}

export interface UseMolecule {
  state: MoleculeState;
  search: (request: SearchRequest) => void;
  retry: () => void;
  dismissError: () => void;
}

export function useMolecule(): UseMolecule {
  const [state, dispatch] = useReducer(reducer, { status: "idle", molecule: null });
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<SearchRequest | null>(null);

  const search = useCallback((request: SearchRequest) => {
    // Cancel whatever is in flight; its results must never land.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lastRequestRef.current = request;
    const { signal } = controller;

    dispatch({ type: "start", request });

    resolveMolecule(request, signal, (stage) => {
      if (!signal.aborted) dispatch({ type: "stage", stage });
    })
      .then((molecule) => {
        if (!signal.aborted) dispatch({ type: "success", molecule });
      })
      .catch((error: unknown) => {
        if (signal.aborted || isAbortedError(error)) return;
        const searchError = toSearchError(error, request);
        dispatch({ type: "error", error: searchError });

        // Offer "Did you mean…" for names PubChem doesn't know. Skipped when PubChem was
        // unavailable (the not-found answer came from CACTUS) to avoid adding to its load.
        const fromPubChem = error instanceof ApiError && error.service === "pubchem";
        if (searchError.kind === "not_found" && request.type === "name" && fromPubChem) {
          suggestCorrections(request.query, signal)
            .then((suggestions) => {
              if (!signal.aborted) dispatch({ type: "suggestions", suggestions });
            })
            .catch(() => undefined);
        }
      });
  }, []);

  const retry = useCallback(() => {
    if (lastRequestRef.current) search(lastRequestRef.current);
  }, [search]);

  const dismissError = useCallback(() => dispatch({ type: "dismiss" }), []);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, search, retry, dismissError };
}
