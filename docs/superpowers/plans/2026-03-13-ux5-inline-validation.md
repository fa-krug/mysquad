# UX5: Inline Validation & Helpful Defaults — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side form validation with inline error display and smarter defaults when creating new items.

**Architecture:** A shared `useFieldValidation` hook provides reusable validation logic (validate on blur, clear on focus). Each form component integrates the hook, adds `aria-invalid` + error text below fields, and marks required fields with red asterisks. Validation is advisory — saves are never blocked.

**Tech Stack:** React hooks, existing shadcn/ui Input/Textarea (already support `aria-invalid` styling), TypeScript.

---

## Chunk 1: Validation Hook & Helpers

### Task 1: Create useFieldValidation hook

**Files:**
- Create: `src/hooks/useFieldValidation.ts`

- [ ] **Step 1: Create the validation hook**

```typescript
import { useState, useCallback, useRef } from "react";

export type ValidationRule = (value: string | null) => string | null;

// Common validation rules
export const required = (msg: string): ValidationRule => (value) =>
  !value || !value.trim() ? msg : null;

export const validEmail: ValidationRule = (value) =>
  value && value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? "Invalid email address"
    : null;

export const validDate: ValidationRule = (value) =>
  value && value.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? "Invalid date"
    : null;

export const numericMin = (min: number, msg: string): ValidationRule => (value) => {
  if (value === null || value === "") return null;
  const n = parseFloat(value);
  return isNaN(n) || n < min ? msg : null;
};

export const dateNotBefore = (
  getMinDate: () => string | null,
  msg: string,
): ValidationRule => (value) => {
  if (value === null || value === "") return null;
  const minDate = getMinDate();
  if (minDate === null || minDate === "") return null;
  return value < minDate ? msg : null;
};

export function useFieldValidation(rules: Record<string, ValidationRule[]>) {
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const validate = useCallback(
    (field: string, value: string | null): string | null => {
      const fieldRules = rulesRef.current[field];
      if (!fieldRules) return null;
      for (const rule of fieldRules) {
        const error = rule(value);
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
          return error;
        }
      }
      setErrors((prev) => ({ ...prev, [field]: null }));
      return null;
    },
    [],
  );

  const clearError = useCallback((field: string) => {
    setErrors((prev) => ({ ...prev, [field]: null }));
  }, []);

  const validateAll = useCallback(
    (values: Record<string, string | null>): boolean => {
      let allValid = true;
      for (const [field, value] of Object.entries(values)) {
        const error = validate(field, value);
        if (error) allValid = false;
      }
      return allValid;
    },
    [validate],
  );

  return { errors, validate, clearError, validateAll };
}
```

Note: `rulesRef` avoids stale closure issues when rules are declared inline in the component body. The `validate`/`clearError`/`validateAll` callbacks have stable references across renders.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useFieldValidation.ts
git commit -m "feat(ux5): add useFieldValidation hook with common validation rules"
```

### Task 2: Create FieldError helper component

**Files:**
- Create: `src/components/ui/field-error.tsx`

- [ ] **Step 1: Create the inline error display component**

```typescript
interface FieldErrorProps {
  error: string | null | undefined;
}

