# PDF Redaction Assistant — Requirements & Build Plan

## 1. Project Summary

Build a browser-only **PDF Redaction Assistant** web app. The app allows a user to upload a PDF, renders the PDF page-by-page in the browser, extracts likely **dates** and **person names** from the PDF text content, and displays clickable entity results that highlight the matching locations in the PDF viewer.

The final app should have a clean **three-panel interface**:

- **Left panel:** page thumbnails for navigation.
- **Centre panel:** PDF viewer with entity highlight overlays.
- **Right panel:** detected entity list for dates and names.

The project must run locally with no backend and no external API calls. All PDF parsing, entity extraction, rendering, and highlighting must happen in the browser.

---

## 2. Core Requirements

### 2.1 Local Browser App

The app must:

- Run locally using at most two commands, for example:

```bash
npm install
npm run dev
```

- Use the browser for all processing.
- Not require a backend server.
- Not call external AI APIs or cloud services.
- Allow the user to upload a PDF at runtime.
- Not hardcode a specific PDF file.

Recommended stack:

- React + Vite
- pdf.js / pdfjs-dist
- Optional: compromise.js for lightweight name extraction
- CSS modules, plain CSS, Tailwind, or another simple styling approach

---

## 3. Interface Requirements

The app must use a three-panel layout.

### 3.1 Left Panel — Page Thumbnails

The left panel should display a vertical page thumbnail strip.

Required behaviour:

- Show one thumbnail per PDF page.
- Show page labels such as `Page 1`, `Page 2`, `Page 3`.
- Clicking a thumbnail scrolls or jumps the centre viewer to that page.
- The currently visible or selected page thumbnail is visually highlighted.

Suggested UI details:

- Narrow vertical sidebar.
- Small canvas/image preview of each page.
- Active page border, background, or shadow.
- Upload status card at the top showing file name and page count.

---

### 3.2 Centre Panel — PDF Viewer

The centre panel should render the uploaded PDF page-by-page.

Required behaviour:

- Render all PDF pages using pdf.js.
- Display pages in a scrollable viewer.
- Overlay semi-transparent highlight boxes on top of detected entities.
- Use different colours for entity types:
  - Dates: yellow highlight.
  - Names: blue highlight.
- When an entity item is clicked in the right panel:
  - Scroll to the correct page.
  - Show or emphasize the corresponding highlight.
  - Distinguish the selected highlight from normal highlights.
- Multiple highlights may be visible at once if multiple items are selected.

Important technical note:

- pdf.js text coordinates use a PDF coordinate system, while CSS overlay positioning uses a browser coordinate system.
- The implementation must correctly convert PDF text item coordinates to CSS highlight positions.
- Pay special attention to y-axis flipping and viewport scaling.

Suggested UI details:

- Light grey workspace background.
- White PDF page surfaces with subtle shadow.
- Top toolbar with zoom, fit page, page indicator, and clear selection.
- Selected highlight should have stronger outline or glow.

---

### 3.3 Right Panel — Entity Panel

The right panel should display detected entities grouped by type.

Required sections:

- `Show Dates`
- `Show Names`

Required behaviour:

- Each section can be expanded/collapsed.
- Each expanded section lists every detected instance across the full document.
- Each entity row shows:
  - Entity text.
  - Entity type.
  - Page number.
- Clicking an entity row:
  - Selects the entity.
  - Scrolls the PDF viewer to the correct page.
  - Highlights the entity location in the centre viewer.
- The active selected entity row should be visually distinguished.

Suggested UI details:

- Count badge beside each section title.
- Search/filter input inside the entity panel.
- Entity rows with small type markers.
- Selected row uses accent background or bold text.

---

## 4. Entity Extraction Requirements

The app must extract two entity types from the uploaded PDF text content.

### 4.1 Date Extraction

Detect common date formats using regex.

Minimum required formats:

1. `DD/MM/YYYY`
   - Example: `12/01/2024`

2. `DD-MM-YYYY`
   - Example: `12-01-2024`

