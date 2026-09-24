# 0005. Worksheets print from the browser; the preview is the printed page

Date: 2026-09-23

## Context
The legacy app built its PDF with PDFBox and its own line wrapping, which lost text. The owner requires that the
preview looks exactly like the printed PDF. Building the PDF in the browser with a library (pdf-lib) was considered
and dropped: it means our own wrapping and page breaks again, and a second layout to keep in step with the preview.

## Decision
`app/eye-test/Worksheet.tsx` measures the exercises off screen, packs them onto Letter or A4 sheets
(`lib/eye-test/paginate.ts`) and shows those sheets, scaled but never re-wrapped on small screens. Print uses the same
sheets, with `@page` set to the paper and exact colours; a PDF comes from the print dialog's "Save as PDF".

## Consequences
No PDF library and no Download button. Chrome, Safari and Firefox print the sheets as previewed, on Letter and A4,
with their print dialogs left at the defaults.
