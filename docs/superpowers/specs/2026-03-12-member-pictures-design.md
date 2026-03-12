# Team Member Profile Pictures — Design Spec

## Overview

Add profile pictures to team members. Users can upload a photo per member by clicking on the avatar. If no photo is uploaded, circular initials are shown with a name-derived background color.

## Requirements

- Circular avatars displayed in both the member list sidebar (32px) and the member detail panel (96px)
- Click the avatar in detail view to open a native file picker and upload a photo
- Hover over the avatar in detail view reveals a trash icon overlay to delete the photo (only when a photo exists)
- Initials fallback: first letter of first name + first letter of last name, with a deterministic color derived from the member's name
- On member deletion, their picture file is also removed

## Data Model

- New migration (v3): add `picture_path TEXT` column to `team_members`
- Stores just the filename (e.g. `{member_id}.jpg`), not the full path
- Images saved to `~/.local/share/com.mysquad.app/pictures/`

## Rust Backend

### New commands

- **`upload_member_picture(id, file_path)`** — receives source file path from the file picker, uses the `image` crate to resize/crop to a 256x256 square JPEG, saves to `pictures/{id}.jpg`, updates `picture_path` in DB, returns the filename
- **`delete_member_picture(id)`** — deletes the file from disk, clears `picture_path` in DB
- **`get_picture_path(id)`** — returns the full resolved file path for the frontend to display

### Modified commands

- **`delete_team_member`** — also removes the picture file from disk if one exists

### Dependencies

- Add `image` crate to `Cargo.toml` for resize/crop operations

## Frontend

### New component: `Avatar`

Reusable component with props:
- `firstName: string`
- `lastName: string`
- `picturePath: string | null`
- `size: "sm" | "lg"` (32px / 96px)

Renders a circular element (`rounded-full`). Shows the uploaded photo if `picturePath` is set, otherwise shows initials on a name-derived colored background.

### Color generation

Deterministic color from name: hash the full name string to pick from a predefined palette of ~12 distinct, accessible background colors. White text for initials.

### MemberList changes

- Add small (32px) `Avatar` to the left of each member's name/title in the sidebar list

### MemberDetail changes

- Add large (96px) `Avatar` at the top of the detail panel
- On click (when no hover-delete): open native file picker via `@tauri-apps/plugin-dialog`, filtered to image types (png, jpg, webp)
- On hover when photo exists: semi-transparent dark overlay with centered trash icon; clicking the trash invokes delete

### db.ts additions

- `uploadMemberPicture(id: number, filePath: string): Promise<string>` — invokes `upload_member_picture`
- `deleteMemberPicture(id: number): Promise<void>` — invokes `delete_member_picture`
- `getPicturePath(id: number): Promise<string | null>` — invokes `get_picture_path`

### Tauri plugin

- Add `@tauri-apps/plugin-dialog` for native file open dialog

## Image handling details

- Accepted formats: PNG, JPEG, WebP (input)
- Output: always JPEG, 256x256, square crop (center crop if not square)
- Storage: `~/.local/share/com.mysquad.app/pictures/{member_id}.jpg`
- Frontend loads images via `convertFileSrc()` from `@tauri-apps/api/core` to convert the file path to an asset protocol URL

## Edge cases

- Member with no first or last name: show a generic user icon instead of empty initials
- Upload failure: show error toast, keep existing state
- File picker cancelled: no-op
- Deleting a member: cascade removes picture file from disk