3. `DD-MMM-YYYY` or similar month abbreviation format
   - Example: `03-Feb-2024`

4. `Month DD, YYYY`
   - Example: `January 12, 2024`

5. `DD Month YYYY`
   - Example: `12 January 2024`

6. ISO format `YYYY-MM-DD`
   - Example: `2024-01-12`

Implementation notes:

- Use a combined regex or multiple regex patterns.
- Normalize extracted entity records into one common data structure.
- Avoid crashing on malformed matches.
- False positives are acceptable if documented.

---

### 4.2 Person Name Extraction

Detect likely person names.

Acceptable approaches:

1. Regex-based heuristic:
   - Match Title Case sequences of two or more words.
   - Examples:
     - `John Smith`
     - `Alice Wong`
     - `Mary O'Brien`
     - `Anne-Marie Lee`

2. Lightweight NLP library:
   - Example: compromise.js
   - Must work in the browser.

Recommended simple regex direction:

```js
/\b[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)*\b/g
```

Implementation notes:

- Perfect NER accuracy is not required.
- False positives should be handled gracefully.
- The README must clearly explain the chosen method and known limitations.
- Avoid detecting dates, headings, all-caps text, and common PDF labels as names where possible.

---

## 5. Data Model Requirements

Use a clear normalized entity model so that the UI can coordinate between PDF rendering, highlights, thumbnails, and entity lists.

Recommended entity object:

```ts
type EntityType = 'date' | 'name';

type DetectedEntity = {
  id: string;
  type: EntityType;
  text: string;
  pageNumber: number;
  matchIndex: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selected: boolean;
};
```

Recommended app state:

```ts
type AppState = {
  file: File | null;
  pdfDocument: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  scale: number;
  entities: DetectedEntity[];
  selectedEntityIds: string[];
  showDates: boolean;
  showNames: boolean;
  isLoading: boolean;
  error: string | null;
};
```

Key state behaviour:

- Uploading a new PDF clears previous entities and selections.
- Selecting an entity updates `selectedEntityIds`.
- Clicking a page thumbnail updates `currentPage` and scrolls viewer.
- Scrolling the viewer updates the active thumbnail.
- Toggling date/name sections controls visibility in the entity panel and optionally highlight visibility.

---

## 6. Suggested Component Structure

Recommended React structure:

```txt
src/
  App.tsx
  main.tsx
  styles.css

  components/
    FileUpload.tsx
    Layout.tsx
    ThumbnailPanel.tsx
    PdfViewer.tsx
    PdfPage.tsx
    HighlightOverlay.tsx
    EntityPanel.tsx
    EntitySection.tsx
    EntityRow.tsx
    Toolbar.tsx

  lib/
    pdfLoader.ts
    extractEntities.ts
    datePatterns.ts
    namePatterns.ts
    coordinateUtils.ts
    entityUtils.ts

  types/
    pdf.ts
    entity.ts
```

Responsibilities:

- `FileUpload`: handles PDF file selection.
- `ThumbnailPanel`: renders page thumbnails and page navigation.
- `PdfViewer`: manages page rendering and scroll behaviour.
- `PdfPage`: renders one PDF page canvas and its overlay layer.
- `HighlightOverlay`: positions entity highlight rectangles.
- `EntityPanel`: displays dates and names.
- `extractEntities`: extracts dates and names from pdf.js text content.
- `coordinateUtils`: converts pdf.js coordinates into CSS overlay coordinates.

---

## 7. Implementation Plan for Codex

### Step 1 — Project Setup

- Create a React + Vite project.
- Install required dependencies:

```bash
npm install pdfjs-dist
```

Optional:

```bash
npm install compromise
```

- Confirm the app runs with:

```bash
npm run dev
```

Deliverable:

- Basic app shell opens in browser.
- No PDF functionality yet.

---

### Step 2 — Build Three-Panel Layout

Create the static UI first.

Tasks:

