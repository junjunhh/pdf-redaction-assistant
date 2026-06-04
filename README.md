# PDF Redaction Assistant

Browser-only PDF review tool built with React, Vite, TypeScript, pdf.js, and pdf-lib.

The app lets a user upload one or more PDFs, detects likely dates and person names, shows the pages with thumbnails, lets the user select or manually mark text/regions, and exports highlighted or redacted PDFs without a backend.

## Run Locally

```bash
npm install
npm run dev
```

For a production readiness check:

```bash
npm run build
```

## Project Structure

```txt
.
├── index.html                # Vite entry HTML
├── vite.config.ts            # Vite + React + Tailwind config
├── tsconfig.json             # TypeScript config
├── package.json
└── src/
    ├── main.tsx              # App bootstrap; mounts <App>, loads global CSS
    ├── App.tsx               # Document queue owner: upload, validation, active doc
    ├── styles.css            # App-shell / workspace layout styles
    ├── tailwind.css          # Tailwind entry
    ├── theme.css             # Light/dark theme tokens
    │
    ├── components/           # UI (presentation + interaction)
    │   ├── LandingUpload.tsx     # Empty-state upload screen (first view)
    │   ├── FileUpload.tsx        # File <input> / drag-and-drop control
    │   ├── Layout.tsx            # Main workspace controller + per-doc edit state
    │   ├── ThumbnailPanel.tsx    # Left panel: page thumbnail strip
    │   ├── PdfThumbnail.tsx      # One cached page thumbnail + delete
    │   ├── PdfViewer.tsx         # Center panel: toolbar, zoom, page windowing
    │   ├── PdfPage.tsx           # One page: canvas, text layer, overlays, drawing
    │   ├── EntityPanel.tsx       # Right panel: entities, redactions, search
    │   ├── EntitySection.tsx     # Collapsible Dates / Names group
    │   ├── EntityRow.tsx         # One detected-entity row
    │   ├── ColorLegend.tsx       # Date/name color key
    │   ├── InfoBanner.tsx        # Inline status / info messages
    │   └── ThemeToggle.tsx       # Light/dark toggle button
    │
    ├── lib/                  # Logic (no React; unit-testable)
    │   ├── pdfLoader.ts          # Load an ArrayBuffer into pdf.js
    │   ├── pdfText.ts            # Per-page text extraction + PDF coord mapping
    │   ├── datePatterns.ts       # Date regex patterns + matcher
    │   ├── namePatterns.ts       # Title-case name heuristics + blocklists
    │   ├── extractEntities.ts    # Build normalized DetectedEntity records
    │   ├── searchPdf.ts          # Full-document text search
    │   ├── measurePdfHighlightBoxes.ts  # Remeasure boxes vs. offscreen text layer
    │   ├── exportHighlightedPdf.ts      # Draw highlights, collect black-outs, export
    │   ├── rasterizeRedactedPages.ts    # True redaction: flatten redacted pages
    │   ├── exportDocument.ts            # Single-document export pipeline
    │   ├── exportAllAsZip.ts            # Batch ZIP export with unique filenames
    │   ├── documentsReducer.ts          # Multi-document queue reducer
    │   ├── useTheme.ts                  # Theme state + persistence hook
    │   └── pdfErrors.ts                 # pdf.js cancellation-error helper
    │
    └── types/                # Shared TypeScript models
        ├── entity.ts             # EntityType, DetectedEntity, ManualRedaction, ...
        └── document.ts           # DocumentEntry, DocumentEditState, HistoryAction
```

The split is deliberate: `components/` holds React/UI, `lib/` holds framework-free
logic (PDF parsing, entity detection, coordinate math, export), and `types/` holds
the shared data model both sides agree on. See **Problem Decomposition** below for
how these pieces map onto the problems they solve.

## How to Use

### 1. Upload PDFs

- On the landing screen, click **Choose PDF** or drag-and-drop one or more `.pdf`
  files onto the dropzone. Non-PDF files are rejected with a message.
- Each file opens in its own tab. Use **Upload More PDFs** (top bar) to add more;
  click a tab to switch, or the tab's **×** to close it. Per-document edits
  (selections, redactions, deleted pages, undo history) are preserved per tab.

### 2. Review detected entities (right panel)

- Detected **Dates** and **Person Names** are grouped into collapsible sections
  with a count badge. The header toggles (top bar) show/hide each type.
- **Click an entity row** to select it — the center PDF scrolls and centers on
  that word and highlights it. Click again to deselect.
