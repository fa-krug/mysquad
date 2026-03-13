# P4: Lazy-Load Heavy Dependencies

## Overview

Code-split Recharts, jsPDF, and route pages using `React.lazy()` + Suspense so they only load when needed. Currently the entire app — all routes, all charting libraries, PDF generation — loads in a single bundle on startup.

## Problem

- **Recharts** (~300KB gzipped with d3 transitive deps) loads on app start even if the user never visits Salary Planner
- **jsPDF** (~200KB) loads on app start even if the user never generates a report
- All 6 route pages load upfront regardless of which one the user navigates to
- This increases initial load time and memory usage

## Design

### Route-level code splitting

In `App.tsx`, replace static imports with `React.lazy`:

All page components use named exports, so use the `.then()` wrapper pattern for `React.lazy`:

```tsx
const TeamMembers = lazy(() => import("@/pages/TeamMembers").then(m => ({ default: m.TeamMembers })));
const Titles = lazy(() => import("@/pages/Titles").then(m => ({ default: m.Titles })));
const SalaryPlanner = lazy(() => import("@/pages/SalaryPlanner").then(m => ({ default: m.SalaryPlanner })));
const Projects = lazy(() => import("@/pages/Projects").then(m => ({ default: m.Projects })));
const Reports = lazy(() => import("@/pages/Reports").then(m => ({ default: m.Reports })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.SettingsPage })));
```

Note: `Settings` exports as `SettingsPage`, not `Settings`.

Wrap the route outlet in a `<Suspense>` with a minimal fallback (the existing skeleton components from ux2 can be reused here).

### Component-level splitting for Recharts

The 4 chart components (`SalaryBarChart`, `VariablePayChart`, `ComparisonChart`, `BudgetGauge`) are only used inside `SalaryAnalytics.tsx`. Lazy-load `SalaryAnalytics` itself:

```tsx
// In SalaryPlanner.tsx — SalaryAnalytics also uses a named export
const SalaryAnalytics = lazy(() =>
  import("@/components/salary/SalaryAnalytics").then(m => ({ default: m.SalaryAnalytics }))
);
```

This pulls all of Recharts into the SalaryPlanner chunk automatically.

### Component-level splitting for jsPDF

jsPDF is only used in `ReportDetail.tsx` for PDF export via the standalone `generatePdf(detail)` function. Use dynamic `import()` at call time instead of the top-level `import { jsPDF } from "jspdf"`:

```tsx
// Modify generatePdf to accept jsPDF as a parameter, or make it async:
const handleExportPdf = async () => {
  const { jsPDF } = await import("jspdf");
  // Pass to existing generatePdf logic or inline it
  const doc = new jsPDF();
  // ... existing PDF generation from generatePdf()
};
```

This is simpler than lazy-loading the whole component since jsPDF is only needed on button click.

### Suspense fallback

Use the skeleton components (from ux2) as Suspense fallbacks:

```tsx
<Suspense fallback={<ListSkeleton />}>
  <Outlet />
</Suspense>
```

### Vite chunk strategy

Vite handles dynamic imports automatically — no config changes needed. Each `lazy()` call creates a separate chunk. Recharts and its d3 deps will be in the SalaryPlanner chunk.

## Impact

- **Effort**: ~30 minutes
- **Risk**: Low — Suspense is stable in React 19. Test that each route loads correctly.
- **Benefit**: Initial bundle shrinks by ~500KB+. App starts faster. Memory saved for unused features.