export function FieldError({ error }: FieldErrorProps) {
  if (!error) return null;
  return <p className="text-xs text-destructive mt-1">{error}</p>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/field-error.tsx
git commit -m "feat(ux5): add FieldError inline error display component"
```

### Task 3: Create RequiredMark helper component

**Files:**
- Create: `src/components/ui/required-mark.tsx`

- [ ] **Step 1: Create the required field asterisk component**

```typescript
export function RequiredMark() {
  return <span className="text-destructive ml-0.5">*</span>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/required-mark.tsx
git commit -m "feat(ux5): add RequiredMark asterisk component"
```

---

## Chunk 2: Team Member Validation

### Task 4: Add validation to InfoSection (team member fields)

**Files:**
- Modify: `src/components/team/InfoSection.tsx`
- Modify: `src/components/team/MemberDetail.tsx`
- Modify: `src/pages/TeamMembers.tsx`

**Context:** `MemberDetail` delegates all form fields to `InfoSection`, which uses a local `AutoSaveInput` sub-component. The `AutoSaveInput` at line 24 renders a `<Label>`, an `<Input>` (or `<textarea>`), and a saving/saved/error status line. Team member fields: first_name, last_name, email, personal_email, start_date, etc. are rendered via `<AutoSaveInput>` calls at lines 90–194. Validation needs to be wired into `AutoSaveInput`.

- [ ] **Step 1: Extend AutoSaveInput to accept validation props**

In `InfoSection.tsx`, modify the `AutoSaveInputProps` interface and component:

```typescript
interface AutoSaveInputProps {
  label: string;
  initialValue: string | null;
  onSave: (value: string | null) => Promise<void>;
  type?: string;
  multiline?: boolean;
  className?: string;
  // New validation props:
  validationRules?: ValidationRule[];
  required?: boolean;
  autoFocus?: boolean;
}
```

Import `useFieldValidation`, `ValidationRule`, `FieldError`, `RequiredMark` at the top.

Inside `AutoSaveInput`, add validation:
```typescript
const { errors, validate, clearError } = useFieldValidation(
  validationRules ? { field: validationRules } : {},
);

const handleBlur = () => {
  if (validationRules) validate("field", value);
};

const handleFocus = () => {
  clearError("field");
};
```

Update the `<Input>` (line 51) to include:
```typescript
<Input
  type={type}
  value={value}
  onChange={handleChange}
  onBlur={handleBlur}
  onFocus={handleFocus}
  aria-invalid={!!errors.field}
  autoFocus={autoFocus}
/>
```

Similarly update the `<textarea>` (line 46) with the same `onBlur`, `onFocus`, and `aria-invalid`.

Update the label (line 43) to include RequiredMark:
```typescript
<Label className="text-xs text-muted-foreground">
  {label}{required && <RequiredMark />}
</Label>
```

In the status line area (lines 53-57), add FieldError alongside existing status:
```typescript
<div className="h-3 text-xs">
  {errors.field ? (
    <FieldError error={errors.field} />
  ) : (
    <>
      {saving && <span className="text-muted-foreground">Saving…</span>}
      {saved && !saving && <span className="text-green-600">Saved</span>}
      {error && <span className="text-destructive truncate">{error}</span>}
    </>
  )}
</div>
```

- [ ] **Step 2: Wire validation rules to specific fields**

Update the `<AutoSaveInput>` calls in `InfoSection`:

```typescript
{/* First Name - line 90 */}
<AutoSaveInput
  key={`first_name-${member.id}`}
  label="First Name"
  initialValue={member.first_name}
  onSave={makeOnSave("first_name")}
  validationRules={[required("First name is required")]}
  required
  autoFocus={autoFocusFirstName}
/>

{/* Work Email - line 106 */}
<AutoSaveInput
  key={`email-${member.id}`}
  label="Work Email"
  initialValue={member.email}
  onSave={makeOnSave("email")}
  type="email"
  validationRules={[validEmail]}
/>

{/* Start Date - line 136 */}
<AutoSaveInput
  key={`start_date-${member.id}`}
  label="Start Date"
  initialValue={member.start_date}
  onSave={makeOnSave("start_date")}
  type="date"
  validationRules={[validDate]}
/>

{/* Personal Email - line 145 */}
<AutoSaveInput
  key={`personal_email-${member.id}`}
  label="Personal Email"
  initialValue={member.personal_email}
  onSave={makeOnSave("personal_email")}
  type="email"
  validationRules={[validEmail]}
/>
```

Other fields (last_name, personal_phone, address_*, notes) don't need validation rules.

- [ ] **Step 3: Thread auto-focus from TeamMembers → MemberDetail → InfoSection**

Add `autoFocusFirstName?: boolean` prop to `InfoSectionProps` and pass it through.

In `MemberDetail`, add `isNew?: boolean` prop and pass `autoFocusFirstName={isNew}` to `<InfoSection>`.

In `TeamMembers.tsx`:
- Add `const [newMemberId, setNewMemberId] = useState<number | null>(null);`
- In `handleCreate`, after creating: `setNewMemberId(member.id);`
- Pass `isNew={member.id === newMemberId}` to `<MemberDetail>`
- Clear it: add `useEffect(() => { if (newMemberId) setNewMemberId(null); }, [newMemberId]);`

- [ ] **Step 4: Commit**

```bash
git add src/components/team/InfoSection.tsx src/components/team/MemberDetail.tsx src/pages/TeamMembers.tsx
git commit -m "feat(ux5): add inline validation to team member fields"
```

### Task 5: Add validation to ChildrenList

**Files:**
- Modify: `src/components/team/ChildrenList.tsx`

**Context:** ChildrenList has a `ChildRow` sub-component (defined in the same file). Each ChildRow has `name` (text Input) and `date_of_birth` (date Input) with `useAutoSave`. The label "Name" appears on line ~35 and "Date of Birth" appears similarly.

- [ ] **Step 1: Add validation to ChildRow**

Import `useFieldValidation`, `required`, `validDate`, `FieldError`, `RequiredMark`.

In the `ChildRow` component, add:
```typescript
const { errors, validate, clearError } = useFieldValidation({
  name: [required("Name is required")],
  date_of_birth: [validDate],
});
```

Add `onBlur={() => validate("name", name)}`, `onFocus={() => clearError("name")}`, `aria-invalid={!!errors.name}` to the name Input.

Add `<FieldError error={errors.name} />` below the name Input.

Add `<RequiredMark />` next to the "Name" label text.

Same for date_of_birth: `onBlur`, `onFocus`, `aria-invalid`, `<FieldError>`.

- [ ] **Step 2: Commit**

```bash
git add src/components/team/ChildrenList.tsx
git commit -m "feat(ux5): add inline validation to children fields"
```

---

## Chunk 3: Project Validation

### Task 6: Add validation to ProjectDetail

**Files:**
- Modify: `src/components/projects/ProjectDetail.tsx`
- Modify: `src/pages/Projects.tsx`

**Context:** ProjectDetail (line 34) uses `useAutoSave` hooks for `name`, `end_date`, and `notes`. The `name` input is at line 111, `end_date` at line 127. `start_date` is displayed as read-only text (line 123: `<div className="text-sm text-muted-foreground py-2">{project.start_date}</div>`), so it does NOT need validation.

- [ ] **Step 1: Add validation for name and end_date**

Import `useFieldValidation`, `required`, `validDate`, `dateNotBefore`, `FieldError`, `RequiredMark`.

Add validation hook:
```typescript
const { errors, validate, clearError } = useFieldValidation({
  name: [required("Project name is required")],
  end_date: [
    validDate,
    dateNotBefore(() => project.start_date, "End date must be after start date"),
  ],
});
```

For the name Input (line 111):
```typescript
<Input
  id="project-name"
  value={name}
  onChange={handleNameChange}
  placeholder="Project name"
  onBlur={() => validate("name", name)}
  onFocus={() => clearError("name")}
  aria-invalid={!!errors.name}
  ref={nameRef}
/>
<FieldError error={errors.name} />
```

Update the Name label (line 110) to include `<RequiredMark />`.

For the end_date Input (line 127):
```typescript
<Input
  id="project-end-date"
  type="date"
  value={endDate}
  onChange={handleEndDateChange}
  onBlur={() => validate("end_date", endDate)}
  onFocus={() => clearError("end_date")}
  aria-invalid={!!errors.end_date}
/>
<FieldError error={errors.end_date} />
```

Note: `start_date` is read-only text — no validation needed.

- [ ] **Step 2: Add auto-focus for new projects**

Add `isNew?: boolean` prop to `ProjectDetailProps`.

```typescript
const nameRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  if (isNew) nameRef.current?.focus();
}, [isNew]);
```

Add `ref={nameRef}` to the name Input.

In `Projects.tsx`:
- Add `const [newProjectId, setNewProjectId] = useState<number | null>(null);`
- In `handleCreate`: `setNewProjectId(project.id);`
- Pass `isNew={project.id === newProjectId}` to `<ProjectDetail>`
- Clear: `useEffect(() => { if (newProjectId) setNewProjectId(null); }, [newProjectId]);`

- [ ] **Step 3: Add default start_date for new projects**

In Projects.tsx `handleCreate`, after `createProject()` returns, immediately update the start_date:
```typescript
const project = await createProject();
const today = new Date().toISOString().slice(0, 10);
await updateProject(project.id, "start_date", today);
project.start_date = today;
```

Import `updateProject` from `@/lib/db` if not already imported.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectDetail.tsx src/pages/Projects.tsx
git commit -m "feat(ux5): add inline validation and defaults to projects"
```

