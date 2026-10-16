#!/usr/bin/env node
/**
 * Records real PubChem responses into src/api/mock/fixtures.json for `npm run dev:mock`.
 *
 *   npm run fixtures:record
 *
 * Makes the same requests the app makes for the example compounds and a few SMILES, one
 * at a time at under 4 per second (PubChem allows 5). Stops immediately, without writing
 * anything, if PubChem refuses requests, so a throttled run can't leave a partial file.
 *
 * Keep the URLs in sync with src/api/pubchem.ts and the key format with fixtureKey() in
 * src/api/mock/installMock.ts.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/api/mock/fixtures.json", import.meta.url));
const ORIGIN = "https://pubchem.ncbi.nlm.nih.gov";
const PUG = `${ORIGIN}/rest/pug`;
const SPACING_MS = 300;

const NAMES = ["Caffeine", "Aspirin", "Ibuprofen", "Paracetamol", "Penicillin G", "Glucose", "Cholesterol", "Dopamine", "Taxol", "Water"];
const SMILES = ["CC(=O)OC1=CC=CC=C1C(=O)O", "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O"];
const PROPERTIES =
  "Title,MolecularFormula,MolecularWeight,IUPACName,SMILES,ConnectivitySMILES,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,Complexity,ExactMass";

const responses = {};
const vocabulary = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function key(method, url, body) {
  const smiles = body ? new URLSearchParams(body).get("smiles") : null;
  return `${method} ${(url.pathname + url.search).toLowerCase()}${smiles ? ` ${smiles}` : ""}`;
}

async function record(href, init = {}) {
  await sleep(SPACING_MS);
  const url = new URL(href);
  const response = await fetch(url, init);
  if ([429, 502, 503, 504].includes(response.status)) {
    console.error(`\nPubChem refused ${url.pathname} (HTTP ${response.status}). Nothing was written; try again later.`);
    process.exit(1);
  }
  const body = await response.text();
  responses[key(init.method ?? "GET", url, init.body ?? null)] = {
    status: response.status,
    type: response.headers.get("content-type")?.split(";")[0] ?? "text/plain",
    body,
  };
  process.stdout.write(".");
  return { status: response.status, body };
}

async function recordCompound(cid) {
  const structure = await record(`${PUG}/compound/cid/${cid}/record/SDF?record_type=3d`);
  if (structure.status === 404) await record(`${PUG}/compound/cid/${cid}/record/SDF?record_type=2d`);
  const props = JSON.parse((await record(`${PUG}/compound/cid/${cid}/property/${PROPERTIES}/JSON`)).body);
  const synonyms = JSON.parse((await record(`${PUG}/compound/cid/${cid}/synonyms/JSON`)).body);
  const title = props.PropertyTable?.Properties?.[0]?.Title;
  if (title) vocabulary.add(title);
  for (const name of synonyms.InformationList?.Information?.[0]?.Synonym?.slice(0, 3) ?? []) vocabulary.add(name);
}

const cids = new Set();
for (const name of NAMES) {
  const { status, body } = await record(`${PUG}/compound/name/${encodeURIComponent(name)}/cids/JSON`);
  vocabulary.add(name);
  if (status === 200) cids.add(JSON.parse(body).IdentifierList.CID[0]);
}
for (const smiles of SMILES) {
  const body = new URLSearchParams({ smiles }).toString();
  const result = await record(`${PUG}/compound/smiles/cids/JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const cid = JSON.parse(result.body).IdentifierList?.CID?.[0];
  if (cid > 0) cids.add(cid);
}
for (const cid of cids) await recordCompound(cid);

const file = {
  meta: { recordedAt: new Date().toISOString(), source: "PubChem PUG REST (recorded)" },
  names: [...vocabulary].sort((a, b) => a.localeCompare(b)),
  responses,
};
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(responses).length} responses for ${cids.size} compounds to ${OUT}`);
