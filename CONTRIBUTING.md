# Contributing to MySquad

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) (stable)
- [Tauri v2 CLI](https://v2.tauri.app/start/prerequisites/) — installed via `npm` as a dev dependency
- macOS (required for Keychain and Touch ID integration)
- Xcode Command Line Tools (`xcode-select --install`)

## Getting Started

```bash
# Clone the repo
git clone <repo-url> && cd mysquad

# Install frontend dependencies
npm install

# Run the full app (Vite dev server + Tauri native shell)
npm run tauri dev
```

`npm run tauri dev` starts both the Vite frontend on port 1420 and the Rust backend with hot-reload.

To work on the frontend only (no Rust/Tauri shell):

```bash
npm run dev
```

## Project Structure

```
src/                        # Frontend (React 19 + TypeScript + Vite)
  lib/db.ts                 # All invoke() calls — only file that talks to Rust
  lib/types.ts              # Shared TypeScript interfaces
  pages/                    # Route-level components
  components/
    team/                   # Team member detail UI
    salary/                 # Salary planner charts and forms
    titles/                 # Title management UI
    layout/                 # App shell, sidebar, lock screen
    ui/                     # shadcn/ui primitives
  hooks/                    # useAutoSave, useAutoLock, useTheme

src-tauri/                  # Backend (Rust)
  src/
    commands.rs             # Tauri command handlers
    db.rs                   # SQLite/SQLCipher connection + migrations
    keychain.rs             # macOS Keychain integration
    biometric.rs            # Touch ID via Security.framework
  migrations/               # SQL migration files (versioned by PRAGMA user_version)
```

## Architecture

MySquad uses Tauri's two-process model:

- **Frontend** communicates with the backend exclusively through `invoke()` from `@tauri-apps/api/core`. All invoke calls live in `src/lib/db.ts`.
- **Backend** exposes Tauri commands in `commands.rs`, registered in `lib.rs`. All data access goes through these commands.

### Key Patterns

- **Lock/unlock flow**: App starts locked. Touch ID authenticates, the encryption key is read from the Keychain, and the database is opened. The connection is held in `AppDb.conn` (a Mutex). Locking nulls it out.
- **Auto-save**: The `useAutoSave` hook debounces saves and registers a flush callback. Before locking, all pending saves are flushed.
- **Invoke parameters**: Parameter names in `invoke()` calls must be `snake_case` to match Rust struct fields.
- **Path alias**: `@/` maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`).

## Commands

```bash
# Development
npm run tauri dev            # Full app with hot-reload
npm run dev                  # Frontend only (Vite on port 1420)

# Build
npm run build                # TypeScript check + Vite production build (frontend)
npm run tauri:build          # Production bundle (.dmg) with icon injection

# Rust backend
cd src-tauri && cargo build  # Build Rust backend
cd src-tauri && cargo test   # Run all Rust tests
cd src-tauri && cargo test test_name  # Run a single test

# Code quality
npm run lint                 # ESLint
npm run lint:fix             # ESLint with auto-fix
npm run format               # Prettier format
npm run format:check         # Check formatting without writing
```

## Adding UI Components

The project uses [shadcn/ui](https://ui.shadcn.com/) with the `base-nova` style and `lucide` icons:

```bash
npx shadcn@latest add <component>
```

## CSS

Tailwind CSS v4 is used via `@tailwindcss/vite`. There is no `tailwind.config.js` — configuration lives in `src/index.css`.

## UI Layout Conventions

Team Members, Titles, and Salary Planner all follow the same split-view pattern:

- **List panel**: `w-64 shrink-0 border-r`, header `h-12` with title and add button, `ScrollArea` body
- **Selection**: `bg-muted` for selected item, `hover:bg-muted/50` for hover
- **Detail panel**: `flex-1 overflow-auto` wrapper, `max-w-2xl p-6 space-y-6` content
- **Empty state**: centered `text-muted-foreground` message
- **Delete behavior**: Top-level items use `AlertDialog` confirmation; sub-items delete immediately

Settings is the only single-page view (`max-w-lg p-6`).

## Database Migrations

SQL migrations are in `src-tauri/migrations/` and versioned via `PRAGMA user_version`. To add a migration, create a new numbered `.sql` file and update the migration logic in `db.rs`.

## Pre-commit Hooks

The project uses [Husky](https://typicode.github.io/husky/) with [lint-staged](https://github.com/lint-staged/lint-staged) to run ESLint and Prettier on staged files before each commit.

## Building a Release

```bash
npm run release
```

This builds the production `.dmg`, then creates a GitLab release with the artifact.
