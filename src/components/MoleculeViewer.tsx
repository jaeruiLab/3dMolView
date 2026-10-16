import * as $3Dmol from "3dmol";
import { AlertTriangle, Box, Cpu, Server, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { downloadUrl } from "../lib/clipboard";
import { getElementInfo } from "../lib/elementColors";
import { toFileStem } from "../lib/format";
import { useMediaQuery, prefersReducedMotion } from "../hooks/useMediaQuery";
import { usePersistentState } from "../hooks/usePersistentState";
import type { LoadStage, Molecule, Theme, ViewerSettings, ViewerStyle } from "../types";
import { ExampleChips } from "./ExampleChips";
import { STYLE_LABELS, ViewerControls } from "./ViewerControls";

type GLViewer = $3Dmol.GLViewer;

/** Imperative actions exposed for keyboard shortcuts in App. */
export interface MoleculeViewerHandle {
  resetView: () => void;
  toggleFullscreen: () => void;
}

interface MoleculeViewerProps {
  molecule: Molecule | null;
  loading: boolean;
  loadingStage: LoadStage | null;
  loadingQuery: string | null;
  settings: ViewerSettings;
  onSettingsChange: (patch: Partial<ViewerSettings>) => void;
  theme: Theme;
  onSelectExample: (name: string) => void;
}

/** Read a design token (CSS custom property) from :root, e.g. "--canvas" → "#0b0d11". */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 3Dmol style specs. All use CPK (Jmol) element colors. */
function styleSpec(style: ViewerStyle): $3Dmol.AtomStyleSpec {
  switch (style) {
    case "ballstick":
      return { stick: { radius: 0.15, colorscheme: "Jmol" }, sphere: { scale: 0.28, colorscheme: "Jmol" } };
    case "stick":
      return { stick: { radius: 0.2, colorscheme: "Jmol" } };
    case "sphere":
      return { sphere: { scale: 1, colorscheme: "Jmol" } };
    case "line":
      return { line: { colorscheme: "Jmol" } };
  }
}

/**
 * Frame the whole molecule. zoomTo() fits the bounding sphere to the *vertical* field of
 * view only, so on portrait canvases (phones) the sides get cropped; zooming out by the
 * aspect ratio makes the sphere fit horizontally too. Returns the aspect ratio.
 */
function fitView(viewer: GLViewer, container: HTMLElement): number {
  viewer.zoomTo();
  const { clientWidth: width, clientHeight: height } = container;
  const aspect = height > 0 ? width / height : 1;
  if (aspect < 1) viewer.zoom(aspect);
  return aspect;
}

/**
 * Fully detach a viewer. 3Dmol has no dispose(): it leaves window/body listeners and its
 * own Resize/IntersectionObservers behind, and it rebuilds a canvas inside its container
 * if it notices a lost context while that container still has a size. So we disconnect
 * its observers, detach the host element (size becomes 0, which disables that rebuild
 * path), and only then release the WebGL context.
 */
function disposeViewer(viewer: GLViewer, host: HTMLElement): void {
  try {
    viewer.spin(false);
    viewer.stopAnimate();
    viewer.clear();
    const internals = viewer as unknown as { divwatcher?: ResizeObserver; intwatcher?: IntersectionObserver };
    internals.divwatcher?.disconnect();
    internals.intwatcher?.disconnect();
    const canvas = viewer.getCanvas();
    host.remove();
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    host.remove();
  }
}

export const MoleculeViewer = forwardRef<MoleculeViewerHandle, MoleculeViewerProps>(function MoleculeViewer(
  { molecule, loading, loadingStage, loadingQuery, settings, onSettingsChange, theme, onSelectExample },
  ref,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasParentRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<GLViewer | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [hintDismissed, setHintDismissed] = usePersistentState<boolean>(
    "hint-dismissed",
    false,
    (v): v is boolean => typeof v === "boolean",
  );

  // ── Theme: canvas background comes from the same token as the UI ───────────────
  useEffect(() => {
    if (!viewer) return;
    viewer.setBackgroundColor(readToken("--canvas"), 1);
    viewer.render();
  }, [viewer, theme]);

  // ── Load molecule ───────────────────────────────────────────────────────────────
  // The viewer itself is created by the lifecycle effect further down; until then
  // `viewer` is null and these effects do nothing. Effects below re-run on every new molecule and are declared after this one, so
  // they always apply to the freshly loaded model. Their cleanups remove what they added.
  useEffect(() => {
    if (!viewer || !molecule) return;
    viewer.clear();
    viewer.addModel(molecule.sdf, "sdf");
    viewer.setStyle({}, styleSpec(settings.style));
    const aspect = canvasParentRef.current ? fitView(viewer, canvasParentRef.current) : 1;
    viewer.render();
    // Short intro zoom on landscape canvases; portrait ones are already framed tightly.
    if (aspect >= 1 && !prefersReducedMotion()) viewer.zoom(1.1, 400);
    return () => {
      viewer.clear();
      viewer.render();
    };
    // settings.style is deliberately not a dependency: style changes are applied by the
    // effect below without reloading the model; reading it here only sets the first style.
  }, [viewer, molecule]);

  // ── Display style ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !molecule) return;
    viewer.setStyle({}, styleSpec(settings.style));
    viewer.render();
  }, [viewer, molecule, settings.style]);

  // ── Atom labels (colors follow the theme) ──────────────────────────────────────
  useEffect(() => {
    if (!viewer || !molecule || !settings.labels) return;
    viewer.addPropertyLabels(
      "elem",
      {},
      {
        font: "Inter, system-ui, sans-serif",
        fontSize: 12,
        fontColor: readToken("--text"),
        backgroundColor: readToken("--panel"),
        backgroundOpacity: 0.85,
        borderThickness: 0,
        alignment: "center",
        inFront: true,
        showBackground: true,
      },
    );
    viewer.render();
    return () => {
      viewer.removeAllLabels();
      viewer.render();
    };
  }, [viewer, molecule, settings.labels, theme]);

  // ── Van der Waals surface ───────────────────────────────────────────────────────
  // addSurface() is asynchronous but exposes its id immediately. The cleanup removes only
  // that id, and only if it still exists (viewer.clear() may already have removed it).
  useEffect(() => {
    if (!viewer || !molecule || !settings.surface) return;
    const pending = viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.3, colorscheme: "Jmol" }, {}, {}) as Promise<
      number
    > & { surfid: number };
    const surfaceId = pending.surfid;
    pending.then(() => viewer.render()).catch(() => undefined);
    return () => {
      if (viewer.getSurface(surfaceId)) {
        viewer.removeSurface(surfaceId);
        viewer.render();
      }
    };
  }, [viewer, molecule, settings.surface]);

  // ── Auto-rotate (independent of the loaded model) ───────────────────────────────
  useEffect(() => {
    if (!viewer || !settings.spin) return;
    viewer.spin("y", 0.6);
    return () => viewer.spin(false);
  }, [viewer, settings.spin]);

  // ── Viewer lifecycle ────────────────────────────────────────────────────────────
  // A fresh host <div> per mount means a StrictMode remount (or any remount) can never
  // put two canvases in the same element: the old host is removed with its viewer.
  // Declared after the content effects so that, on unmount, their cleanups (labels,
  // surface, model) run against a live viewer before it is disposed here.
  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) return;

    const host = document.createElement("div");
    host.className = "viewer-host absolute inset-0";
    parent.appendChild(host);

    let instance: GLViewer;
    try {
      instance = $3Dmol.createViewer(host, { backgroundColor: readToken("--canvas"), antialias: true });
      if (!instance) throw new Error("createViewer returned nothing");
    } catch {
      host.remove();
      setInitError("3D rendering is unavailable: WebGL could not be started in this browser.");
      return;
    }
    setInitError(null);
    setViewer(instance);

    // Coalesce resize bursts (window drag, fullscreen) into one render per frame.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        instance.resize();
        instance.render();
      });
    });
    observer.observe(parent);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      setViewer(null);
      disposeViewer(instance, host);
    };
  }, []);

  // ── Fullscreen ──────────────────────────────────────────────────────────────────
  const fullscreenSupported = typeof document !== "undefined" && document.fullscreenEnabled === true;

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenSupported) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void panelRef.current?.requestFullscreen().catch(() => undefined);
  }, [fullscreenSupported]);

  const resetView = useCallback(() => {
    if (!viewer || !molecule || !canvasParentRef.current) return;
    fitView(viewer, canvasParentRef.current);
    viewer.render();
  }, [viewer, molecule]);

  useImperativeHandle(ref, () => ({ resetView, toggleFullscreen }), [resetView, toggleFullscreen]);

  // ── Export ──────────────────────────────────────────────────────────────────────
  const exportPng = () => {
    if (!viewer || !molecule) return;
    viewer.render();
    downloadUrl(viewer.pngURI(), `${toFileStem(molecule.name)}.png`);
  };

  const exportSdf = () => {
    if (!molecule) return;
    const url = URL.createObjectURL(new Blob([molecule.sdf], { type: "chemical/x-mdl-sdfile" }));
    downloadUrl(url, `${toFileStem(molecule.name)}${molecule.dimension === "2d" ? "_2d" : ""}.sdf`);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // ── Render ──────────────────────────────────────────────────────────────────────
  const formula = molecule?.properties.molecularFormula;
  const canvasLabel = molecule
    ? `${molecule.dimension === "3d" ? "3D" : "2D"} structure of ${molecule.name}` +
      `${formula ? `, ${formula}` : ""}, ${molecule.atomCount} atoms, shown as ${STYLE_LABELS[settings.style].toLowerCase()}.`
    : "Molecule viewer, no compound loaded.";

  const shortQuery = loadingQuery && loadingQuery.length > 40 ? `${loadingQuery.slice(0, 40)}…` : loadingQuery;
  const stageText =
    loadingStage === "fallback"
      ? "PubChem unavailable, asking NCI CACTUS"
      : loadingStage === "computing"
        ? "Computing 3D structure in your browser"
        : loadingStage === "resolving" && shortQuery
          ? `Resolving “${shortQuery}”`
          : "Fetching structure and properties";

  const hint = coarsePointer
    ? "Drag: rotate · Pinch: zoom · Two-finger drag: pan"
    : "Drag: rotate · Scroll: zoom · Right-drag: pan";

  return (
    <div
      ref={panelRef}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-panel [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
    >
      <ViewerControls
        settings={settings}
        onSettingsChange={onSettingsChange}
        hasMolecule={molecule !== null && viewer !== null}
        isFullscreen={isFullscreen}
        fullscreenSupported={fullscreenSupported}
        onReset={resetView}
        onToggleFullscreen={toggleFullscreen}
        onExportPng={exportPng}
        onExportSdf={exportSdf}
      />

      <div className="relative min-h-0 flex-1 bg-canvas">
        {/* 3Dmol mounts its canvas into a child of this element (see lifecycle effect). */}
        <div
          ref={canvasParentRef}
          role="img"
          aria-label={canvasLabel}
          className={`absolute inset-0 transition-opacity duration-150 ${loading && molecule ? "opacity-35" : "opacity-100"}`}
        />

        {/* Top-left: data provenance, or loading progress. */}
        {(loading || molecule) && (
          <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-ctl border border-line bg-panel px-2 py-1 text-xs text-fg">
            {loading ? (
              <span>{stageText}…</span>
            ) : molecule?.source === "cactus" ? (
              <>
                <Server aria-hidden size={13} className="shrink-0 text-muted" />
                <span>3D model · NCI CACTUS (computed)</span>
              </>
            ) : molecule?.source === "local" ? (
              <>
                <Cpu aria-hidden size={13} className="shrink-0 text-muted" />
                <span>3D model · computed in your browser</span>
              </>
            ) : molecule?.dimension === "3d" ? (
              <>
                <Box aria-hidden size={13} className="shrink-0 text-muted" />
                <span>
                  3D conformer · PubChem CID <span className="font-mono tabular-nums">{molecule.cid}</span>
                </span>
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden size={13} className="shrink-0 text-warn" />
                <span>2D coordinates (no 3D conformer available)</span>
              </>
            )}
          </div>
        )}

        {/* Empty, loading-without-previous and WebGL failure states. */}
        {(initError || !molecule) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {initError ? (
              <p className="max-w-sm text-sm text-fg">{initError}</p>
            ) : loading ? (
              <p className="text-sm text-muted">Loading structure…</p>
            ) : (
              <>
                <p className="text-sm text-fg">Search for a compound to view its structure</p>
                <ExampleChips variant="block" onSelect={onSelectExample} />
              </>
            )}
          </div>
        )}

        {/* Bottom-left: CPK legend for elements present in this molecule. */}
        {molecule && !initError && (
          <section
            aria-label="Element colors"
            className="absolute bottom-3 left-3 max-w-[calc(50%-1rem)] rounded-ctl border border-line bg-panel px-2.5 py-2"
          >
            <ul
              className="grid gap-x-3 gap-y-1"
              style={{
                gridAutoFlow: "column",
                gridTemplateRows: `repeat(${Math.min(molecule.elements.length, 5)}, auto)`,
              }}
            >
              {molecule.elements.map((symbol) => {
                const info = getElementInfo(symbol);
                return (
                  <li key={symbol} className="flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-ctl border border-control"
                      style={{ backgroundColor: info.color }}
                    />
                    <span className="w-5 font-mono text-fg">{info.symbol}</span>
                    <span className="hidden text-muted sm:inline">{info.name}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Bottom-right: interaction hint, dismissible and remembered. */}
        {molecule && !hintDismissed && !initError && (
          <div className="absolute bottom-3 right-3 flex max-w-[calc(50%-1rem)] items-center gap-1 rounded-ctl border border-line bg-panel py-0.5 pl-2 pr-0.5 text-xs text-muted">
            <span>{hint}</span>
            <button
              type="button"
              aria-label="Dismiss navigation hint"
              onClick={() => setHintDismissed(true)}
              className="touch-target inline-flex size-6 shrink-0 items-center justify-center rounded-ctl hover:bg-hover hover:text-fg"
            >
              <X aria-hidden size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
