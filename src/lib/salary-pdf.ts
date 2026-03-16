import type { SalaryDataPointDetail, SalaryDataPointMember, SalaryPart } from "./types";
import {
  annualTotal,
  budgetTotals,
  formatCents,
  getRangeForMember,
  rangeFitColor,
  salaryDelta,
  formatDeltaPercent,
  variableTotal,
} from "./salary-utils";

// Colors
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];
const GRAY: [number, number, number] = [120, 120, 120];
const LIGHT_GRAY: [number, number, number] = [160, 160, 160];
const BLACK: [number, number, number] = [0, 0, 0];

const BLUE: [number, number, number] = [59, 130, 246];
const LIGHT_BLUE: [number, number, number] = [147, 197, 253];
const YELLOW: [number, number, number] = [202, 138, 4];
const SLATE: [number, number, number] = [148, 163, 184];

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

// Chart layout
const CHART_LABEL_W = 38; // mm for member name labels
const CHART_BAR_H = 6; // mm per bar
const CHART_BAR_GAP = 2; // mm between bars
const CHART_SECTION_TITLE_H = 10;

import type { jsPDF as JsPDF } from "jspdf";

function formatEurK(cents: number): string {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `€${(euros / 1000).toFixed(0)}k`;
  return `€${euros.toFixed(0)}`;
}

function activeMembers(detail: SalaryDataPointDetail): SalaryDataPointMember[] {
  return detail.members
    .filter((m) => m.is_active)
    .sort(
      (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    );
}

function chartHeight(memberCount: number): number {
  return CHART_SECTION_TITLE_H + memberCount * (CHART_BAR_H + CHART_BAR_GAP) + 4;
}

function ensureSpace(doc: JsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - BOTTOM_MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/** Draw a section title with a subtle line underneath */
function drawSectionTitle(doc: JsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text(title, MARGIN, y);
  y += 2;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 5;
  return y;
}

/** 1. Budget Gauge — horizontal progress bar */
function drawBudgetGauge(doc: JsPDF, detail: SalaryDataPointDetail, y: number): number {
  const { total } = budgetTotals(detail.members);
  if (detail.budget == null) return y;

  const gaugeH = 22;
  y = ensureSpace(doc, y, gaugeH);
  y = drawSectionTitle(doc, "Budget", y);

  const budget = detail.budget;
  const usage = budget > 0 ? Math.min(total / budget, 1) : 0;
  const isOver = total > budget;
  const barColor: [number, number, number] = isOver ? RED : GREEN;

  // Background bar
  const barH = 4;
  doc.setFillColor(230, 230, 230);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, barH, 2, 2, "F");

  // Fill bar
  const fillW = Math.max(usage * CONTENT_WIDTH, 0);
  if (fillW > 0) {
    doc.setFillColor(...barColor);
    doc.roundedRect(MARGIN, y, fillW, barH, 2, 2, "F");
  }

  y += barH + 4;

  // Labels below: total | budget | delta
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BLACK);
  doc.text(formatCents(total), MARGIN, y);

  doc.setTextColor(...GRAY);
  doc.text(formatCents(budget), MARGIN + CONTENT_WIDTH / 2, y, { align: "center" });

  const diff = total - budget;
  const diffPct = budget !== 0 ? (diff / budget) * 100 : 0;
  doc.setTextColor(...(isOver ? RED : GREEN));
  const diffStr = `${diff >= 0 ? "+" : ""}${formatCents(diff)} (${formatDeltaPercent(diffPct)})`;
  doc.text(diffStr, MARGIN + CONTENT_WIDTH, y, { align: "right" });

  return y + 8;
}

/** 2. Salary Bar Chart — horizontal bars per member with range brackets */
function drawSalaryBarChart(doc: JsPDF, detail: SalaryDataPointDetail, y: number): number {
  const members = activeMembers(detail);
  if (members.length === 0) return y;

  const height = chartHeight(members.length);
  y = ensureSpace(doc, y, height);
  y = drawSectionTitle(doc, "Salary Overview", y);

  // Find max value for scale
  let maxVal = 0;
  for (const m of members) {
    const t = annualTotal(m.parts);
    const range = getRangeForMember(m, detail.ranges);
    maxVal = Math.max(maxVal, t, range?.max_salary ?? 0);
  }
  if (maxVal === 0) return y;

  const barAreaW = CONTENT_WIDTH - CHART_LABEL_W;
  const scale = barAreaW / maxVal;
  const barX = MARGIN + CHART_LABEL_W;

  for (const m of members) {
    const t = annualTotal(m.parts);
    const range = getRangeForMember(m, detail.ranges);
    const fit = rangeFitColor(t, range);

    // Member name label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    const label = `${m.last_name}, ${m.first_name.charAt(0)}.`;
    doc.text(label, MARGIN, y + CHART_BAR_H * 0.7, { maxWidth: CHART_LABEL_W - 2 });

    // Range bracket (semi-transparent background)
    if (range) {
      const rangeX = barX + range.min_salary * scale;
      const rangeW = (range.max_salary - range.min_salary) * scale;
      doc.setFillColor(200, 200, 200);
      doc.rect(rangeX, y, rangeW, CHART_BAR_H, "F");
    }

    // Salary bar
    const barW = t * scale;
    const barCol = fitToColor(fit);
    doc.setFillColor(...barCol);
    if (barW > 0) {
      doc.roundedRect(barX, y + 0.5, barW, CHART_BAR_H - 1, 1.5, 1.5, "F");
    }

    // Value label at end of bar
    doc.setFontSize(6);
    doc.setTextColor(...GRAY);
    doc.text(formatEurK(t), barX + barW + 2, y + CHART_BAR_H * 0.7);

    y += CHART_BAR_H + CHART_BAR_GAP;
  }

  return y + 4;
}