---

## Chunk 4: Title Validation

### Task 7: Add validation to TitleDetail

**Files:**
- Modify: `src/components/titles/TitleDetail.tsx`
- Modify: `src/pages/Titles.tsx`

**Context:** `TitleDetail` (not `Titles.tsx`) renders the title name input. It has a `nameRef` (line 17), an `<Input>` at line 49, a `useAutoSave` for name (line 22-28), and already supports `focusName` prop for auto-focus (lines 30-35). The label "Title Name" is at line 48.

- [ ] **Step 1: Add validation for title name**

Import `useFieldValidation`, `required`, `FieldError`, `RequiredMark`.

Add validation hook inside `TitleDetail`:
```typescript
const { errors, validate, clearError } = useFieldValidation({
  name: [required("Title name is required")],
});
```

Update the Input (line 49):
```typescript
<Input
  ref={nameRef}
  value={name}
  onChange={handleNameChange}
  onBlur={() => validate("name", name)}
  onFocus={() => clearError("name")}
  aria-invalid={!!errors.name}
/>
```

Update the label (line 48):
```typescript
<Label className="text-xs text-muted-foreground">Title Name<RequiredMark /></Label>
```

Update the status line (lines 50-54) to show validation error when present:
```typescript
<div className="h-3 text-xs">
  {errors.name ? (
    <FieldError error={errors.name} />
  ) : (
    <>
      {saving && <span className="text-muted-foreground">Saving…</span>}
      {saved && !saving && <span className="text-green-600">Saved</span>}
      {error && <span className="text-destructive truncate">{error}</span>}
    </>
  )}
</div>
```

