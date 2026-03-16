# Salary Data Point PDF Export

## Overview

Add a "Download PDF" button to the salary data point detail header that generates a compact, well-formatted PDF summarizing the data point — members, their salary parts, budget, and comparison to previous period.

## Trigger

A new button in the sticky header bar of `SalaryPlanner.tsx` (alongside the existing template upload/export buttons). Uses the `Download` icon from lucide-react. Visible when not in presentation mode.

## PDF Content & Layout

### 1. Header Block
- Data point name (large, bold)
- Export date (small, muted)
- Horizontal rule separator

### 2. Budget Summary Bar
Single compact row with key metrics:
- **Budget** — formatted from `detail.budget`
- **Total Cost** — sum of active non-promoted member annual totals
- **Delta** — cost vs budget (amount + percentage), color-coded green/red
- **Headcount** — active non-promoted member count
- **vs Previous** — delta vs previous data point total (amount + percentage), if previous exists

### 3. Member Cards
One card per member, sorted active-first (matching UI sort). Each card:

**Header row:**
- Left: Full name + title (promoted title if promoted)
- Badges: "promoted" (blue) / "inactive" (gray) when applicable
- Right: Annual total (bold)

**Parts table:**
- Columns: Part name | Amount | Frequency | Annual (amount × frequency)
- Compact rows, light header

**Footer:**
- Previous period delta: "+€X,XXX (+Y.Y%)" if previous data exists

**Styling:**
- Inactive members shown with reduced opacity
- Auto page-breaks: avoid splitting a card across pages

## Technical Approach

- **Library:** jsPDF (already installed, lazy-imported pattern in `ReportDetail.tsx`)
- **Location:** New utility function `generateSalaryPdf()` in `src/lib/salary-pdf.ts`
- **Data:** Receives `SalaryDataPointDetail`, `previousData` record, `budgetTotals` from existing state — no new backend calls needed
- **Currency formatting:** Reuse existing `formatMoney` patterns from the codebase
- **Page setup:** A4, portrait orientation

## Button Placement

In `SalaryPlanner.tsx`, add to the header button group (line ~548-582):
- Appears alongside template upload/export buttons
- Only visible when `!anyPresented` (not in presentation mode)
- Always available (not gated on template upload like docx export)

```tsx
<Button variant="outline" size="sm" onClick={handleDownloadPdf}>
  <Download className="h-4 w-4 mr-1" />
  Download PDF
</Button>
```

## Files to Create/Modify

1. **Create** `src/lib/salary-pdf.ts` — PDF generation logic
2. **Modify** `src/pages/SalaryPlanner.tsx` — add download button + handler

## Out of Scope

- Scenario comparison table in PDF
- Variable pay breakdown
- Range fit indicators
- Charts/visualizations
- Rust backend changes