function fitToColor(fit: string): [number, number, number] {
  switch (fit) {
    case "green":
      return GREEN;
    case "yellow":
      return YELLOW;
    case "red":
      return RED;
    default:
      return SLATE;
  }
}

/** 3. Variable Pay Chart — fixed vs variable stacked bars */
function drawVariablePayChart(doc: JsPDF, detail: SalaryDataPointDetail, y: number): number {
  const members = activeMembers(detail);
  if (members.length === 0) return y;

  // Only show if at least one member has variable pay
  const hasVariable = members.some((m) => variableTotal(m.parts) > 0);
  if (!hasVariable) return y;

  const height = chartHeight(members.length);
  y = ensureSpace(doc, y, height);
  y = drawSectionTitle(doc, "Variable Pay Breakdown", y);

  let maxVal = 0;
  for (const m of members) {
    maxVal = Math.max(maxVal, annualTotal(m.parts));
  }
  if (maxVal === 0) return y;

  const barAreaW = CONTENT_WIDTH - CHART_LABEL_W - 14; // 14mm for % label
  const scale = barAreaW / maxVal;
  const barX = MARGIN + CHART_LABEL_W;

  for (const m of members) {
    const t = annualTotal(m.parts);
    const v = variableTotal(m.parts);
    const f = t - v;
    const varPct = t > 0 ? ((v / t) * 100).toFixed(1) : "0.0";

    // Member name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    const label = `${m.last_name}, ${m.first_name.charAt(0)}.`;
    doc.text(label, MARGIN, y + CHART_BAR_H * 0.7, { maxWidth: CHART_LABEL_W - 2 });

    // Fixed portion
    const fixedW = f * scale;
    if (fixedW > 0) {
      doc.setFillColor(...BLUE);
      doc.rect(barX, y + 0.5, fixedW, CHART_BAR_H - 1, "F");
    }

    // Variable portion
    const varW = v * scale;
    if (varW > 0) {
      doc.setFillColor(...LIGHT_BLUE);
      doc.rect(barX + fixedW, y + 0.5, varW, CHART_BAR_H - 1, "F");
    }

    // Round the combined bar ends
    if (t > 0) {
      const totalW = fixedW + varW;
      doc.setFillColor(...(v > 0 ? LIGHT_BLUE : BLUE));
      doc.roundedRect(barX, y + 0.5, totalW, CHART_BAR_H - 1, 1.5, 1.5, "F");
      // Redraw fixed portion to keep left side clean
      if (fixedW > 0 && varW > 0) {
        doc.setFillColor(...BLUE);
        doc.rect(barX, y + 0.5, fixedW, CHART_BAR_H - 1, "F");
        // Re-round just the left side
        doc.setFillColor(...BLUE);
        doc.roundedRect(barX, y + 0.5, Math.min(fixedW, 3), CHART_BAR_H - 1, 1.5, 1.5, "F");
      }
    }

    // Percentage label
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(`${varPct}%`, barX + barAreaW + 3, y + CHART_BAR_H * 0.7);

    y += CHART_BAR_H + CHART_BAR_GAP;
  }

  // Legend
  y += 2;
  doc.setFontSize(6);
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, y - 2, 3, 3, "F");
  doc.setTextColor(...GRAY);
  doc.text("Fixed", MARGIN + 4, y);
  doc.setFillColor(...LIGHT_BLUE);
  doc.rect(MARGIN + 18, y - 2, 3, 3, "F");
  doc.text("Variable", MARGIN + 23, y);

  return y + 6;
}

