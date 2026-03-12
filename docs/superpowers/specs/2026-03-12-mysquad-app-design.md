# MySquad — App Design Spec

## Overview

MySquad is a macOS desktop application for managing a team, including personal info, titles, salary, status tracking, and 1:1 talk topics. It is a single-user local app with a possible future central backend server.

## Tech Stack

- **Tauri v2** — desktop shell, Rust backend
- **Vite + React + TypeScript** — frontend
- **shadcn/ui + Tailwind CSS** — UI components and styling
- **Lucide React** — icons
- **React Router** — client-side navigation
- **SQLCipher** — encrypted SQLite, accessed via custom Rust commands (tauri-plugin-sql does not natively support SQLCipher; the Rust backend opens the DB with `rusqlite` compiled with the `bundled-sqlcipher` feature and exposes query commands to the frontend)
- **macOS Keychain** — encryption key storage (via `security-framework` Rust crate)
- **macOS LocalAuthentication** — Touch ID biometric unlock (via `objc`/`core-foundation` crates). Falls back to system password on Macs without Touch ID hardware.

## Project Structure

```
mysquad/
├── src-tauri/
│   ├── src/
│   │   └── lib.rs              # Tauri setup, plugin registration, biometric/keychain commands
│   ├── migrations/             # SQL migration files
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Collapsible sidebar
│   │   │   ├── AppLayout.tsx   # Main layout wrapper
│   │   │   └── LockScreen.tsx  # Biometric unlock screen
│   │   └── ui/                 # shadcn/ui components
│   ├── pages/
│   │   ├── TeamMembers.tsx     # Split view: member list + detail
│   │   ├── Titles.tsx          # Title management
│   │   ├── SalaryPlanner.tsx   # Salary overview and editing
│   │   └── Settings.tsx        # Theme, auto-lock config
│   ├── lib/
│   │   ├── db.ts               # DB query helpers (invoke Tauri commands)
│   │   └── utils.ts            # shadcn/ui utility
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css               # Tailwind + theme CSS variables
├── package.json
└── tailwind.config.ts
```

## Security

### Database Encryption

- SQLite database encrypted via **SQLCipher**
- Encryption key: 256-bit key generated via a CSPRNG on first launch
- Key stored in the **macOS Keychain** (not on disk)
- Rust backend opens the DB with `PRAGMA key = '<key>'` on every unlock

### Biometric Unlock

- On app launch: prompt for Touch ID (or system password on Macs without Touch ID)
- On success: retrieve encryption key from Keychain, open encrypted DB
- On failure/cancel: app stays on lock screen, user can retry
- First launch: generate 256-bit encryption key, store in Keychain, create and encrypt DB

### Auto-Lock

- App locks automatically when:
  - macOS goes to sleep
  - Screen locks
  - App loses focus for a configurable duration
- On auto-lock: flush any pending auto-save writes before closing the DB connection
- On resume/refocus: biometric prompt appears automatically
- Lock screen: centered view with app name and "Unlock" button. Uses system theme preference (via `prefers-color-scheme`) since the DB is locked and stored theme preference is unavailable.

## Sidebar

- **Default state:** Open (~240px wide)
- **Collapsed state:** Icons only (~60px wide)
- **Toggle:** Chevron/menu button at the top
- **Animation:** Smooth transition on collapse/expand
- **Nav items (top to bottom):**
  - Team Members — `Users` icon
  - Titles — `BadgeCheck` icon
  - Salary Planner — `DollarSign` icon
  - *(spacer)*
  - Settings — `Settings` icon (pinned to bottom)
- **Active state:** Highlighted background on the current route's nav item

## Theming

- Light and dark themes via CSS variables (shadcn/ui approach)
- Detects system preference (`prefers-color-scheme`) on startup
- Manual override available in Settings (light / dark / system)
- Theme preference persisted to SQLite `settings` table
- Lock screen always uses system preference (DB not yet available)

## Pages

### Team Members (Default View)

Split layout within the content area:

**Left panel (~250px):**
- Scrollable list of all team members, sorted alphabetically by last name
- Each entry shows name + title
- Click to select, highlights active member
- Add button at the top: creates a new member with placeholder name ("New Member"), selects it in the right panel for immediate editing
- Delete via context menu or button on selected member (with confirmation dialog)

**Right panel (fills remaining space):**

1. **Info section** — editable fields, auto-save:
   - First name, last name
   - Work email
   - Title (dropdown from titles table; shows "No title" placeholder when unset)
   - Start date
   - Personal email
   - Personal phone
   - Address (street, city, zip)
   - Notes (multi-line text area)
   - Kids (list of name + date of birth, add/remove)

2. **Status items** — checkable list:
   - Free-text items added per team member
   - Sorted by: unchecked first (by creation date, oldest first), then checked (by creation date, newest first)
   - Unchecked: expanded, full text visible
   - Checked: collapsed, muted/strikethrough
   - Add button to create new items
   - Edit inline, delete via X button

3. **Talk topics** — checkable list (same behavior as status items):
   - Same sort order: unchecked first (oldest first), then checked (newest first)
   - Unchecked: expanded and prominent
   - Checked: collapsed/muted
   - Add button to create new topics
   - Edit inline, delete via X button

### Titles

- List of title names
- Add / edit / delete
- Shows count of team members using each title
- Deletion blocked if any team members are assigned to the title (show warning with count)

### Salary Planner

- Table view: team member name, title, current salary
- Editable salary field (auto-save), displayed as a formatted number input (no currency symbol — currency is implied and consistent). Stored as cents internally, displayed as whole units with optional decimals.
- Sorted alphabetically by last name
- Placeholder for future features (raise modeling, budget totals)

### Settings

- Theme toggle: light / dark / system
- Auto-lock timeout: immediately / 1 min / 5 min / never (on focus loss)

## Database Schema

Migrations are embedded in the Rust binary and run automatically on DB open (after successful biometric unlock). Schema version is tracked via SQLite's `user_version` pragma.

```sql
-- App settings (key-value)
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Titles lookup
CREATE TABLE titles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE team_members (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name     TEXT NOT NULL,
    last_name      TEXT NOT NULL,
    email          TEXT,
    personal_email TEXT,
    personal_phone TEXT,
    address_street TEXT,
    address_city   TEXT,
    address_zip    TEXT,
    title_id       INTEGER REFERENCES titles(id) ON DELETE RESTRICT,
    salary         INTEGER,  -- stored in cents to avoid floating-point rounding
    start_date     DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at on team_members
-- Note: PRAGMA recursive_triggers must remain OFF (SQLite default) to prevent recursion
CREATE TRIGGER team_members_updated_at
    AFTER UPDATE ON team_members
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE team_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Children of team members
CREATE TABLE children (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    date_of_birth  DATE
);

-- Status items per team member
CREATE TABLE status_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Talk topics per team member
CREATE TABLE talk_topics (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Auto-Save Behavior

- All editable fields auto-save on change (debounced, ~500ms after last keystroke)
- No explicit save buttons
- Visual feedback: subtle indicator (e.g., brief checkmark or "Saved" text) on successful save
- On save failure: show inline error message near the field, keep the unsaved value in the input so the user can retry or correct
- On auto-lock: flush all pending debounced saves before closing the DB

## Future Considerations (Not In Scope)

- Central backend server for multi-user access
- Raise modeling and budget planning in Salary Planner
- Export/import functionality
- Team member profile photos
