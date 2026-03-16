# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MySquad is a **Tauri v2 desktop app** for team management — tracking team members, titles, salaries, and 1:1 topics. It uses macOS biometric auth (Touch ID) and an encrypted SQLite database (SQLCipher) with encryption keys stored in the macOS Keychain.

## Commands

### Development
- `npm run tauri dev` — run the full app (starts Vite dev server + Tauri native shell)
- `npm run dev` — run only the frontend (Vite on port 1420)
- `npm run build` — TypeScript check + Vite production build (frontend only)

### Rust backend
- `cd src-tauri && cargo build` — build the Rust backend
- `cd src-tauri && cargo test` — run Rust tests
- `cd src-tauri && cargo test test_name` — run a single Rust test

### UI components
- `npx shadcn@latest add <component>` — add a shadcn/ui component (style: base-nova, icons: lucide)

## Architecture

### Two-process model (Tauri)
- **Frontend** (`src/`): React 19 + TypeScript + Vite. Communicates with the backend exclusively via `invoke()` from `@tauri-apps/api/core`.
- **Backend** (`src-tauri/src/`): Rust. All data access goes through Tauri commands defined in `commands.rs`, registered in `lib.rs`.

### Frontend structure
- `src/lib/db.ts` — all `invoke()` calls in one place; the only file that talks to Rust
- `src/lib/types.ts` — shared TypeScript interfaces (TeamMember, Child, CheckableItem, Title)
- `src/lib/salary-pdf.ts` — client-side PDF generation for salary data points
- `src/pages/` — route-level page components (TeamMembers, Titles, SalaryPlanner, Projects, Reports, TeamMeetings, Meeting, Settings)
- `src/components/team/` — team member detail UI (MemberDetail, MemberList, CheckableList, ChildrenList)
- `src/components/salary/` — salary planner charts and forms
- `src/components/projects/` — project management UI
- `src/components/reports/` — report views
- `src/components/layout/` — app shell (AppLayout, Sidebar, LockScreen)
- `src/components/ui/` — shadcn/ui primitives
- `src/hooks/` — useAutoSave (debounced save with flush registry), useAutoLock, useTheme

### Rust backend structure
- `commands.rs` — Tauri command handlers (all `#[tauri::command]`)
- `db.rs` — SQLite connection management, SQLCipher setup, migrations
- `keychain.rs` — macOS Keychain integration for encryption key storage
- `biometric.rs` — Touch ID / biometric authentication via Security.framework
- `migrations/` — SQL migration files, versioned via `PRAGMA user_version`

### Key patterns
- **Lock/unlock flow**: App starts locked → biometric auth → derive key from Keychain → open encrypted DB → `AppDb.conn` Mutex holds the active connection → lock nulls it out
- **Auto-save**: `useAutoSave` hook maintains a global `flushRegistry` Set; on lock, all pending saves are flushed before closing the DB
- **Path alias**: `@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`)
- **Tauri invoke params**: When calling Rust commands, parameter names must be snake_case to match Rust struct fields (see `db.ts` for examples)
- **Tailwind CSS v4**: Using `@tailwindcss/vite` plugin (no `tailwind.config.js` — configuration is in `src/index.css`)
- **Split view pattern**: Team Members, Titles, and Salary Planner all use the same split layout:
  - List panel: `w-64 shrink-0 border-r`, header `h-12` with title + add button, `ScrollArea` body
  - Selection: `bg-muted` selected, `hover:bg-muted/50` hover
  - Detail panel: `flex-1 overflow-auto` wrapper, `max-w-2xl p-6 space-y-6` content
  - Empty state: centered `text-muted-foreground` message
  - Top-level delete: soft-delete into trash view with restore and permanent-delete (permanent delete uses `AlertDialog`); sub-item delete: immediate
  - Settings is the only single-page view (`max-w-lg p-6`)
- **Soft-delete / trash**: Team members, titles, and salary data points use soft-delete (`deleted_at` column). Each list page has a trash toggle showing trashed items with restore and permanent-delete actions. Backend read queries filter out soft-deleted rows by default; separate `get_trashed_*` commands return only trashed items.
- **Scenario groups**: All scenarios within a group share identical member attributes (active, promoted, promoted title). These are stored in `scenario_group_members` (the single source of truth) and edited via the "Edit Scenario Group" modal. The backend command `update_scenario_group_member` updates the group table and propagates to all child `salary_data_point_members` rows. `get_salary_data_point` reads member attributes from `scenario_group_members` via COALESCE for scenario children. Individual scenarios only differ in salary parts — they have no separate edit modal for member attributes.
