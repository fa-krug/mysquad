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
- `src/pages/` — route-level page components (TeamMembers, Titles, SalaryPlanner, Settings)
- `src/components/team/` — team member detail UI (MemberDetail, MemberList, CheckableList, ChildrenList)
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