- [ ] **Step 2: Auto-focus on new title**

`TitleDetail` already has `focusName` prop support (lines 30-35). In `Titles.tsx`, ensure that after `handleCreate` the new title is selected and `focusName` is set to true. Check the existing code — if `focusName` is already passed when creating, this step is a no-op.

In `Titles.tsx`, in `handleCreate` (line 58):
```typescript
const handleCreate = async () => {
  setCreating(true);
  try {
    const created = await createTitle("New Title");
    setTitles((prev) => [...prev, created]);
    setSelectedId(created.id);
    setFocusName(true); // ensure this triggers focus
  } finally {
    setCreating(false);
  }
};
```

Check if `focusName` state already exists in Titles.tsx and is passed to TitleDetail. If so, this is already working and only needs verification.

- [ ] **Step 3: Commit**

```bash
git add src/components/titles/TitleDetail.tsx src/pages/Titles.tsx
git commit -m "feat(ux5): add inline validation to title name"
```

---

## Chunk 5: Salary Validation & Defaults

### Task 8: Add validation to SalaryPartRow

**Files:**
- Modify: `src/components/salary/SalaryPartRow.tsx`

**Context:** SalaryPartRow (line 16) has inputs for `name` (line 48-56), `amount` (line 61-70), `frequency` (line 74-81). Each uses `useAutoSave`. The component renders inside `<tr>/<td>` table cells.

- [ ] **Step 1: Add validation and required mark for amount**

Import `useFieldValidation`, `numericMin`, `FieldError`, `RequiredMark`.