/** 4. Comparison Chart — current vs previous salary */
function drawComparisonChart(
  doc: JsPDF,
  detail: SalaryDataPointDetail,
  previousData: Record<number, SalaryPart[] | null>,
  y: number,
): number {
  const members = activeMembers(detail);
  if (members.length === 0) return y;

  // Only show if at least one member has previous data
  const hasPrevious = members.some((m) => previousData[m.member_id] != null);
  if (!hasPrevious) return y;

  const barGroupH = CHART_BAR_H * 2 + 1; // two bars + gap
  const height = CHART_SECTION_TITLE_H + members.length * (barGroupH + CHART_BAR_GAP) + 4;
  y = ensureSpace(doc, y, height);
  y = drawSectionTitle(doc, "Current vs Previous", y);

  let maxVal = 0;
  for (const m of members) {
    const curr = annualTotal(m.parts);
    const prev = previousData[m.member_id];
    const prevTotal = prev ? annualTotal(prev) : 0;
    maxVal = Math.max(maxVal, curr, prevTotal);
  }
  if (maxVal === 0) return y;

  const deltaLabelW = 30; // mm reserved for delta text
  const barAreaW = CONTENT_WIDTH - CHART_LABEL_W - deltaLabelW;
  const scale = barAreaW / maxVal;
  const barX = MARGIN + CHART_LABEL_W;

  for (const m of members) {
    const curr = annualTotal(m.parts);
    const prev = previousData[m.member_id];
    const prevTotal = prev ? annualTotal(prev) : 0;

    // Member name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    const label = `${m.last_name}, ${m.first_name.charAt(0)}.`;
    doc.text(label, MARGIN, y + barGroupH * 0.4, { maxWidth: CHART_LABEL_W - 2 });

    // Previous bar (gray)
    if (prev) {
      const prevW = prevTotal * scale;
      if (prevW > 0) {
        doc.setFillColor(...SLATE);
        doc.roundedRect(barX, y, prevW, CHART_BAR_H - 0.5, 1.5, 1.5, "F");
      }
    }

    // Current bar (blue)
    const currW = curr * scale;
    if (currW > 0) {
      doc.setFillColor(...BLUE);
      doc.roundedRect(barX, y + CHART_BAR_H, currW, CHART_BAR_H - 0.5, 1.5, 1.5, "F");
    }

    // Delta label
    doc.setFontSize(7);
    const deltaX = barX + barAreaW + 3;
    if (!prev) {
      doc.setTextColor(...GRAY);
      doc.text("New", deltaX, y + barGroupH * 0.5);
    } else {
      const delta = curr - prevTotal;
      const pct = prevTotal > 0 ? (delta / prevTotal) * 100 : 0;
      const color: [number, number, number] = delta > 0 ? GREEN : delta < 0 ? RED : GRAY;
      doc.setTextColor(...color);
      const sign = delta >= 0 ? "+" : "";
      doc.text(
        `${sign}${formatEurK(delta)} (${formatDeltaPercent(pct)})`,
        deltaX,
        y + barGroupH * 0.5,
      );
    }

    y += barGroupH + CHART_BAR_GAP;
  }

  // Legend
  y += 2;
  doc.setFontSize(6);
  doc.setFillColor(...SLATE);
  doc.rect(MARGIN, y - 2, 3, 3, "F");
  doc.setTextColor(...GRAY);
  doc.text("Previous", MARGIN + 4, y);
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN + 22, y - 2, 3, 3, "F");
  doc.text("Current", MARGIN + 27, y);

  return y + 6;
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
    metrics.push(
      `Delta: ${delta >= 0 ? "+" : ""}${formatCents(delta)} (${formatDeltaPercent(pct)})`,
    );
  }
  metrics.push(`Headcount: ${headcount}`);
  if (previousTotal != null) {
    const delta = total - previousTotal;
    const pct = previousTotal !== 0 ? (delta / previousTotal) * 100 : 0;
    metrics.push(
      `vs Previous: ${delta >= 0 ? "+" : ""}${formatCents(delta)} (${formatDeltaPercent(pct)})`,
    );
  }

  // Draw as a light background bar
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(MARGIN, y - 4, CONTENT_WIDTH, 10, 2, 2, "F");

  doc.setTextColor(...BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  // Space metrics evenly, shrink separator if text is too wide
  let sep = "    ";
  let metricText = metrics.join(sep);
  if (doc.getTextWidth(metricText) > CONTENT_WIDTH - 8) {
    sep = "  ";
    metricText = metrics.join(sep);
  }
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

  // --- Charts ---
  // Start charts on a new page for clean separation
  doc.addPage();
  let chartY = MARGIN;

  chartY = drawBudgetGauge(doc, detail, chartY);
  chartY = drawSalaryBarChart(doc, detail, chartY);
  chartY = drawVariablePayChart(doc, detail, chartY);
  drawComparisonChart(doc, detail, previousData, chartY);

  doc.save(`${detail.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