- Add left thumbnail panel.
- Add centre PDF viewer area.
- Add right entity panel.
- Add responsive sizing.
- Add placeholder upload card and empty states.

Deliverable:

- Clean three-panel layout visible before uploading a PDF.

Acceptance checks:

- Left, centre, and right panels are visually distinct.
- Layout does not collapse on normal laptop screen sizes.
- Empty states explain what the user should do.

---

### Step 3 — Add PDF Upload and Loading

Tasks:

- Add file input accepting `.pdf`.
- Read the file as ArrayBuffer.
- Load PDF using pdf.js.
- Store PDF document and page count in state.
- Handle loading and error states.

Deliverable:

- User can upload a PDF.
- App displays file name and page count.

Acceptance checks:

- Uploading a valid PDF works.
- Uploading another PDF resets previous state.
- Invalid file type or load failure shows a friendly error.

---

### Step 4 — Render PDF Pages in Centre Viewer

Tasks:

- Render each PDF page onto a canvas.
- Use pdf.js viewport and scale.
- Stack pages vertically in the centre viewer.
- Add page labels or page numbers.

Deliverable:

- Uploaded PDF renders page-by-page in the centre panel.

Acceptance checks:

- Multi-page PDFs render correctly.
- Page order is correct.
- Viewer is scrollable.
- PDF remains readable.

---

### Step 5 — Generate Page Thumbnails

Tasks:

- Render small thumbnail canvases for each page.
- Display thumbnails in the left panel.
- Add click-to-scroll behaviour.
- Track current visible page using scroll position or IntersectionObserver.
- Highlight active thumbnail.

Deliverable:

- Left panel thumbnails navigate the PDF viewer.

Acceptance checks:

- Clicking `Page 2` scrolls to page 2.
- Active page thumbnail updates when scrolling.
- Thumbnails are visually usable.

---

### Step 6 — Extract Text Content from PDF

Tasks:

- For each page, call `page.getTextContent()`.
- Store text items with page number and transform data.
- Preserve enough text item information to calculate highlight positions.

Deliverable:

- App can collect text content from every page.

Acceptance checks:

- Console/debug output shows page text is being read.
- Text extraction works across multiple pages.
- Empty/scanned PDFs do not crash the app.

---

### Step 7 — Implement Date Detection

Tasks:

- Create date regex patterns.
- Run date extraction on page text.
- Create `DetectedEntity` records for each match.
- Include text, type, page number, unique ID, and approximate bounding box.

Deliverable:

- Dates appear in the right entity panel.

Acceptance checks:

- Detects `12/01/2024`.
- Detects `03-Feb-2024`.
- Detects `January 12, 2024`.
- Detects `12 January 2024`.
- Detects `2024-01-12`.

---

### Step 8 — Implement Name Detection

Tasks:

- Add regex or compromise.js-based name extraction.
- Create `DetectedEntity` records for likely names.
- Filter obvious false positives where simple to do so.

Deliverable:

- Names appear in the right entity panel.

Acceptance checks:

- Detects `John Smith`.
- Detects `Alice Wong`.
- Handles apostrophes and hyphenated names reasonably.
- False positives do not crash the app.

---

### Step 9 — Calculate Highlight Coordinates

Tasks:

- For each detected entity, map it back to a PDF text item or text span.
- Use pdf.js transform and viewport data to calculate bounding boxes.
- Convert PDF/page coordinates to CSS overlay coordinates.
- Account for page scale.

Important:

- This is one of the hardest parts of the project.
- Start with approximate text-item-level highlights if exact word-level highlights are too complex.
- It is better to have stable approximate highlights than broken precise highlights.

Deliverable:

- Entity records include usable `bbox` values.

Acceptance checks:

- Highlight appears close to the detected text.
- Highlight stays aligned at the current zoom/scale.
- y-axis is correctly flipped.

---

### Step 10 — Render Highlight Overlays

Tasks:

- Add an absolutely positioned overlay layer on top of each rendered PDF page.
- Render one highlight rectangle per visible entity.
- Use yellow for dates and blue for names.
- Add selected-state styling.

