# MySquad

A macOS desktop app for managing your team — track team members, job titles, salaries, and 1:1 meeting topics. Your data is encrypted locally with SQLCipher and protected by Touch ID.

## Requirements

- macOS with Touch ID (or Apple Watch unlock)
- No account or internet connection needed — everything stays on your Mac

## Installation

1. Download the latest `.dmg` from the [Releases](../../releases) page
2. Open the `.dmg` and drag **MySquad** to your Applications folder
3. Launch MySquad — you'll authenticate with Touch ID on first launch

On first run, MySquad creates an encrypted database and stores the encryption key in your macOS Keychain.

## Features

### Team Members

Add and manage your team members with contact details, job titles, start dates, and notes. Upload profile pictures for quick identification. Changes save automatically as you type.

### Children

Track each team member's children (name and date of birth) — useful for benefits, payroll, or simply remembering important family details.

### 1:1 Meeting Tools

Each team member has two checkable lists:

- **Status Items** — track action items or ongoing status updates
- **Talk Topics** — build up your agenda for the next 1:1

Check items off as you work through them.

### Job Titles

Create and manage job titles, then assign them to team members. MySquad prevents you from deleting a title that's still in use.

### Salary Planner

Create salary data points (snapshots) to plan and compare compensation over time:

- Break each member's salary into parts (base, bonus, stock, etc.) with per-year frequency
- Set salary ranges per title and see at a glance who's in range
- View charts: budget gauge, salary bar chart, variable pay breakdown, and year-over-year comparison
- Mark members as promoted or inactive within a data point
- Download a PDF summary of any data point for sharing or printing

### Trash & Restore

Deleted team members, titles, and salary data points are soft-deleted and moved to a trash view. You can restore them or permanently delete them from each page's trash toggle.

### Settings

- **Theme**: Light, Dark, or match your system setting
- **Auto-lock**: Choose how quickly MySquad locks when idle (immediately, 1 minute, 5 minutes, or never)

## Security

- All data is stored in an encrypted SQLite database (SQLCipher, AES-256)
- The encryption key is stored in your macOS Keychain
- Touch ID is required to unlock the app
- The app auto-locks after your configured idle timeout
- No data leaves your machine