- **Select all / Clear all** toggles every entity of a type at once.
- **Filter** box: type to filter rows by text or page number.
- **Find all** mode: type any text to search the whole document; matches are
  highlighted in the viewer and listed as results you can jump to.

### 3. Navigate

- **Thumbnails (left panel):** click a page to jump to it; the active page is
  highlighted and tracks as you scroll.
- **Page box / Zoom (toolbar):** type a page number to jump; zoom with the −/+
  buttons, presets, **Fit width**, or **Fit page**.
- **Keyboard:**
  - **← / →** — move to the previous/next entity (selects it, scrolls to it).
  - **Enter / Space** — toggle selection of the active entity.
  - **Backspace / Delete** — remove the active entity or redaction from review.
  - **Cmd/Ctrl+Z** — undo; **Cmd/Ctrl+Shift+Z** — redo.

### 4. Redact

- **Black out a detected entity:** click its highlight in the viewer to toggle a
  solid black box (click again to undo).
- **Black Out All (toolbar):** blacks out every detected entity and manual
  redaction in one click. It is a toggle — once everything is blacked out the
  button reads **"Clear Black-Outs"** and clicking it removes the black-out from
  all of them. A single undo reverts the whole action either way (it only
  changes the items that action touched).
- **Manual Redaction (toolbar):** enable, then select text in the page to mark it.
  A small editor box appears titled **"Text Redaction"** with a category selector
  and **Delete**.
- **Draw Region (toolbar):** enable, then drag a box anywhere (e.g. over an image).
  It is blacked out on creation and its editor box is titled **"Drawn Region"**;
  drawn regions can be moved and resized via their handles.
- Click an active redaction again (row or overlay) to **deselect** it, or click
  **empty space** on the page to dismiss its editor box. Deselecting never deletes.
- **Delete a page:** hover a thumbnail and click its trash icon. Undo restores it.

### 5. Export

- **Download Current** — exports the active document with highlights drawn and
  blacked-out content **truly redacted** (redacted pages are flattened to images
  so covered text cannot be recovered). Deleted pages are removed.
- **Download All** — exports every edited document into a single ZIP (filenames
  de-duplicated).

## Function Reference

Framework-free logic lives in `src/lib`. Each function is pure/async and unit-
testable in isolation. UI components consume these; see the call sites noted.

### PDF loading & text — `pdfLoader.ts`, `pdfText.ts`

- **`loadPdfDocument(source: File | ArrayBuffer): Promise<PDFDocumentProxy>`**
  Loads a PDF into pdf.js entirely in the browser. Accepts a `File` or raw
  `ArrayBuffer`. Used by `App` on upload and by exports for rasterization.

- **`extractPageTextData(pdfDocument, pageNumber)`**
  Returns `{ text, textItems, viewport, styles }` for one page: the normalized
  page text, the raw pdf.js text items (with transforms), the scale-1 viewport,
  and font styles. The basis for both detection and highlight positioning.

- **`findTextMatchBounds(textItems, match, viewport, styles?)`**
  Maps a text match (start/end offsets) to bounding boxes. Returns
  `{ bbox, pdfBoxes }` — a CSS-space union box and per-fragment PDF-space boxes.
  Uses canvas `measureText` with the real font for sub-word accuracy.

- **`findTextMatchBbox(...)`** — convenience wrapper returning just `bbox`.

### Entity detection — `datePatterns.ts`, `namePatterns.ts`, `extractEntities.ts`