Deliverable:

- Highlights appear over the PDF page.

Acceptance checks:

- Date highlight uses yellow.
- Name highlight uses blue.
- Selected highlight is visually stronger.
- Overlay does not block basic scrolling.

---

### Step 11 — Connect Entity Panel to Viewer

Tasks:

- Render detected dates and names in right panel sections.
- Add expand/collapse toggles.
- Add click handlers for entity rows.
- On click:
  - Select entity.
  - Scroll to the entity page.
  - Emphasize selected highlight.

Deliverable:

- End-to-end interaction works from entity list to PDF highlight.

Acceptance checks:

- Clicking a date row jumps to the page and highlights the date.
- Clicking a name row jumps to the page and highlights the name.
- Selected row is visually distinct.
- Multiple selected highlights work if implemented.

---

### Step 12 — Polish UX and Error Handling

Tasks:

- Add loading indicators.
- Add empty state when no entities are found.
- Add clear selection button.
- Add basic zoom controls if feasible.
- Add helpful error messages.
- Improve visual hierarchy and spacing.

Deliverable:

- App feels polished enough for demo.

Acceptance checks:

- No obvious console errors during normal use.
- App handles scanned PDFs gracefully.
- UI remains usable on a laptop screen.
- User can understand what has been detected and where.

---

### Step 13 — README and Documentation

Create a strong `README.md` because assessment includes problem decomposition and architecture decisions.

README must include:

- Project overview.
- Setup instructions.
- How to run locally.
- Libraries used.
- Architecture/component explanation.
- Entity extraction approach.
- Date regex examples.
- Name detection heuristic or NLP explanation.
- Coordinate/highlight approach.
- Known limitations.
- Screenshot or screen recording of the app running on a real PDF.
- AI tools used and how they were used.

Suggested README sections:

```md
# PDF Redaction Assistant

## Overview
## Features
## Tech Stack
## Setup Instructions
## How It Works
### PDF Rendering
### Text Extraction
### Date Detection
### Name Detection
### Highlight Coordinate Mapping
## Project Structure
## Known Limitations
## Screenshots / Demo
## AI Tools Used
## Future Improvements
```

---

## 8. Testing Checklist

Test with at least one real multi-page PDF.

### Upload and Rendering

- [ ] App starts with `npm install` and `npm run dev`.
- [ ] User can upload a PDF.
- [ ] Uploaded file name appears.
- [ ] Page count appears.
- [ ] Multi-page PDF renders correctly.
- [ ] Uploading a second PDF resets the first one.

### Thumbnails

- [ ] One thumbnail appears per page.
- [ ] Clicking a thumbnail jumps to the correct page.
- [ ] Current page thumbnail is highlighted.

### Date Detection

- [ ] Detects `12/01/2024`.
- [ ] Detects `12-01-2024`.
- [ ] Detects `03-Feb-2024`.
- [ ] Detects `January 12, 2024`.
- [ ] Detects `12 January 2024`.
- [ ] Detects `2024-01-12`.

### Name Detection

- [ ] Detects `John Smith`.
- [ ] Detects `Alice Wong`.
- [ ] Handles names with apostrophes.
- [ ] Handles hyphenated names if possible.
- [ ] False positives do not crash the app.

### Highlight Behaviour

- [ ] Date highlights are yellow.
- [ ] Name highlights are blue.
- [ ] Clicking entity row scrolls to correct page.
- [ ] Selected entity highlight is visually emphasized.
- [ ] Highlight position is close to the matching text.
- [ ] Highlights remain aligned after scroll.

### Entity Panel

- [ ] Dates and names are grouped separately.
- [ ] Sections expand/collapse.
- [ ] Entity rows show text and page number.
- [ ] Selected row is visually distinct.
- [ ] Empty state appears when no entities are detected.

### Robustness

