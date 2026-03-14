# Lead System Design

## Overview

Add a lead/hierarchy system to MySquad. Any team member can be designated as another member's lead, forming a tree structure. The team member list displays members grouped under their lead with tree-style indentation, and a new org chart view visualizes the full hierarchy.

## Data Model

### Schema Change

One new migration adding a nullable `lead_id` foreign key to `team_members`:

```sql
ALTER TABLE team_members ADD COLUMN lead_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL DEFAULT NULL;
```

- `lead_id` is nullable — NULL means the member is a top-level root
- Self-reference prevention (`lead_id != id`) is enforced in the Rust backend, not via CHECK constraint (SQLite does not allow CHECK in `ALTER TABLE ADD COLUMN`)
- `ON DELETE SET NULL` — when a lead is deleted, their direct reports become root-level

### Cycle Detection

Handled in the Rust backend. When setting `lead_id` on a member, walk up the chain from the proposed lead to the root. If the member being edited appears anywhere in that chain, reject the update with an error. This prevents all cycles (direct and transitive).

### TypeScript Type Changes

`TeamMember` interface gains two fields:

- `lead_id: number | null` — the foreign key
- `lead_name: string | null` — computed by backend query via LEFT JOIN for display

### Rust Backend Changes

- `get_team_members` query: additional LEFT JOIN on `team_members` (aliased) to fetch the lead's name as `lead_name`
- `update_team_member` field allowlist: add `lead_id`
- `update_team_member` gains a conditional branch: when `field == "lead_id"`, run self-reference check (`lead_id != id`) and ancestor-walk cycle validation before executing the SQL update. This is the authoritative guard against all invalid lead assignments.
- `create_team_member` return value: include `lead_id: None` and `lead_name: None` in the returned struct

## Member Detail UI — Lead Assignment

A **"Lead" dropdown** added to InfoSection alongside existing fields (near Original Title).

- **Dropdown contents**: All active team members except the current member and anyone in the current member's subtree (to prevent cycles). The subtree is computed on the frontend by walking `lead_id` relationships in the already-loaded member array — no dedicated backend call needed. The backend cycle detection (ancestor walk) remains the authoritative guard; dropdown filtering is a UX convenience.
- **"No lead" option**: Clear/empty option at the top to unset the lead
- **Display format**: "LastName, FirstName" with title as subtitle
- **Auto-save**: Same `useAutoSave` pattern as other fields, calling `updateTeamMember(id, "lead_id", value)`

## Grouped Team Member List

The MemberList sidebar changes from a flat list to a tree view.

### Tree Structure

- Root nodes: members with `lead_id = NULL`
- Children nested beneath their lead, recursively
- Tree built on the frontend from the flat member array using `lead_id` relationships

### Visual Treatment

- **Indentation**: 12px per level, capped at level 4 visually
- **Tree connector lines**: Thin vertical + horizontal lines in `border-muted` color showing parent-child relationships
- **Lead rows**: Identical to regular member rows (avatar, name, title) — no special badge or icon
- **Collapse/expand**: Small chevron toggle on leads with reports. Default: all expanded. Collapse state in local component state (not persisted to DB).

### Sorting

- Same as current: alphabetical by last name, first name
- Each level sorts its children independently

### Active vs. Former Split

- Tree structure applies within the "Active" section only
- Former members remain in their own collapsible section at the bottom, shown flat (no hierarchy)

### Virtualization

- The data source for `useVirtualList` changes from `activeMembers` to a derived `visibleRows` array (flat list of `{ member, depth, hasChildren, isExpanded }` objects). This array is recomputed whenever collapse state changes.
- The virtualizer count parameter updates to `visibleRows.length`.
- Collapsed subtrees are excluded from the `visibleRows` array.
- Row `estimateSize` remains constant — indentation does not change row height.

## Org Chart Page

A new view accessible via a toggle in the Team Members tab header.

### Toggle

- Located in the header bar next to the "Add" button
- Two small icons: list view (current) and org chart view
- Active state highlighted

### Layout

- Full width of the detail panel area (replaces member detail when org chart is active)
- Sidebar list remains visible and functional
- Clicking a member in the sidebar highlights them in the chart

### Chart Rendering

- Top-down tree layout
- Each node: member avatar, name, and current title
- Lines connecting parent to children
- Multiple roots: members with no lead are each a separate root tree
- Lone nodes (no lead, no reports): standalone boxes

### Implementation

- Custom CSS flexbox tree with SVG connector lines — lightweight, no heavy dependency
- Pan and zoom: CSS `transform: scale()` + `translate()` on a wrapper div, controlled by mouse wheel (zoom) and drag (pan). Reset-to-fit button. Initial load: fit-to-view (scale to show all nodes within the viewport).

### Interactivity

- Clicking a node selects that member (syncs with sidebar selection)
- Can switch back to list view to see member detail
- Read-only — no editing in chart view. Lead assignments done in detail form.

## Edge Cases & Constraints

- **Subtree moves**: Changing a member's lead moves their entire subtree automatically (their reports still point to them)
- **Deletion**: Direct reports of a deleted lead become root-level (`lead_id = NULL`). Grandchildren are unaffected — they still point to their immediate (still-existing) lead.
- **Stakeholders**: Members with `exclude_from_salary = 1` participate in hierarchy normally — can be leads or have leads
- **Former members**: Setting `left_date` moves a member to the "Former" section. Their reports' `lead_id` is NOT automatically cleared. A warning banner is shown in the former member's InfoSection if they still have active reports (e.g., "This former member is still listed as lead for N active members").
- **Salary Planner**: Lead hierarchy does not affect Salary Planner grouping. Salary data points remain independent.
- **Max depth**: No hard limit. Cycle detection is the only structural constraint.
- **Keyboard navigation**: In the tree view, ArrowUp/ArrowDown moves between visible rows (same as current). ArrowRight expands a collapsed node, ArrowLeft collapses an expanded node (or moves to parent if already collapsed/leaf).
