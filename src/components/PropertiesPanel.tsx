import { ExternalLink } from "lucide-react";
import { useId, type ReactNode } from "react";
import { compoundPageUrl } from "../api/pubchem";
import { formatFixed, formatInteger, formatTimestamp, titleCase } from "../lib/format";
import type { Molecule } from "../types";
import { Formula } from "./Formula";
import { CopyButton } from "./ui/CopyButton";
import { InfoTip } from "./ui/InfoTip";

/** Plain-language definitions for non-obvious properties. */
const DEFINITIONS = {
  exactMass: "Mass of one molecule with its most likely isotopic composition, as measured in mass spectrometry.",
  xlogp: "Predicted octanol–water partition coefficient (log scale); higher values mean more fat-soluble.",
  tpsa: "Topological polar surface area: the surface of polar atoms, often used to predict membrane permeability.",
  rotatableBonds: "Count of single, non-ring bonds between heavy atoms that can freely rotate; a measure of flexibility.",
  complexity: "PubChem's score for how structurally intricate the molecule is, based on its elements and bonding.",
} as const;

const SYNONYM_LIMIT = 5;

interface PropertiesPanelProps {
  molecule: Molecule | null;
  loading: boolean;
}

export function PropertiesPanel({ molecule, loading }: PropertiesPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-panel">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <PanelSkeleton /> : molecule ? <PanelContent molecule={molecule} /> : <PanelEmpty />}
      </div>
    </div>
  );
}

function PanelEmpty() {
  return <p className="p-4 text-sm text-muted">Compound properties appear here after a search.</p>;
}