- [ ] Scanned/image-only PDFs do not crash the app.
- [ ] Invalid files show an error.
- [ ] Large PDFs remain reasonably usable.
- [ ] No backend or external API is required.

---

## 9. Stretch Goals

Only attempt stretch goals after the core app is stable.

Optional features:

1. **Redaction mode**
   - User clicks a highlight to black it out.
   - User can download a redacted PDF.

2. **Search**
   - User enters arbitrary text.
   - App highlights all occurrences across the document.

3. **Entity count badges**
   - Show total number of dates and names beside section headers.

4. **Keyboard navigation**
   - Arrow keys move between detected entities.

Recommended priority:

1. Entity count badges.
2. Search.
3. Keyboard navigation.
4. Redaction and download.

Do not attempt redaction download until the viewer, extraction, and highlight overlay are stable.

---

## 10. Assessment Alignment

The project will be assessed in four areas.

### 10.1 Code Quality & Structure — 30%

To score well:

- Use clear component boundaries.
- Use meaningful names.
- Keep extraction logic separate from UI code.
- Handle loading and errors.
- Commit often with meaningful messages.
- Avoid large unstructured files.

### 10.2 UI / UX Design — 30%

To score well:

- Make the three-panel layout immediately clear.
- Make thumbnails useful.
- Make selected entities obvious.
- Use consistent highlight colours.
- Add empty/loading/error states.
- Keep the interface polished but not overcomplicated.

### 10.3 Problem Decomposition — 25%

To score well:

- Explain architecture in README.
- Explain the state model.
- Explain entity extraction trade-offs.
- Explain coordinate mapping.
- Document known limitations honestly.

### 10.4 Functionality & Correctness — 15%

To score well:

- PDF upload works.
- PDF renders correctly.
- Dates and names are detected.
- Entity list connects to viewer.
- Highlights appear in the correct location or close enough to be useful.

---

## 11. Recommended Build Strategy

Build in this order:

1. Static three-panel UI.
2. PDF upload.
3. PDF rendering.
4. Thumbnails and page navigation.
5. Text extraction.
6. Date detection.
7. Name detection.
8. Entity panel.
9. Highlight overlay.
10. Click entity to scroll and highlight.
11. UX polish.
12. README and screenshot.

Do not start with redaction download. The core scoring depends more on a clean, working reviewer interface than on advanced optional features.

---

## 12. Suggested Commit Plan

Use meaningful commits such as:

```txt
init vite react project
add three panel application layout
implement pdf upload and loading state
render pdf pages with pdfjs
add page thumbnails and navigation
extract pdf text content by page
add date entity detection
add name entity detection heuristic
render entity panel with selectable rows
add highlight overlay coordinate mapping
connect entity selection to viewer scroll
polish styling and empty states
write readme with approach and limitations
```

---

## 13. Known Risks and Practical Solutions

### Risk 1 — Highlight coordinates are hard to align

Practical solution:

- First implement text-item-level bounding boxes.
- Then improve to word-level if time allows.
- Document approximation in README if needed.

### Risk 2 — Name detection creates false positives

Practical solution:

- Use simple filters for common headings and month names.
- Keep false positives visible but harmless.
- Explain limitations clearly.

### Risk 3 — Scanned PDFs have no text layer

Practical solution:

- Show a message: `No selectable text found. This PDF may be scanned or image-based.`
- Do not attempt OCR unless there is extra time.

### Risk 4 — Overbuilding optional features

Practical solution:

- Finish core requirements first.
- Add only small stretch goals after end-to-end flow works.

---

## 14. Definition of Done

The project is complete when:

- A user can upload a real multi-page PDF.
- The PDF renders in the centre viewer.
- Page thumbnails appear on the left.
- Dates and names appear in the right panel.
- Clicking an entity jumps to the correct page.
- The selected entity is highlighted on the PDF.
- Dates and names use different highlight colours.
- The UI clearly follows the three-panel layout.
- The README explains setup, extraction approach, limitations, and includes a screenshot or demo.
- The app runs locally with no backend and no external API calls.