Add validation hook:
```typescript
const { errors, validate, clearError } = useFieldValidation({
  amount: [numericMin(0, "Amount must be a positive number")],
  frequency: [numericMin(1, "Frequency must be at least 1")],
});
```

For the amount Input (inside `<td>` at line 58):
```typescript
<td className="px-2 py-1">
  <div className="relative flex items-center">
    <span className="absolute left-2 text-xs text-muted-foreground">$</span>
    <Input
      type="number"
      min="0"
      value={amount}
      onChange={(e) => {
        setAmount(e.target.value);
        amountSave.save(e.target.value || null);
      }}
      onBlur={() => validate("amount", amount)}
      onFocus={() => clearError("amount")}
      aria-invalid={!!errors.amount}
      className="h-8 pl-5 text-sm w-28"
    />
  </div>
  <FieldError error={errors.amount} />
</td>
```

For the frequency Input (line 74):
```typescript
<td className="px-2 py-1">
  <Input
    type="number"
    min="1"
    value={frequency}
    onChange={(e) => {
      setFrequency(e.target.value);
      freqSave.save(e.target.value || null);
    }}
    onBlur={() => validate("frequency", frequency)}
    onFocus={() => clearError("frequency")}
    aria-invalid={!!errors.frequency}
    className="h-8 text-sm w-16"
  />
  <FieldError error={errors.frequency} />
</td>
```

For the table header, add `<RequiredMark />` next to "Amount" in the `<th>` (parent component `MemberSalaryCard.tsx` line 65):
```typescript
<th className="px-2 py-1 text-left font-medium">Amount<RequiredMark /></th>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/SalaryPartRow.tsx src/components/salary/MemberSalaryCard.tsx
git commit -m "feat(ux5): add inline validation to salary part fields"
```

### Task 9: Add validation to DataPointModal (salary ranges)

**Files:**
- Modify: `src/components/salary/DataPointModal.tsx`

**Context:** DataPointModal (line 31) has min/max salary range inputs per title rendered in a loop (lines 134-169). Inputs use local state (`ranges` at line 41) and are saved on "Save" button click (line 69 `handleSave`). These are NOT auto-saved.

- [ ] **Step 1: Add range validation**

Import `FieldError`.

Add range error state:
```typescript
const [rangeErrors, setRangeErrors] = useState<Record<number, { min?: string; max?: string }>>({});
```

At the top of `handleSave` (line 69), add validation:
```typescript
async function handleSave() {
  if (!detail) return;

  // Validate ranges (advisory — still save even if errors)
  const newErrors: Record<number, { min?: string; max?: string }> = {};
  for (const title of titles) {
    const r = ranges[title.id];
    if (!r) continue;
    const minVal = r.min === "" ? 0 : parseFloat(r.min);
    const maxVal = r.max === "" ? 0 : parseFloat(r.max);
    if (r.min !== "" && (isNaN(minVal) || minVal < 0)) {
      newErrors[title.id] = { ...newErrors[title.id], min: "Must be a positive number" };
    }
    if (r.max !== "" && (isNaN(maxVal) || maxVal < 0)) {
      newErrors[title.id] = { ...newErrors[title.id], max: "Must be a positive number" };
    }
    if (!isNaN(minVal) && !isNaN(maxVal) && maxVal > 0 && maxVal < minVal) {
      newErrors[title.id] = { ...newErrors[title.id], max: "Max must be >= min" };
    }
  }
  setRangeErrors(newErrors);

  // Continue with save (advisory validation, don't block)
  setSaving(true);
  // ... rest of existing handleSave
```

Add error display below each range Input (lines 137-168). After the min Input:
```typescript
<FieldError error={rangeErrors[title.id]?.min} />
```

After the max Input:
```typescript
<FieldError error={rangeErrors[title.id]?.max} />
```

Add `aria-invalid` to both:
```typescript
aria-invalid={!!rangeErrors[title.id]?.min}
// and
aria-invalid={!!rangeErrors[title.id]?.max}
```