- **`findDateMatches(text): TextMatch[]`**
  Regex-based date detection: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD-MMM-YYYY`,
  `Month DD, YYYY`, `DD Month YYYY`, and ISO `YYYY-MM-DD`. De-duplicated and
  sorted by position.

- **`findNameMatches(text, blockedRanges?): TextMatch[]`**
  Heuristic person-name detection: Title-Case sequences (2–3 words, optional
  honorific), with blocklists for headings/labels/all-caps and overlap removal.
  `blockedRanges` (e.g. detected dates) are excluded.

- **`extractEntitiesFromPdf(pdfDocument): Promise<DetectedEntity[]>`**
  Runs date + name detection across every page and produces normalized
  `DetectedEntity` records (id, type, text, page, offsets, bbox, pdfBoxes).
  Yields to the browser periodically so large PDFs stay responsive.

### Search — `searchPdf.ts`

- **`searchPdfText(pdfDocument, query): Promise<SearchMatch[]>`**
  Case-insensitive full-document substring search; returns every match with its
  page and bbox so the viewer can highlight and jump to it. Powers **Find all**.

### Highlight measurement — `measurePdfHighlightBoxes.ts`

- **`measurePdfHighlightBoxes(pdfDocument, entities): Promise<Map<id, TextBounds[]>>`**
  Re-measures entity boxes against an offscreen pdf.js text layer for
  export-accurate PDF coordinates (more precise than the stored approximation).

- **`measureManualRedactionPdfBoxes(pdfDocument, redactions): Promise<Map<id, TextBounds[]>>`**
  Same, for manual redactions/regions.

### Export — `exportHighlightedPdf.ts`, `rasterizeRedactedPages.ts`, `exportDocument.ts`, `exportAllAsZip.ts`

- **`exportHighlightedPdf(originalBytes, selected, …, deletedPages, pdfjsDoc)`**
  Builds the output PDF: draws translucent highlights with pdf-lib, collects
  blacked-out boxes per page, removes deleted pages, and routes redacted pages to
  rasterization. **Fails closed** (throws) if a redaction is requested but no
  pdf.js document is available, rather than emit a file that only *looks* redacted.

- **`rasterizeRedactedPages(pdfDoc, pdfjsDoc, paintBoxesByPage)`**
  True redaction: renders each redacted page to a canvas, bakes the black boxes
  (and any highlights) into it, and replaces the page with that flattened image —
  so the underlying text is physically gone, not just covered.

- **`getHighlightedFileName(fileName)`** — derives the `*_highlighted.pdf` output name.

- **`exportDocumentBytes(entry): Promise<Uint8Array>`** — full single-document
  export pipeline (derive selections → measure → `exportHighlightedPdf`).

- **`documentHasDownloadableHighlights(entry): boolean`** — whether a document has
  anything to export (gates the download buttons).

- **`exportAllAsZip(documents): Promise<Blob | null>`** — exports all exportable
  documents into one ZIP with de-duplicated filenames; `null` if nothing to export.

### State & misc — `documentsReducer.ts`, `useTheme.ts`, `pdfErrors.ts`

- **`documentsReducer(state, action)` / `initialDocumentsState`**
  Manages the multi-document queue: `add`, `setActive`, `remove`, `updateEdit`,
  `reset`. Removing the active document focuses a neighbour.

- **`useTheme()` / `getInitialTheme()`**
  Light/dark theme hook; persists the choice to `localStorage` and honours the OS
  preference on first load. Returns `{ theme, toggleTheme }`.

- **`isPdfCancellationError(error): boolean`**
  Recognizes pdf.js render-cancellation errors so the UI can ignore them (cancels
  happen routinely as pages scroll in/out of view).

## Problem Decomposition

### 1. Load PDFs in the Browser

The first problem is loading arbitrary user PDFs without a backend. `loadPdfDocument` reads the file as an `ArrayBuffer` and passes it to pdf.js. This keeps the project private and avoids external API calls.

Relevant files:

- `src/App.tsx`
- `src/lib/pdfLoader.ts`

### 2. Extract Text and Detect Entities

The second problem is converting PDF text items into a normalized string while preserving enough position data to highlight the source text later. `extractPageTextData` gathers each page's text items, then `findDateMatches` and `findNameMatches` apply lightweight browser-safe heuristics.

Dates are detected with regex patterns for common numeric, month-name, and ISO formats. Names are detected with Title Case heuristics plus blocklists to reduce headings and labels being treated as people.

Relevant files:

- `src/lib/pdfText.ts`
- `src/lib/datePatterns.ts`
- `src/lib/namePatterns.ts`
- `src/lib/extractEntities.ts`

### 3. Convert PDF Coordinates to UI Highlights

PDF text coordinates and browser overlay coordinates use different coordinate systems. The app stores approximate text bounds from pdf.js, then refines highlights against the rendered pdf.js text layer where possible.

This is why detected entities store both text offsets and bounding boxes: offsets help re-measure exact text ranges after rendering, while boxes provide a fallback and support export.

Relevant files:

- `src/lib/pdfText.ts`
- `src/components/PdfPage.tsx`
- `src/lib/measurePdfHighlightBoxes.ts`

### 4. Manage Multi-Document Review State

The app supports multiple uploaded PDFs at once. `App` owns the document queue, while `Layout` owns the active document's live editing state. Each document has its own selections, black-outs, deleted pages, manual redactions, undo stack, and redo stack.

Relevant files:

- `src/App.tsx`
- `src/lib/documentsReducer.ts`
- `src/types/document.ts`
- `src/components/Layout.tsx`

### 5. Render the Review Workspace

The interface is split into three areas:

- Left: page thumbnails and page deletion.
- Center: PDF rendering, zoom, page navigation, highlights, manual text selection, and freehand region drawing.
- Right: detected entities, manual redactions, selection controls, and document search.

Large PDFs use windowed page rendering around the current page so the browser does not render every page canvas at once.

Relevant files:

- `src/components/ThumbnailPanel.tsx`
- `src/components/PdfThumbnail.tsx`
- `src/components/PdfViewer.tsx`
- `src/components/PdfPage.tsx`
- `src/components/EntityPanel.tsx`
- `src/components/EntitySection.tsx`
- `src/components/EntityRow.tsx`

### 6. Export Highlights and True Redactions

Highlight-only exports draw translucent rectangles using pdf-lib. Blacked-out redactions are handled differently: pages containing redactions are rasterized and replaced with flattened images that include the black boxes. This prevents hidden text from remaining extractable underneath the redaction.

The export fails closed if true redaction is requested but no pdf.js document is available for rasterization.

Relevant files:

- `src/lib/exportHighlightedPdf.ts`
- `src/lib/rasterizeRedactedPages.ts`
- `src/lib/exportDocument.ts`
- `src/lib/exportAllAsZip.ts`

## Data Model

### Entity Types

```ts
type EntityType = 'date' | 'name';
```

The app only classifies two entity categories: dates and person names.

### DetectedEntity

```ts
type DetectedEntity = {
  id: string;
  type: EntityType;
  text: string;
  pageNumber: number;
  matchIndex: number;
  pageTextStart: number;
  pageTextEnd: number;
  bbox: TextBounds | null;
  pdfBoxes?: TextBounds[];
};
```

Rationale:

- `id` lets UI state track selections and black-outs reliably.
- `pageNumber` connects the entity to thumbnails, viewer pages, and export pages.
- `pageTextStart` and `pageTextEnd` allow exact text-layer remeasurement.
- `bbox` gives a quick UI/export fallback.
- `pdfBoxes` stores export-ready PDF coordinate boxes when available.

### ManualRedaction

```ts
type ManualRedaction = {
  id: string;
  pageNumber: number;
  category: EntityType;
  text: string;
  boxes: TextBounds[];
  source: 'text' | 'region';
};
```

Rationale:

- Text-selection redactions may have multiple boxes across line breaks.
- Region redactions support image or arbitrary-area redaction.
- `category` reuses the date/name color system and panel grouping.

### DocumentEditState

```ts
type DocumentEditState = {
  currentPage: number;
  deletedPageNumbers: ReadonlySet<number>;
  deletedEntityIds: ReadonlySet<string>;
  activeEntityId: string | null;
  selectedEntityIds: ReadonlySet<string>;
  blackedOutEntityIds: ReadonlySet<string>;
  manualRedactions: ManualRedaction[];
  selectedManualRedactionIds: ReadonlySet<string>;
  blackedOutManualRedactionIds: ReadonlySet<string>;
  activeManualRedactionId: string | null;
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
};
```

Rationale:

- `Set` values make selection, deletion, and black-out checks fast and explicit.
- State is stored per document so switching tabs preserves each PDF's edits.
- Undo and redo use typed history actions rather than generic snapshots.

## Architecture Decisions

- React + Vite: simple local frontend stack with fast development and static build output.
- pdf.js for reading/rendering: reliable browser PDF parsing, page canvases, text content, and text layer rendering.
- pdf-lib for writing PDFs: supports drawing highlights, deleting pages, embedding rasterized pages, and saving client-side bytes.
- No backend: all PDF processing stays in the browser for privacy and simpler setup.
- Regex/heuristic entity extraction: browser-safe, explainable, and dependency-light. Accuracy is intentionally approximate.
- Normalized entity model: shared by viewer highlights, entity panel rows, search, thumbnails, and export.
- Text offsets plus boxes: offsets support accurate UI highlight measurement; boxes support fallback and export.
- Page rasterization for black-outs: ensures redacted text is not still selectable or extractable under opaque rectangles.
- Fail-closed redaction export: if a true redaction cannot be rasterized, the app aborts export instead of producing a misleading file.
- Windowed page rendering: improves performance for larger documents by rendering pages near the active page.
- Separate document queue and active edit state: keeps multi-PDF workflows manageable without mixing edits between files.

## Known Limitations

- Scanned/image-only PDFs may render but will not produce detected text entities.
- Name detection is heuristic and may miss unusual names or include some false positives.
- Blacked-out pages are rasterized, so non-redacted text on those pages becomes image content rather than selectable vector text.
- Redaction is visual-and-content safe by flattening whole redacted pages, not by surgically rewriting individual PDF text streams.