/** Static gray rows standing in for the properties while loading. */
function PanelSkeleton() {
  const rows = [3, 2, 4, 2, 3, 3, 2];
  return (
    <div className="p-4" aria-busy="true" aria-label="Loading properties">
      <div className="skeleton h-5 w-2/5" />
      <div className="skeleton mt-2 h-3.5 w-4/5" />
      <div className="mt-6 space-y-0">
        {rows.map((w, i) => (
          <div key={i} className="flex items-center justify-between border-b border-line py-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-3" style={{ width: `${w * 1.25}rem` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelContent({ molecule }: { molecule: Molecule }) {
  const p = molecule.properties;
  const lowerName = molecule.name.toLowerCase();
  const synonyms = molecule.synonyms.filter((s) => s.toLowerCase() !== lowerName).slice(0, SYNONYM_LIMIT);
  const showConnectivity = p.connectivitySmiles !== null && p.connectivitySmiles !== p.smiles;

  return (
    <article aria-label={`Properties of ${molecule.name}`}>
      <header className="border-b border-line px-4 pb-3 pt-4">
        <h2 className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{titleCase(molecule.name)}</h2>
        {p.iupacName && (
          <p className="mt-1 font-mono text-xs text-muted [overflow-wrap:anywhere]">
            <span className="sr-only">IUPAC name: </span>
            {p.iupacName}
          </p>
        )}
      </header>

      <Section title="Identity">
        <Row label="Formula" action={p.molecularFormula ? <CopyButton value={p.molecularFormula} subject="formula" /> : null}>
          {p.molecularFormula ? <Formula value={p.molecularFormula} /> : <Missing />}
        </Row>
        <CodeRow label="SMILES" value={p.smiles} />
        {showConnectivity && <CodeRow label="Connectivity SMILES" value={p.connectivitySmiles} />}
        <Row label="PubChem CID" action={<CopyButton value={String(molecule.cid)} subject="CID" />}>
          <span className="font-mono tabular-nums">{molecule.cid}</span>
        </Row>
      </Section>

      <Section title="Mass">
        <Row label="Molecular weight">
          <Numeric value={formatFixed(p.molecularWeight, 2)} unit="g/mol" />
        </Row>
        <Row label="Exact mass" info={DEFINITIONS.exactMass}>
          <Numeric value={formatFixed(p.exactMass, 4)} unit="Da" />
        </Row>
      </Section>

      <Section title="Physicochemical">
        <Row label="XLogP" info={DEFINITIONS.xlogp}>
          <Numeric value={formatFixed(p.xlogp, 1)} />
        </Row>
        <Row label="TPSA" info={DEFINITIONS.tpsa}>
          <Numeric value={formatFixed(p.tpsa, 1)} unit="Å²" />
        </Row>
        <Row label="H-bond donors">
          <Numeric value={formatInteger(p.hBondDonors)} />
        </Row>
        <Row label="H-bond acceptors">
          <Numeric value={formatInteger(p.hBondAcceptors)} />
        </Row>
        <Row label="Rotatable bonds" info={DEFINITIONS.rotatableBonds}>
          <Numeric value={formatInteger(p.rotatableBonds)} />
        </Row>
        <Row label="Complexity" info={DEFINITIONS.complexity}>
          <Numeric value={formatInteger(p.complexity)} />
        </Row>
      </Section>

      <Section title="Names" plain>
        {synonyms.length > 0 ? (
          <ul className="space-y-1 py-2 text-sm text-fg">
            {synonyms.map((name) => (
              <li key={name} className="[overflow-wrap:anywhere]">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted">No synonyms listed on PubChem.</p>
        )}
      </Section>

      <footer className="space-y-0.5 px-4 py-3 text-xs text-muted">
        <p>
          Source:{" "}
          <a
            href={compoundPageUrl(molecule.cid)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-ctl text-accent hover:underline"
          >
            PubChem · CID <span className="font-mono tabular-nums">{molecule.cid}</span>
            <ExternalLink aria-hidden size={12} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        <p>
          Retrieved <time dateTime={molecule.retrievedAt.toISOString()}>{formatTimestamp(molecule.retrievedAt)}</time>
          {molecule.dimension === "2d" ? " · 2D coordinates" : " · 3D conformer"}
        </p>
      </footer>
    </article>
  );
}

/** Titled group. Renders its rows inside a <dl> unless `plain` (for non key/value content). */
function Section({ title, plain = false, children }: { title: string; plain?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-b border-line px-4 pb-1 pt-3">
      <h3 id={id} className="text-xs font-semibold text-fg">
        {title}
      </h3>
      {plain ? children : <dl className="divide-y divide-line">{children}</dl>}
    </section>
  );
}

interface RowProps {
  label: string;
  /** Definition shown via an info button next to the label. */
  info?: string;
  /** Trailing control, e.g. a copy button. */
  action?: ReactNode;
  children: ReactNode;
}

function Row({ label, info, action, children }: RowProps) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-1.5">
      <dt className="flex shrink-0 items-center gap-1 text-xs text-muted">
        {label}
        {info && <InfoTip term={label} definition={info} />}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm text-fg">
        {children}
        {action}
      </dd>
    </div>
  );
}

/** Label row plus a full-width monospace block for long strings such as SMILES. */
function CodeRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="py-2">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <dt className="text-xs text-muted">{label}</dt>
        {value && <CopyButton value={value} subject={label} />}
      </div>
      <dd className="mt-1">
        {value ? (
          <code className="block max-h-40 overflow-y-auto rounded-ctl border border-line bg-raised px-2 py-1.5 font-mono text-xs leading-5 text-fg [overflow-wrap:anywhere]">
            {value}
          </code>
        ) : (
          <Missing />
        )}
      </dd>
    </div>
  );
}

function Numeric({ value, unit }: { value: string | null; unit?: string }) {
  if (value === null) return <Missing />;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono tabular-nums">{value}</span>
      {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
    </span>
  );
}

/** Em dash for values PubChem does not provide. */
function Missing() {
  return (
    <span>
      <span aria-hidden title="Not available from PubChem" className="cursor-help text-muted">
        —
      </span>
      <span className="sr-only">Not available from PubChem</span>
    </span>
  );
}
