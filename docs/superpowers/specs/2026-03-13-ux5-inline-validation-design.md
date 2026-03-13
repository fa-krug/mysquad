# UX5: Inline Form Validation & Helpful Defaults

## Overview

Add client-side validation to forms with inline error messages, and set smarter defaults when creating new items. Reduces friction in daily data entry workflows.

## Problem

- No client-side validation anywhere — errors only surface as backend Rust errors (or don't surface at all)
- Creating a new team member produces a blank entry with no guidance
- Date fields accept any text with no format validation
- Salary amounts have no bounds checking
- Required fields aren't marked as required
- New items get no helpful defaults (empty names, no dates)

## Design

### Validation rules

**Team Members:**
| Field | Rule | Error message |
|-------|------|---------------|
| first_name | Required, non-empty after trim | "First name is required" |
| email | Valid email format if provided | "Invalid email address" |
| personal_email | Valid email format if provided | "Invalid email address" |
| start_date | Valid date format (YYYY-MM-DD) if provided | "Invalid date" |

**Projects:**
| Field | Rule | Error message |
|-------|------|---------------|
| name | Required, non-empty after trim | "Project name is required" |
| start_date | Valid date format | "Invalid date" |
| end_date | Valid date format, >= start_date if both set | "End date must be after start date" |

**Titles:**
| Field | Rule | Error message |
|-------|------|---------------|
| name | Required, non-empty after trim | "Title name is required" |

**Salary Parts:**
| Field | Rule | Error message |
|-------|------|---------------|
| amount | Numeric, >= 0 | "Amount must be a positive number" |
| frequency | Numeric, > 0 | "Frequency must be at least 1" |

**Salary Ranges:**
| Field | Rule | Error message |
|-------|------|---------------|
| min_salary | Numeric, >= 0 | "Must be a positive number" |
| max_salary | Numeric, >= min_salary | "Max must be >= min" |

**Children:**
| Field | Rule | Error message |
|-------|------|---------------|
| name | Required, non-empty after trim | "Name is required" |
| date_of_birth | Valid date format if provided | "Invalid date" |

### Validation display

Inline error text below the input field:
- Red text (`text-destructive`), small size (`text-xs`)
- Appears when the field loses focus (blur) with invalid content
- Clears when the user starts editing again
- Input border turns red (`border-destructive`) when invalid

### Validation hook

Create `src/hooks/useFieldValidation.ts`:

```typescript
type ValidationRule = (value: string | null) => string | null; // returns error message or null

function useFieldValidation(rules: Record<string, ValidationRule[]>) {
  // Returns:
  // - validate(field, value) → string | null
  // - errors: Record<string, string | null>
  // - clearError(field)
  // - validateAll(values) → boolean (true if all valid)
}
```

### Integration with useAutoSave

Validation runs **before** auto-save triggers. If a field is invalid:
- The error message displays
- The save is **not** blocked — the value still saves to the database (the backend is the source of truth, and partial data is better than lost data)
- The validation is advisory, not blocking

This is important: MySquad auto-saves continuously. Blocking saves on validation would mean a user who types a partial email loses their work. Instead, validation is visual guidance that helps users notice issues.

### Smarter defaults for new items

When creating new items, pre-populate useful defaults:

| Item | Default |
|------|---------|
| Team Member | first_name: "", last_name: "" (focus cursor on first_name input) |
| Project | name: "", start_date: today's date |
| Report | name: "Report — {today's date}" |
| Salary Data Point | name: "{month} {year}" (e.g., "March 2026") |
| Salary Part | name: "Base", frequency: 12 |

Most of these defaults come from the Rust backend (`DEFAULT` clauses in SQL). The frontend changes are:
- Auto-focus the name/first-name field when a new item is created
- For salary data point: set the name to current month/year on the frontend before saving

### Required field indicators

Add a small red asterisk (`*`) next to labels of required fields. This is a visual-only change — no new components needed, just adding `<span className="text-destructive">*</span>` to label text.

Required fields: team member first_name, project name, title name, child name, salary part amount.

## Files affected

- `src/hooks/useFieldValidation.ts` — new file
- `src/components/team/MemberDetail.tsx` — add validation to form fields, auto-focus on new
- `src/components/projects/ProjectDetail.tsx` — add validation, date range check
- `src/pages/Titles.tsx` — add validation to title name
- `src/pages/SalaryPlanner.tsx` — add validation to salary parts/ranges
- `src/components/team/ChildrenList.tsx` — add validation to child name/date
- `src/lib/db.ts` — update `createSalaryDataPoint` to pass default name (or handle in Rust)
