/**
 * Turns a search into a Molecule, choosing the data source:
 *
 *   1. PubChem (database record: CID, 3D conformer or 2D fallback, full properties).
 *   2. If PubChem is unavailable (busy, timeout, offline):
 *        name   → NCI CACTUS 3D structure; properties computed in the browser.
 *        SMILES → 3D structure and properties computed in the browser.
 *   3. If a SMILES is valid but not in PubChem → computed in the browser.
 *
 * Every non-PubChem result carries `source` and `fallback` so the UI can say exactly where
 * the structure came from.
 */
import { fetchCactusIupacName, fetchCactusNames, fetchCactusSdf, fetchCactusSmiles } from "./cactus";
import { ApiError, isAbortedError } from "./http";
import { fetchCidByName, fetchCidBySmiles, fetchProperties, fetchStructure, fetchSynonyms } from "./pubchem";
import { computeFromSmiles, describeMolfile, type LocalProperties } from "../chem/client";
import { titleCase } from "../lib/format";
import { summarizeSdf } from "../lib/sdf";
import type { CompoundProperties, FallbackReason, LoadStage, Molecule, SearchRequest } from "../types";

type OnStage = (stage: LoadStage) => void;

/** Failures where another source may succeed (as opposed to "PubChem says no such compound"). */
function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === "busy" || error.kind === "timeout" || error.kind === "network");
}

export async function resolveMolecule(request: SearchRequest, signal: AbortSignal, onStage: OnStage): Promise<Molecule> {
  try {
    return await fromPubChem(request, signal, onStage);
  } catch (error) {
    if (isAbortedError(error)) throw error;

    if (isUnavailable(error)) {
      try {
        if (request.type === "name") {
          onStage("fallback");
          return await fromCactus(request, signal);
        }
        onStage("computing");
        return await fromSmilesLocally(request, "pubchem-unavailable", signal);
      } catch (fallbackError) {
        // Report a definite answer from the fallback ("no such compound", "bad SMILES");
        // if the fallback was unavailable too, report PubChem's original problem.
        if (isAbortedError(fallbackError)) throw fallbackError;
        if (fallbackError instanceof ApiError && !isUnavailable(fallbackError)) throw fallbackError;
        throw error;
      }
    }

    if (error instanceof ApiError && error.kind === "not_found" && request.type === "smiles") {
      onStage("computing");
      return fromSmilesLocally(request, "not-in-pubchem", signal);
    }

    throw error;
  }
}

async function fromPubChem(request: SearchRequest, signal: AbortSignal, onStage: OnStage): Promise<Molecule> {
  const cid =
    request.type === "smiles"
      ? await fetchCidBySmiles(request.query, signal)
      : await fetchCidByName(request.query, signal);

  onStage("fetching");
  const [structure, properties, synonyms] = await Promise.all([
    fetchStructure(cid, signal),
    fetchProperties(cid, signal),
    // Synonyms are nice to have; never fail the whole search because of them.
    fetchSynonyms(cid, signal).catch((error: unknown) => {
      if (isAbortedError(error)) throw error;
      return [] as string[];
    }),
  ]);

  const name = properties.title
    ? properties.title.charAt(0).toUpperCase() + properties.title.slice(1)
    : request.type === "name"
      ? titleCase(request.query)
      : `CID ${cid}`;

  return build(request, structure.sdf, {
    source: "pubchem",
    fallback: null,
    cid,
    name,
    dimension: structure.dimension,
    properties,
    synonyms,
  });
}

async function fromCactus(request: SearchRequest, signal: AbortSignal): Promise<Molecule> {
  const sdf = await fetchCactusSdf(request.query, signal);
  const [local, iupacName, smiles, names] = await Promise.all([
    describeMolfile(sdf, signal),
    fetchCactusIupacName(request.query, signal),
    // CACTUS's own SMILES reads better than one regenerated from its hydrogen-explicit SDF.
    fetchCactusSmiles(request.query, signal),
    fetchCactusNames(request.query, signal),
  ]);
  return build(request, sdf, {
    source: "cactus",
    fallback: "pubchem-unavailable",
    cid: null,
    name: titleCase(request.query),
    dimension: "3d",
    properties: { ...fromLocal(local, iupacName), smiles: smiles ?? local.smiles },
    synonyms: names,
  });
}

async function fromSmilesLocally(request: SearchRequest, fallback: FallbackReason, signal: AbortSignal): Promise<Molecule> {
  const { molfile, properties } = await computeFromSmiles(request.query, signal);
  return build(request, molfile, {
    source: "local",
    fallback,
    cid: null,
    name: "Unnamed structure",
    dimension: "3d",
    // Show the SMILES as the user wrote it rather than OpenChemLib's rewritten form.
    properties: { ...fromLocal(properties, null), smiles: request.query },
    synonyms: [],
  });
}

/** Map OpenChemLib's properties onto the common shape; PubChem-only fields stay null. */
function fromLocal(local: LocalProperties, iupacName: string | null): CompoundProperties {
  return {
    cid: null,
    title: null,
    molecularFormula: local.formula,
    molecularWeight: local.molecularWeight,
    exactMass: local.exactMass,
    iupacName,
    smiles: local.smiles,
    connectivitySmiles: null,
    logP: local.logP,
    logPMethod: "cLogP",
    tpsa: local.tpsa,
    hBondDonors: local.hBondDonors,
    hBondAcceptors: local.hBondAcceptors,
    rotatableBonds: local.rotatableBonds,
    complexity: null,
  };
}

type MoleculeFields = Pick<Molecule, "source" | "fallback" | "cid" | "name" | "dimension" | "properties" | "synonyms">;

/** Validate the SDF and assemble the Molecule. */
function build(request: SearchRequest, sdf: string, fields: MoleculeFields): Molecule {
  const summary = summarizeSdf(sdf);
  if (!summary) {
    throw new ApiError("invalid_data", fields.source, "The structure record contains no atoms.");
  }
  return {
    ...fields,
    request,
    sdf,
    atomCount: summary.atomCount,
    elements: summary.elements,
    retrievedAt: new Date(),
  };
}
