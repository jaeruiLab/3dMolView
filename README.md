# MolView 3D

An interactive 3D molecule viewer that runs entirely in the browser. Type a compound name (`caffeine`) or a SMILES string (`CC(=O)OC1=CC=CC=C1C(=O)O`). MolView 3D resolves it on PubChem, renders the structure with 3Dmol.js and lists the compound's computed properties.

There is no backend. Every request goes straight from the browser to the CORS-enabled PubChem PUG REST API.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (tsc -b) + production build to dist/
npm run preview    # serve the production build
```

Requires Node 18+ (developed on Node 24).

## Features

- **Search** by name or SMILES, with an Auto / Name / SMILES toggle. In Auto mode, the line under the input shows how the text will be read (`Detected: SMILES`). `Enter` submits and `/` focuses the field.
- **Viewer:** ball & stick, stick, spacefill and wireframe styles in CPK (Jmol) colors. Also atom labels, a translucent van der Waals surface, auto-rotate, reset view, fullscreen, and PNG / SDF export. A legend lists only the elements present in the molecule.
- **Provenance:** a tag on the canvas always says whether you are looking at a PubChem 3D conformer or 2D depiction coordinates. In the 2D case an amber banner also appears.
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
  api/pubchem.ts            Typed PubChem client: timeouts, AbortSignal, PubChemError kinds
  hooks/useMolecule.ts      Search state machine (idle | loading | success | error), stale-request
                            cancellation, error → message mapping, spelling suggestions
  hooks/useRecentSearches.ts  localStorage list, max 8, deduplicated by CID
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
2. `useMolecule` aborts any in-flight request and resolves the CID. It then fetches the structure, properties and synonyms in parallel.
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

## Decisions worth knowing

- **Input detection is stricter than "contains digits or punctuation".** Input is treated as SMILES only if all three hold:
  - it has no whitespace
  - it uses only SMILES characters, so letters like `u`, `a`, `t` rule it out
  - it shows a SMILES signal: syntax characters, ring digits, or an all-caps chain such as `CCO`

  So `2-butanol` and `1,4-dioxane` are treated as names. A malformed SMILES such as `C1CC(=O` is still treated as SMILES, so PubChem reports the real problem.
- **SMILES not in PubChem.** A valid SMILES that PubChem does not have comes back as CID `0`. It is reported as "No PubChem compound matches this SMILES", not as a parse error.
- **Display name.** The name comes from PubChem's `Title` property (added to the requested list), so SMILES searches still get a human name. If there is no title, the app falls back to the searched name, then to `CID n`.
- **SMILES field names.** PubChem renamed `IsomericSMILES` → `SMILES` and `CanonicalSMILES` → `ConnectivitySMILES`. The client reads either pair. If the new names are rejected with a 400, it retries once with the legacy names.
- **First load.** The app loads `?q=` if present, otherwise the most recent search, otherwise Caffeine. The viewer never opens empty.
- **"Did you mean".** PubChem's autocomplete matches prefixes, so `asprin` alone returns nothing useful. The app also queries short prefixes of the term, then keeps and ranks results by edit distance.
- **Framing on phones.** 3Dmol's `zoomTo` fits the molecule to the vertical field of view only. On portrait canvases the view is zoomed out by the aspect ratio so molecules are not cropped at the sides.
- **Auto-rotate.** Spin is never persisted, so the page never starts in motion. With reduced motion enabled, the intro zoom, transitions and loading animations are also turned off.
- **Fonts.** Inter and JetBrains Mono load from Google Fonts. Self-hosting them (e.g. `@fontsource`) would remove the third-party request.

## Known limitations

- **Unavailable data.** PubChem computes 3D conformers only for compounds that are not too large, flexible or multi-component (e.g. Taxol). For those the app shows 2D coordinates. Depth in that view is meaningless, as the banner says.
- **Name lookup.** The GET endpoint is used, as specified. Names containing `/` may be misread by PubChem; the POST form would be more robust.
- **Bundle size.** 3Dmol.js is ~790 kB minified (~230 kB gzipped) and is loaded up front.
- **Rate limits.** PubChem allows 5 requests per second per client. Rapid repeated searches can return "busy"; the banner offers Retry.
- **Fullscreen.** The Fullscreen API isn't available for elements on iPhone Safari, so the button is hidden there.
- **Mobile toolbar.** The viewer toolbar scrolls horizontally on narrow screens instead of collapsing into a menu.

## Ideas for next features

- Load by CID, InChI or InChIKey, and draw-to-search with a 2D sketcher.
- Side-by-side comparison of two compounds with synchronized cameras.
- Measure distances, angles and dihedrals by clicking atoms.
- Color by partial charge or highlight functional groups and stereocenters.
- Show several PubChem conformers (`conformers/JSON`) and step through them.
- Export glTF / STL for 3D printing; copy a shareable link to the current view (camera included).
- Offline cache of fetched records (IndexedDB) and a service worker for repeat visits.
- Unit tests for `lib/` (detector, formula parser, SDF reader) and the end-to-end checks used during development, wired into CI.