Clear errors when modal opens (in the `useEffect` at line 47):
```typescript
setRangeErrors({});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/DataPointModal.tsx
git commit -m "feat(ux5): add inline validation to salary range fields"
```

### Task 10: Add default name for new salary data points

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

**Context:** `handleCreate` (line 125) calls `createSalaryDataPoint()`. The `updateSalaryDataPoint` import already exists (line 20, imported from `@/lib/db`).

- [ ] **Step 1: Set default name after creation**

In `handleCreate` (line 125-135), update to set the month/year name:
```typescript
async function handleCreate() {
  setCreating(true);
  try {
    const dp = await createSalaryDataPoint();
    const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    await updateSalaryDataPoint(dp.id, "name", monthYear);
    dp.name = monthYear;
    const dps = await loadDataPoints();
    setSelectedId(dp.id);
    showSuccess("Data point created");
  } finally {
    setCreating(false);
  }
}
```

Verify `updateSalaryDataPoint` is already imported. If not, add it to the import from `@/lib/db`.

- [ ] **Step 2: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat(ux5): set default name for new salary data points"
```

### Task 11: Add default values for new salary parts

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

**Context:** `handleAddPart` (line 170) calls `createSalaryPart(dataPointMemberId)` which creates a blank part. The spec wants new parts to default to `name: "Base"` and `frequency: 12`.

- [ ] **Step 1: Set defaults after part creation**

In `handleAddPart` (line 170):
```typescript
async function handleAddPart(dataPointMemberId: number) {
  const part = await createSalaryPart(dataPointMemberId);
  await Promise.all([
    updateSalaryPart(part.id, "name", "Base"),
    updateSalaryPart(part.id, "frequency", "12"),
  ]);
  if (selectedId) await loadDetailOnly(selectedId);
}
```

Import `updateSalaryPart` from `@/lib/db` if not already imported.

- [ ] **Step 2: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat(ux5): set default name and frequency for new salary parts"
```

---

## Chunk 6: Report Defaults

### Task 12: Add default name for new reports

**Files:**
- Modify: `src/pages/Reports.tsx`

**Context:** `handleCreate` (line 54) calls `createReport()`. The `updateReport` function is available in `@/lib/db` but may not be imported in Reports.tsx yet.

- [ ] **Step 1: Set default name and import updateReport**

Add `updateReport` to the import from `@/lib/db` in Reports.tsx.

In `handleCreate`:
```typescript
const handleCreate = async () => {
  setCreating(true);
  try {
    const created = await createReport();
    const today = new Date().toISOString().slice(0, 10);
    const defaultName = `Report — ${today}`;
    await updateReport(created.id, "name", defaultName);
    created.name = defaultName;
    setReports((prev) => [created, ...prev]);
    setSelectedId(created.id);
    showSuccess("Report created");
  } finally {
    setCreating(false);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Reports.tsx
git commit -m "feat(ux5): set default name for new reports"
```

---

## Chunk 7: Build Verification

### Task 13: Build check and cleanup

- [ ] **Step 1: Run TypeScript build check**

```bash
npm run build
```

Expected: No type errors.

- [ ] **Step 2: Fix any build errors, then commit**

If errors found, fix and commit:
```bash
git add -A
git commit -m "fix(ux5): resolve build errors"
```

- [ ] **Step 3: Verification checklist (manual or visual)**

Verify with `npm run dev`:
- Required field asterisks on: team member first_name, project name, title name, child name, salary part amount
- Blur on empty required field → red error text + red input border
- Focus on invalid field → error clears
- Email validation fires on blur with bad format (e.g., "abc")
- Date validation fires on blur with bad format (only relevant for ChildrenList date_of_birth since date inputs enforce format)
- Salary amount < 0 or non-numeric → error
- Salary frequency < 1 → error
- Salary range max < min → error in DataPointModal
- New team member → first_name auto-focused
- New project → name auto-focused, start_date = today
- New salary data point → name = "March 2026"
- New salary part → name = "Base", frequency = 12
- New report → name = "Report — 2026-03-13"
- Auto-save still works — validation errors are visual only, never block saves
