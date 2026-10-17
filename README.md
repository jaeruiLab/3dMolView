# MolView 3D

An interactive 3D molecule viewer that runs entirely in the browser. Type a compound name (`caffeine`) or a SMILES string (`CC(=O)OC1=CC=CC=C1C(=O)O`). MolView 3D resolves it on PubChem, renders the structure with 3Dmol.js and lists the compound's computed properties.

If PubChem is unavailable, names fall back to NCI CACTUS. SMILES strings, including molecules that are in no database, get a 3D structure computed in the browser with OpenChemLib.

There is no backend. Every request goes straight from the browser to CORS-enabled public APIs.

## Setup

```bash
npm install
npm run dev               # http://localhost:5173
npm run build             # type-check (tsc -b) + production build to dist/
npm run preview           # serve the production build

npm run dev:mock          # PubChem replaced by recorded fixtures (no PubChem traffic)
npm run dev:pubchem-down  # every PubChem request answers 503, to exercise the fallbacks
npm run fixtures:record   # re-record src/api/mock/fixtures.json from the live PubChem
```

### Developing without hitting PubChem

PubChem blocks clients that send too many requests, and repeated test runs from one machine can trigger that. Use `npm run dev:mock` for day-to-day work and automated tests:
- **Scope:** only `pubchem.ncbi.nlm.nih.gov` is intercepted (`src/api/mock/installMock.ts`). NCI CACTUS and in-browser computation behave normally.
- **Unrecorded requests:** they get the answer PubChem would give for an unknown compound (404, or CID 0 for a well-formed SMILES), so the error and "not in PubChem" paths work offline too.
- **Visibility:** a "Dev: PubChem mocked" tag appears in the footer, and the mock is excluded from production builds.

The checked-in `fixtures.json` is a **seed** assembled while PubChem was blocking the development machine:
- **Properties:** values PubChem returned earlier; fields that weren't captured are omitted.
- **Structures:** NCI CACTUS files standing in for PubChem's conformers.

Run `npm run fixtures:record` once PubChem responds, to replace it with real recordings. The script paces itself below PubChem's limit, and if PubChem refuses a request it stops without writing anything.

Requires Node 18+ (developed on Node 24).

## Features

- **Search** by name or SMILES, with an Auto / Name / SMILES toggle. In Auto mode, the line under the input shows how the text will be read (`Detected: SMILES`). `Enter` submits and `/` focuses the field.
- **Viewer:** ball & stick, stick, spacefill and wireframe styles in CPK (Jmol) colors. Also atom labels, a translucent van der Waals surface, auto-rotate, reset view, fullscreen, and PNG / SDF export. A legend lists only the elements present in the molecule.
- **Provenance:** a tag on the canvas always says where the structure came from and what kind it is:
  - "3D conformer · PubChem CID 2519"
  - "2D coordinates (no 3D conformer available)"
  - "3D model · NCI CACTUS (computed)"
  - "3D model · computed in your browser"

  Anything other than a PubChem 3D conformer also gets an amber banner explaining why.
