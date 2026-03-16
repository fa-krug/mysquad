# Salary Data Point PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download PDF" button to the salary data point detail view that generates a compact PDF with header, budget summary, and member salary cards.

**Architecture:** Single new file `src/lib/salary-pdf.ts` contains all PDF generation logic using jsPDF (already installed). One button + handler added to `src/pages/SalaryPlanner.tsx`. Reuses existing `formatCents`, `budgetTotals`, `annualTotal`, `salaryDelta`, `formatDeltaPercent` from `src/lib/salary-utils.ts`.

**Tech Stack:** jsPDF (lazy-imported), React, TypeScript

---

## Chunk 1: PDF Generation + Button

### Task 1: Create `src/lib/salary-pdf.ts` — PDF generation function

**Files:**
- Create: `src/lib/salary-pdf.ts`

**Reference:** Spec at `docs/superpowers/specs/2026-03-16-salary-pdf-export-design.md`. Existing jsPDF pattern at `src/components/reports/ReportDetail.tsx:14-38`.

- [ ] **Step 1: Create `src/lib/salary-pdf.ts` with the full implementation**

```ts
import type { SalaryDataPointDetail, SalaryPart } from "./types";
import { annualTotal, budgetTotals, formatCents, salaryDelta, formatDeltaPercent } from "./salary-utils";

// Colors
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];
const GRAY: [number, number, number] = [120, 120, 120];
const LIGHT_GRAY: [number, number, number] = [160, 160, 160];
const BLACK: [number, number, number] = [0, 0, 0];

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PAGE_HEIGHT = 297;
const BOTTOM_MARGIN = 20;

// Card dimensions
const CARD_HEADER_H = 8;
const CARD_TABLE_HEADER_H = 6;
const CARD_ROW_H = 5;
const CARD_FOOTER_H = 6;
const CARD_PADDING = 6; // top + bottom padding
const CARD_GAP = 6;

function cardHeight(partsCount: number, hasPrevious: boolean): number {
  return (
    CARD_PADDING +
    CARD_HEADER_H +
    CARD_TABLE_HEADER_H +
    CARD_ROW_H * Math.max(partsCount, 1) +
    (hasPrevious ? CARD_FOOTER_H : 0) +
    CARD_PADDING
  );
}

export async function generateSalaryPdf(
  detail: SalaryDataPointDetail,
  previousData: Record<number, SalaryPart[] | null>,
  previousTotal: number | null,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLACK);
  doc.text(detail.name, MARGIN, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(new Date().toLocaleDateString("de-DE"), MARGIN, y);
  y += 4;

  doc.setDrawColor(30);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 8;

  // --- Budget Summary Bar ---
  const { total, headcount } = budgetTotals(detail.members);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const metrics: string[] = [];
  if (detail.budget != null) {
    metrics.push(`Budget: ${formatCents(detail.budget)}`);
  }
  metrics.push(`Total Cost: ${formatCents(total)}`);
  if (detail.budget != null) {
    const delta = total - detail.budget;
    const pct = detail.budget !== 0 ? (delta / detail.budget) * 100 : 0;
    metrics.push(`Delta: ${delta >= 0 ? "+" : ""}${formatCents(delta)} (${formatDeltaPercent(pct)})`);
  }
  metrics.push(`Headcount: ${headcount}`);
  if (previousTotal != null) {
    const delta = total - previousTotal;
    const pct = previousTotal !== 0 ? (delta / previousTotal) * 100 : 0;
    metrics.push(`vs Previous: ${delta >= 0 ? "+" : ""}${formatCents(delta)} (${formatDeltaPercent(pct)})`);
  }

  // Draw as a light background bar
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(MARGIN, y - 4, CONTENT_WIDTH, 10, 2, 2, "F");

  doc.setTextColor(...BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  // Space metrics evenly
  const metricText = metrics.join("    ");
  doc.text(metricText, MARGIN + 4, y + 2);

  y += 14;

  // --- Member Cards ---
  const sorted = detail.members
    .slice()
    .sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1));

  for (const member of sorted) {
    const prev = previousData[member.member_id] ?? null;
    const delta = salaryDelta(member.parts, prev);
    const hasPrevious = delta.absoluteDelta != null;
    const height = cardHeight(member.parts.length, hasPrevious);

    // Page break if card won't fit
    if (y + height > PAGE_HEIGHT - BOTTOM_MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    const cardTop = y;
    const isInactive = !member.is_active;
    const textColor: [number, number, number] = isInactive ? LIGHT_GRAY : BLACK;
    const subColor: [number, number, number] = isInactive ? LIGHT_GRAY : GRAY;

    // Card border
    doc.setDrawColor(isInactive ? 200 : 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, cardTop, CONTENT_WIDTH, height, 2, 2, "S");

    y = cardTop + CARD_PADDING / 2 + 4;

    // -- Card header: name + title (left), annual total (right) --
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const fullName = `${member.first_name} ${member.last_name}`;
    doc.text(fullName, MARGIN + 4, y);

    const nameWidth = doc.getTextWidth(fullName);
    let badgeX = MARGIN + 4 + nameWidth + 3;

    // Title
    const titleName = member.promoted_title_name ?? member.title_name;
    if (titleName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...subColor);
      doc.text(titleName, badgeX, y);
      badgeX += doc.getTextWidth(titleName) + 3;
    }

    // Badges
    doc.setFontSize(7);
    if (member.is_promoted) {
      doc.setTextColor(30, 64, 175);
      doc.text("promoted", badgeX, y);
      badgeX += doc.getTextWidth("promoted") + 3;
    }
    if (!member.is_active) {
      doc.setTextColor(107, 114, 128);
      doc.text("inactive", badgeX, y);
    }

    // Annual total (right-aligned)
    const memberTotal = annualTotal(member.parts);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const totalStr = formatCents(memberTotal);
    const totalWidth = doc.getTextWidth(totalStr);
    doc.text(totalStr, MARGIN + CONTENT_WIDTH - 4 - totalWidth, y);

    y += CARD_HEADER_H;

    // -- Parts table header --
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...subColor);
    const col1 = MARGIN + 4;
    const col2 = MARGIN + CONTENT_WIDTH * 0.5;
    const col3 = MARGIN + CONTENT_WIDTH * 0.7;
    const col4 = MARGIN + CONTENT_WIDTH - 4;

    doc.text("Part", col1, y);
    doc.text("Amount", col2, y, { align: "right" });
    doc.text("Freq", col3, y, { align: "right" });
    doc.text("Annual", col4, y, { align: "right" });
    y += 2;
    doc.setDrawColor(isInactive ? 220 : 200);
    doc.setLineWidth(0.2);
    doc.line(col1, y, MARGIN + CONTENT_WIDTH - 4, y);
    y += CARD_TABLE_HEADER_H - 2;

    // -- Parts rows --
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    if (member.parts.length === 0) {
      doc.setTextColor(...subColor);
      doc.text("No salary parts", col1, y);
      y += CARD_ROW_H;
    } else {
      for (const part of member.parts) {
        doc.setTextColor(...textColor);
        doc.text(part.name ?? "—", col1, y);
        doc.text(formatCents(part.amount), col2, y, { align: "right" });
        doc.text(`${part.frequency}×`, col3, y, { align: "right" });
        doc.text(formatCents(part.amount * part.frequency), col4, y, { align: "right" });
        y += CARD_ROW_H;
      }
    }

    // -- Previous delta footer --
    if (hasPrevious && delta.absoluteDelta != null && delta.percentDelta != null) {
      y += 1;
      const deltaColor: [number, number, number] = delta.absoluteDelta >= 0 ? GREEN : RED;
      doc.setTextColor(...(isInactive ? LIGHT_GRAY : deltaColor));
      doc.setFontSize(7);
      const sign = delta.absoluteDelta >= 0 ? "+" : "";
      doc.text(
        `vs previous: ${sign}${formatCents(delta.absoluteDelta)} (${formatDeltaPercent(delta.percentDelta)})`,
        col1,
        y,
      );
    }

    y = cardTop + height + CARD_GAP;
  }

  doc.save(`${detail.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/salary-pdf.ts
git commit -m "feat: add salary data point PDF generation"
```

---

### Task 2: Add Download PDF button to `SalaryPlanner.tsx`

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Add `Download` to the lucide-react import**

In `src/pages/SalaryPlanner.tsx`, change line 36:

```ts
// Before:
import { EyeOff, Upload, FileDown, Trash2, FileText } from "lucide-react";
// After:
import { EyeOff, Upload, FileDown, Trash2, FileText, Download } from "lucide-react";
```

- [ ] **Step 2: Add the `handleDownloadPdf` callback**

After the `handleExportAllDocx` callback (around line 424), add:

```ts
const handleDownloadPdf = useCallback(async () => {
  if (!detail) return;
  try {
    const { generateSalaryPdf } = await import("@/lib/salary-pdf");
    await generateSalaryPdf(detail, previousData, previousTotal);
    showSuccess("PDF exported");
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}, [detail, previousData, previousTotal]);
```

This lazy-imports the PDF module (same pattern as `SalaryAnalytics` and `ReportDetail.tsx`).

- [ ] **Step 3: Add the Download PDF button to the header**

In the header button group (around line 548), add the button just before the template upload/export section, inside the `!anyPresented` block. The button should appear before the template-related buttons:

```tsx
{!anyPresented && (
  <>
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadPdf}
      title="Download data point as PDF"
    >
      <Download className="h-4 w-4 mr-1" />
      Download PDF
    </Button>
    {detail.template_path ? (
      // ... existing template buttons ...
    ) : (
      // ... existing upload template button ...
    )}
  </>
)}
```

The full replacement for the `{!anyPresented && ...}` block (lines 549-582) becomes:

```tsx
{!anyPresented && (
  <>
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownloadPdf}
      title="Download data point as PDF"
    >
      <Download className="h-4 w-4 mr-1" />
      Download PDF
    </Button>
    {detail.template_path ? (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAllDocx}
          title="Export salary overview for all members"
        >
          <FileDown className="h-4 w-4 mr-1" />
          Export All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeleteTemplate}
          title="Remove template"
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Template
        </Button>
      </>
    ) : (
      <Button
        variant="outline"
        size="sm"
        onClick={handleUploadTemplate}
        title="Upload a .docx template for salary overviews"
      >
        <Upload className="h-4 w-4 mr-1" />
        Upload Template
      </Button>
    )}
  </>
)}
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 5: Manual test**

Run: `npm run tauri dev`

1. Open the Salary Planner page
2. Select a data point with members and salary parts
3. Click "Download PDF"
4. Verify the PDF downloads with correct name, header, budget bar, and member cards
5. Verify page breaks work if there are many members
6. Test with a data point that has a previous data point (check delta line)
7. Test with inactive and promoted members (check badges and dimming)

- [ ] **Step 6: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: add Download PDF button to salary planner"
```
