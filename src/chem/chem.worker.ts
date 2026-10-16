/// <reference lib="webworker" />
/**
 * Chemistry worker: builds 3D structures from SMILES and computes properties with
 * OpenChemLib, off the main thread (a large molecule such as paclitaxel takes several
 * seconds). Loaded only when a fallback or an unlisted SMILES needs it.
 */
import { ConformerGenerator, ForceFieldMMFF94, Molecule, MoleculeProperties, Resources } from "openchemlib";
// Torsion library and MMFF94 parameter tables (~1.3 MB, served as a separate file).
import resourcesUrl from "../../node_modules/openchemlib/dist/resources.json?url";
import { sortHill } from "../lib/elementColors";
import type { ChemRequest, ChemResponse, LocalProperties } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let resources: Promise<void> | null = null;
function ensureResources(): Promise<void> {
  resources ??= Resources.registerFromUrl(resourcesUrl);
  return resources;
}

/** Fixed seed so the same SMILES always gives the same conformer. */
const CONFORMER_SEED = 42;
const MINIMISE_MAX_ITERATIONS = 2_000;

/** Re-emit OpenChemLib's formula ("C15H13O2F3") in Hill order ("C15H13F3O2"). */
function hillFormula(formula: string): string {
  const counts = new Map<string, number>();
  for (const [, symbol, count] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (symbol) counts.set(symbol, (counts.get(symbol) ?? 0) + (count ? Number(count) : 1));
  }
  return sortHill(counts.keys())
    .map((symbol) => {
      const n = counts.get(symbol) ?? 0;
      return n === 1 ? symbol : `${symbol}${n}`;
    })
    .join("");
}

function describe(molecule: Molecule): LocalProperties {
  const formula = molecule.getMolecularFormula();
  const properties = new MoleculeProperties(molecule);
  return {
    formula: hillFormula(formula.formula),
    molecularWeight: formula.relativeWeight,
    exactMass: formula.absoluteWeight,
    logP: properties.logP,
    tpsa: properties.polarSurfaceArea,
    hBondDonors: properties.donorCount,
    hBondAcceptors: properties.acceptorCount,
    rotatableBonds: properties.rotatableBondCount,
    smiles: molecule.toIsomericSmiles(),
  };
}

async function handle(request: ChemRequest): Promise<ChemResponse> {
  const { id } = request;

  let molecule: Molecule;
  try {
    molecule =
      request.type === "smilesTo3d" ? Molecule.fromSmiles(request.smiles) : Molecule.fromMolfile(request.molfile);
  } catch (error) {
    return { id, ok: false, code: "parse", message: error instanceof Error ? error.message : String(error) };
  }
  if (molecule.getAllAtoms() === 0) return { id, ok: false, code: "parse", message: "No atoms." };

  const properties = describe(molecule);
  if (request.type === "describeMolfile") return { id, ok: true, properties };

  await ensureResources();
  // Adds explicit hydrogens and picks a likely, collision-free torsion set that
  // respects the stereo parities in the SMILES.
  const conformer = new ConformerGenerator(CONFORMER_SEED).getOneConformerAsMolecule(molecule.getCompactCopy());
  if (!conformer) {
    return { id, ok: false, code: "embed", message: "No collision-free 3D conformer could be generated." };
  }
  // Relax bond lengths and angles with the MMFF94s force field.
  const forceField = new ForceFieldMMFF94(conformer, "MMFF94s+", {});
  forceField.minimise({ maxIts: MINIMISE_MAX_ITERATIONS });

  return { id, ok: true, molfile: conformer.toMolfile(), properties };
}

self.onmessage = (event: MessageEvent<ChemRequest>) => {
  handle(event.data)
    .catch(
      (error: unknown): ChemResponse => ({
        id: event.data.id,
        ok: false,
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((response) => self.postMessage(response));
};
