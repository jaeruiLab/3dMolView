/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: "fixtures" serves recorded PubChem responses, "busy" makes PubChem answer 503. */
  readonly VITE_PUBCHEM_MOCK?: "fixtures" | "busy";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
