  Milestone 1: Scaffold React/Vite App

  1. Goal: Replace the current stub with a runnable browser app using React + Vite.
  2. Files likely to change: package.json, index.html, src/main.tsx, src/App.tsx, src/styles.css.
  3. Test: Run npm install, then npm run dev; confirm the app opens locally.
  4. Final interview: Explain why the app is frontend-only and why React + Vite fits the “no backend” requirement.

  Milestone 2: Build Static Three-Panel Layout

  1. Goal: Create the left thumbnails panel, center PDF viewer area, and right entity panel with empty states.
  2. Files likely to change: src/App.tsx, src/components/Layout.tsx, src/components/FileUpload.tsx, src/components/ThumbnailPanel.tsx, src/components/PdfViewer.tsx,
     src/components/EntityPanel.tsx, src/styles.css.

  3. Test: Open the app before uploading a PDF; verify the three panels are clear and usable on a laptop screen.
  4. Final interview: Explain the UI decomposition and how each panel maps to the assignment requirements.

  Milestone 3: Add PDF Upload and Loading

  1. Goal: Let users upload any PDF at runtime, load it with pdfjs-dist, and store file/page metadata.
  2. Files likely to change: package.json, src/App.tsx, src/components/FileUpload.tsx, src/lib/pdfLoader.ts, src/types/pdf.ts.
  3. Test: Upload a valid PDF, see filename and page count; upload an invalid file and confirm a friendly error.
  4. Final interview: Explain how browser File/ArrayBuffer loading works and why no backend is needed.

  Milestone 4: Render PDF Pages

  1. Goal: Render all PDF pages in the center viewer using canvases.
  2. Files likely to change: src/components/PdfViewer.tsx, src/components/PdfPage.tsx, src/components/Toolbar.tsx, src/lib/pdfLoader.ts, src/styles.css.
  3. Test: Upload a multi-page PDF; confirm pages render in order, are readable, and the viewer scrolls.
  4. Final interview: Explain pdf.js page rendering, viewport scale, canvas sizing, and basic loading/error handling.

  Milestone 5: Add Thumbnails and Page Navigation

  1. Goal: Render one thumbnail per page, allow clicking thumbnails to jump to pages, and track the active page.
  2. Files likely to change: src/components/ThumbnailPanel.tsx, src/components/PdfViewer.tsx, src/components/PdfPage.tsx, src/App.tsx, src/styles.css.
  3. Test: Click Page 2 thumbnail and verify the center viewer jumps there; scroll manually and confirm active thumbnail updates.
  4. Final interview: Explain how page refs or IntersectionObserver connect scrolling with current-page state.

  Milestone 6: Extract Text and Detect Entities

  1. Goal: Extract page text with pdf.js and detect dates plus likely person names.
  2. Files likely to change: src/lib/extractEntities.ts, src/lib/datePatterns.ts, src/lib/namePatterns.ts, src/lib/entityUtils.ts, src/types/entity.ts, src/App.tsx.
  3. Test: Use a PDF containing 12/01/2024, 03-Feb-2024, January 12, 2024, 2024-01-12, John Smith, and Alice Wong; confirm entities appear in app state or debug
     output.

  4. Final interview: Explain the date regex patterns, name heuristic, false positives, and scanned-PDF limitation.

  Milestone 7: Build Entity Panel Interaction

  1. Goal: Show grouped Show Dates and Show Names sections with counts, expand/collapse behavior, selectable rows, and search/filter if time allows.
  2. Files likely to change: src/components/EntityPanel.tsx, src/components/EntitySection.tsx, src/components/EntityRow.tsx, src/App.tsx, src/styles.css.
  3. Test: Verify dates and names are grouped separately, rows show text/type/page, sections collapse, and selected rows are visually distinct.
  4. Final interview: Explain the normalized entity model and how shared app state coordinates the right panel with the viewer.

  Milestone 8: Highlight Coordinates, Selection Flow, Polish, README

  1. Goal: Convert PDF text coordinates to CSS overlay boxes, render yellow date highlights and blue name highlights, connect entity clicks to scroll/highlight, then
     document the project.

  2. Files likely to change: src/lib/coordinateUtils.ts, src/components/HighlightOverlay.tsx, src/components/PdfPage.tsx, src/components/PdfViewer.tsx, src/components/
     Toolbar.tsx, src/App.tsx, src/styles.css, README.md.

  3. Test: Click an entity row; verify the viewer scrolls to the correct page, the matching highlight is close to the text, selected highlights are emphasized, and
     scanned PDFs do not crash. Run the full checklist from requirements.md.

  4. Final interview: Explain y-axis flipping, viewport scaling, why highlight boxes may be approximate, known limitations, and what you would improve next.