- **Fallbacks and new molecules:** see [Data sources](#data-sources).
- **Properties:** identity, mass, physicochemical descriptors and synonyms, with units, fixed decimals and copy buttons. Each non-obvious descriptor has a one-sentence definition.
- **Errors:** messages name the specific cause (not found, unparseable SMILES, PubChem busy, timeout, offline). Each offers a next step: Retry, "Did you mean…", or "Search as a name instead".
- **State:**
  - The URL tracks the current search (`?q=caffeine`, plus `&mode=smiles` when forced), so links are shareable and Back/Forward work.
  - The 8 most recent searches are kept in localStorage.
  - Viewer settings and the theme are remembered.
- **Theme:** dark by default. Light follows `prefers-color-scheme` on first visit, and the toggle choice is persisted.
- **Keyboard shortcuts:**

  | Key | Action |
  | --- | --- |
  | `/` | Focus search |
  | `Esc` | Leave the search field / close a popover |
  | `R` | Reset view |
  | `S` | Cycle display style |
  | `L` | Atom labels |
  | `V` | Surface |
  | `A` | Auto-rotate |
  | `F` | Fullscreen |
  | `?` | Shortcut list |

  Shortcuts are disabled while typing.

## Architecture

```
src/
  api/http.ts               Shared fetch plumbing: ApiError kinds per service, RateLimiter,
                            timeouts, cancellation
  api/pubchem.ts            PubChem client: 5 req/s limit, one retry when busy, cool-down
  api/cactus.ts             NCI CACTUS client (name fallback)
  api/resolveMolecule.ts    Chooses the source for a search and builds the Molecule
  api/mock/                 Dev-only PubChem mock + fixtures
  chem/chem.worker.ts       OpenChemLib in a Web Worker: SMILES -> MMFF94s-minimized 3D structure,
                            properties from any structure
  chem/client.ts            Lazy worker start-up, job ids, cancellation (terminates the worker)
  hooks/useMolecule.ts      Search state machine (idle | loading | success | error), stale-request
                            cancellation, error → message mapping, spelling suggestions
  hooks/useRecentSearches.ts  localStorage list, max 8, deduplicated by CID (or source + query)
  hooks/useTheme.ts         data-theme on <html>; stored choice → OS preference → dark
  hooks/usePersistentState.ts, hooks/useMediaQuery.ts
  components/
    MoleculeViewer.tsx      Owns the 3Dmol viewer lifecycle, canvas overlays, export, fullscreen
    ViewerControls.tsx      Toolbar docked on the canvas
    PropertiesPanel.tsx     Definition-list presentation of PubChem properties
    SearchBar.tsx, ExampleChips.tsx, RecentSearches.tsx, ChipRow.tsx
    StatusBanner.tsx        Error / warning banners
    ShortcutsPopover.tsx, ThemeToggle.tsx, Formula.tsx, ErrorBoundary.tsx
    ui/                     Primitives: SegmentedControl, ToolButton, Menu, Tooltip, InfoTip,
                            CopyButton, FloatingLayer (portal positioning)
  lib/
    detectInput.ts          Name vs SMILES heuristic
    elementColors.ts        CPK colors + element names for the legend
    formula.ts              Formula → base / subscript / superscript runs
    sdf.ts                  Atom count + element list from an SD file (validation and legend)
    similarity.ts           Edit distance for "Did you mean"
    format.ts, storage.ts, clipboard.ts, shortcuts.ts
  types.ts
  App.tsx, main.tsx, index.css
```

### Data flow

1. `App.runSearch` trims the query and resolves Auto mode with `detectInput`. It then calls `useMolecule.search` and writes the URL.
2. `useMolecule` aborts any in-flight request and calls `resolveMolecule`. That resolves the CID on PubChem, then fetches the structure, properties and synonyms in parallel, falling back to other sources as described below.
3. A successful result becomes a `Molecule`. The viewer and panel render from it. While the next search loads, the previous molecule stays visible, dimmed. After an error it stays visible at full strength.

### Viewer lifecycle (`MoleculeViewer.tsx`)

3Dmol has no `dispose()`. It leaves window/body listeners and its own Resize/IntersectionObservers attached. If its WebGL context is lost while its container still has a size, it creates a new canvas inside that container. This is the root of the classic "two canvases" bug under React 18 StrictMode. The component avoids it as follows:

- **One host per mount.** Each mount creates its own child host `<div>` for 3Dmol. A remount can therefore never put two viewers in one element.
- **Ordered cleanup.** The observers are disconnected, then the host is detached, and only then is the WebGL context released. With the container detached, 3Dmol's context-recovery path cannot run.
- **One effect per concern.** Model, style, labels, surface and spin are separate effects, each with a cleanup that removes exactly what it added. Settings therefore survive molecule changes, and surface IDs are never stale.
- **Async surfaces.** Surfaces are computed asynchronously, but the surface ID is captured immediately. Cleanup removes that ID only if it still exists.
- **Theme-matched background.** The canvas background is read from the same CSS token (`--canvas`) as the UI, and is re-applied when the theme changes.

### Design system

- **Single source.** All colors are CSS variables in `src/index.css`. Tailwind v4 exposes them as tokens via `@theme inline`.
- **Locked-down palette.** Tailwind's default palette, radii, shadows and font sizes are cleared, so only the tokens can be used:
  - two radii: 6px for controls, 10px for panels
  - one popover shadow
  - type sizes of 12, 14, 16 and 20px only
- **Contrast.** Contrast was checked for every text/background pair in both themes. Input borders meet 3:1, and the primary button's white text meets 4.5:1.
- **Accent.** The accent color appears only on the primary button, focus rings, links and the "on" state of toggles. The "on" state also gets an underline bar and `aria-pressed`, so it never relies on color alone.

## Data sources

| Situation | Name search | SMILES search |
| --- | --- | --- |
| PubChem answers | PubChem record (CID, 3D conformer or 2D, full properties) | same |
| PubChem busy, timed out or unreachable | **NCI CACTUS** 3D structure, IUPAC name, SMILES and names; properties computed in the browser | **Computed in the browser** |
| Valid SMILES that PubChem doesn't have (CID 0) | — | **Computed in the browser**: shows molecules that are in no database |
| Unknown name / unparseable SMILES | Error with "Did you mean…" | Error |

- **PubChem first.** The app always asks PubChem first, at no more than 5 requests per second. A "busy" answer is retried once after 2 s.
- **Cool-down.** If PubChem refuses again, the app stops contacting it for 30 s (or PubChem's `Retry-After` when readable) and goes straight to the fallback. This avoids prolonging a block and saves the 2 s retry wait.
- **Why CACTUS only for names.** CACTUS rejects SMILES containing `/` (an encoded slash in the path) and answers unknown input with HTTP 500, so SMILES never go to CACTUS.
- **In-browser computation.** [OpenChemLib](https://github.com/cheminfo/openchemlib-js) runs in a Web Worker:
  - It parses the SMILES, picks a likely collision-free conformer from its torsion library (respecting stereo), and relaxes it with the MMFF94s force field.
  - The worker (~1.1 MB) and its parameter tables (~1.35 MB, 480 kB gzipped) download only on first use.
  - Small drugs take about 1 s and paclitaxel about 8 s.
  - Starting a new search terminates a running computation.
- **Computed properties** (OpenChemLib) cover formula, weight, exact mass, cLogP, TPSA, donors, acceptors and rotatable bonds:
  - Weight, exact mass and TPSA match PubChem's for the drugs tested.
  - logP is a different method, so it's labelled **cLogP** rather than XLogP.
  - H-bond acceptor counts use a different definition (caffeine: 6 vs PubChem's 3), which the panel notes.
  - Complexity is PubChem-only.

## PubChem endpoints used

| Purpose | Request |
| --- | --- |
| Name → CID | `GET /rest/pug/compound/name/{name}/cids/JSON` |
| SMILES → CID | `POST /rest/pug/compound/smiles/cids/JSON` with form body `smiles=…`. POST is used because `#`, `/`, `+` break URL paths. |
| 3D structure | `GET /rest/pug/compound/cid/{cid}/record/SDF?record_type=3d` |
| 2D fallback | `GET /rest/pug/compound/cid/{cid}/record/SDF?record_type=2d` when 3D returns 404 |
| Properties | `GET /rest/pug/compound/cid/{cid}/property/Title,MolecularFormula,MolecularWeight,IUPACName,SMILES,ConnectivitySMILES,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,Complexity,ExactMass/JSON` |
| Synonyms | `GET /rest/pug/compound/cid/{cid}/synonyms/JSON` |
| Spelling suggestions | `GET /rest/autocomplete/compound/{term}/json?limit=…` |

Base URL: `https://pubchem.ncbi.nlm.nih.gov`. Each request times out after 10 s.

NCI CACTUS (`https://cactus.nci.nih.gov/chemical/structure/{name}/...`): `file?format=sdf&get3d=true`, `iupac_name`, `smiles`, `names`. Limited to 3 requests per second, with a 15 s timeout.

## Decisions worth knowing

- **Input detection is stricter than "contains digits or punctuation".** Input is treated as SMILES only if all three hold:
  - it has no whitespace
  - it uses only SMILES characters, so letters like `u`, `a`, `t` rule it out
  - it shows a SMILES signal: syntax characters, ring digits, or an all-caps chain such as `CCO`

  So `2-butanol` and `1,4-dioxane` are treated as names. A malformed SMILES such as `C1CC(=O` is still treated as SMILES, so PubChem reports the real problem.
- **SMILES not in PubChem.** A valid SMILES that PubChem does not have comes back as CID `0`. Instead of an error, the app computes a 3D model in the browser and labels it "Not in PubChem". The SMILES shown is the one you typed.
- **Display name.** The name comes from PubChem's `Title` property (added to the requested list), so SMILES searches still get a human name. If there is no title, the app falls back to the searched name, then to `CID n`.
- **SMILES field names.** PubChem renamed `IsomericSMILES` → `SMILES` and `CanonicalSMILES` → `ConnectivitySMILES`. The client reads either pair. If the new names are rejected with a 400, it retries once with the legacy names.
- **First load.** The app loads `?q=` if present, otherwise the most recent search, otherwise Caffeine. The viewer never opens empty.
- **"Did you mean".** PubChem's autocomplete matches prefixes, so `asprin` alone returns nothing useful. The app also queries short prefixes of the term, then keeps and ranks results by edit distance.
- **Request pacing.** Every PubChem request waits for a slot so no more than 5 start in any 1.1 s window. A normal search (4–5 requests) is not delayed. "Busy" handling is described under [Data sources](#data-sources). If every source fails, the error gives an estimated wait: PubChem's `Retry-After` when the browser can read it, otherwise 30 s, its usual value.
- **Framing on phones.** 3Dmol's `zoomTo` fits the molecule to the vertical field of view only. On portrait canvases the view is zoomed out by the aspect ratio so molecules are not cropped at the sides.
- **Auto-rotate.** Spin is never persisted, so the page never starts in motion. With reduced motion enabled, the intro zoom, transitions and loading animations are also turned off.
- **Fonts.** Inter and JetBrains Mono load from Google Fonts. Self-hosting them (e.g. `@fontsource`) would remove the third-party request.

## Known limitations

- **Unavailable data.** PubChem computes 3D conformers only for compounds that are not too large, flexible or multi-component (e.g. Taxol). For those the app shows 2D coordinates. Depth in that view is meaningless, as the banner says.
- **Name lookup.** The GET endpoint is used, as specified. Names containing `/` may be misread by PubChem; the POST form would be more robust.
- **Bundle size.** 3Dmol.js is ~790 kB minified (~230 kB gzipped) and is loaded up front. OpenChemLib and its tables (~2.4 MB) load only when a fallback or unlisted SMILES needs them.
- **Computed structures are models.** A browser-computed conformer is one plausible low-energy shape, not a reference structure. It can differ from PubChem's for flexible molecules. Multi-component SMILES (salts) may fail to embed.
- **CACTUS coverage.** CACTUS knows fewer trade names than PubChem, and its servers are slower and less reliable.
- **Rate limits.** PubChem allows 5 requests per second per client. The limiter in `api/pubchem.ts` keeps each browser tab under that, but several tabs together can still exceed it. Heavy use from one IP address can also trigger a block lasting tens of seconds; the banner then gives an expected wait and a Retry button.
- **Fullscreen.** The Fullscreen API isn't available for elements on iPhone Safari, so the button is hidden there.
- **Mobile toolbar.** The viewer toolbar scrolls horizontally on narrow screens instead of collapsing into a menu.

## Ideas for next features

- Load by CID, InChI or InChIKey, and draw-to-search with a 2D sketcher.
- Side-by-side comparison of two compounds with synchronized cameras.
- Measure distances, angles and dihedrals by clicking atoms.
- Color by partial charge or highlight functional groups and stereocenters.
- Show several PubChem conformers (`conformers/JSON`) and step through them.
- "Computed vs PubChem" toggle that overlays the browser-computed conformer on PubChem's, with an RMSD readout.
- Draw-to-3D: a 2D sketcher (OpenChemLib ships one) feeding the in-browser conformer generator.
- Export glTF / STL for 3D printing; copy a shareable link to the current view (camera included).
- Offline cache of fetched records (IndexedDB) and a service worker for repeat visits.
- Unit tests for `lib/` (detector, formula parser, SDF reader) and the end-to-end checks used during development, wired into CI.
