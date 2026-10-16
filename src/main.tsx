import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

async function start(): Promise<void> {
  // Development only: replace PubChem with recorded fixtures or a simulated outage
  // (npm run dev:mock / dev:pubchem-down). Dead code in production builds.
  const mockMode = import.meta.env.VITE_PUBCHEM_MOCK;
  if (import.meta.env.DEV && mockMode) {
    const { installPubChemMock } = await import("./api/mock/installMock");
    installPubChemMock(mockMode);
  }

  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
