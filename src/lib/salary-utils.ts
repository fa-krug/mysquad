import type { SalaryPart, SalaryRange, SalaryDataPointMember } from "./types";

/** Calculate annual total for a set of salary parts (in cents) */
export function annualTotal(parts: SalaryPart[]): number {
  return parts.reduce((sum, p) => sum + p.amount * p.frequency, 0);
}

/** Calculate variable portion of annual total (in cents) */
export function variableTotal(parts: SalaryPart[]): number {
  return parts.filter((p) => p.is_variable).reduce((sum, p) => sum + p.amount * p.frequency, 0);
}

/** Variable percentage (0-100) */
export function variablePercent(parts: SalaryPart[]): number {
  const total = annualTotal(parts);
  if (total === 0) return 0;
  return (variableTotal(parts) / total) * 100;
}

/** Format cents as dollar string */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

/** Format percentage with sign */
export function formatDeltaPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

/** Determine range fit color class */
export type RangeFit = "red" | "yellow" | "green" | "none";

export function rangeFitColor(total: number, range: SalaryRange | undefined): RangeFit {
  if (!range) return "none";
  const { min_salary, max_salary } = range;
  if (total < min_salary) return "red";
  if (total > max_salary) return "red";
  const span = max_salary - min_salary;
  const lowThreshold = min_salary + span * 0.1;
  const highThreshold = max_salary - span * 0.1;
  if (total < lowThreshold || total > highThreshold) return "yellow";
  return "green";
}

/** Get the salary range for a member based on their title */
export function getRangeForMember(member: SalaryDataPointMember, ranges: SalaryRange[]): SalaryRange | undefined {
  if (!member.title_id) return undefined;
  return ranges.find((r) => r.title_id === member.title_id);
}

/** Calculate budget totals (excluding promoted members) */
export function budgetTotals(members: SalaryDataPointMember[]) {
  const activeNonPromoted = members.filter((m) => m.is_active && !m.is_promoted);
  const total = activeNonPromoted.reduce((sum, m) => sum + annualTotal(m.parts), 0);
  const headcount = activeNonPromoted.length;
  return { total, headcount };
}

/** Calculate delta between current and previous salary parts */
export function salaryDelta(currentParts: SalaryPart[], previousParts: SalaryPart[] | null) {
  const current = annualTotal(currentParts);
  if (!previousParts) return { current, previous: null, absoluteDelta: null, percentDelta: null };
  const previous = annualTotal(previousParts);
  const absoluteDelta = current - previous;
  const percentDelta = previous === 0 ? (current > 0 ? 100 : 0) : (absoluteDelta / previous) * 100;
  return { current, previous, absoluteDelta, percentDelta };
}
