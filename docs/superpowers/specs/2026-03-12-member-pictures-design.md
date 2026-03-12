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

- New migration (v3, file `003_member_pictures.sql`): add `picture_path TEXT` column to `team_members`
- `db.rs` needs a `if version < 3` block to run this migration
- Stores just the filename (e.g. `{member_id}.jpg`), not the full path
- Images saved to `{app_data_dir}/pictures/` where `app_data_dir` is resolved via `dirs::data_local_dir()` (on macOS: `~/Library/Application Support/com.mysquad.app/pictures/`)

### Struct/type updates

- **Rust:** Add `picture_path: Option<String>` to the `TeamMember` struct in `commands.rs`
- **Rust:** Update the `get_team_members` SELECT query to include `picture_path`
- **Rust:** Update `create_team_member` to include `picture_path: None` in the returned struct
- **TypeScript:** Add `picture_path: string | null` to the `TeamMember` interface in `types.ts`

## Rust Backend

### New commands

- **`upload_member_picture(id, file_path)`** — receives source file path from the file picker, creates `pictures/` directory via `create_dir_all` if needed, uses the `image` crate to resize/crop to a 256x256 square JPEG, saves to `pictures/{id}.jpg`, updates `picture_path` in DB, returns the full resolved path
- **`delete_member_picture(id)`** — deletes the file from disk, clears `picture_path` in DB

No separate `get_picture_path` command needed — the `picture_path` field is included in the `TeamMember` struct, and the frontend constructs the full path using a pictures directory base path returned alongside member data.

### Modified commands

- **`delete_team_member`** — also removes the picture file from disk if one exists (DB update first, then file deletion for consistency)

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

### Cache busting

When a photo is re-uploaded, append a timestamp query parameter to the `convertFileSrc()` URL (e.g. `?t=1710000000`) to bypass webview caching.

### MemberList changes

- Add small (32px) `Avatar` to the left of each member's name/title in the sidebar list

### MemberDetail changes

- Add large (96px) `Avatar` at the top of the detail panel
- On click (when no hover-delete): open native file picker via `@tauri-apps/plugin-dialog`, filtered to image types (png, jpg, webp)
- On hover when photo exists: semi-transparent dark overlay with centered trash icon; clicking the trash invokes delete

### db.ts additions

- `uploadMemberPicture(id: number, filePath: string): Promise<string>` — invokes `upload_member_picture`
- `deleteMemberPicture(id: number): Promise<void>` — invokes `delete_member_picture`

### Tauri plugin: `@tauri-apps/plugin-dialog`

All four steps required:
1. `npm install @tauri-apps/plugin-dialog`
2. Add `tauri-plugin-dialog` to `src-tauri/Cargo.toml`
3. Register plugin in `lib.rs` via `.plugin(tauri_plugin_dialog::init())`
4. Add dialog permission in `src-tauri/capabilities/default.json`

### Tauri asset protocol scope

Add the pictures directory to the asset protocol scope in `tauri.conf.json` under `app.security.assetProtocol.scope` so that `convertFileSrc()` can load images from the pictures directory.

## Image handling details

- Accepted formats: PNG, JPEG, WebP (input)
- Output: always JPEG, 256x256, square crop (center crop if not square)
- Storage: `{app_data_dir}/pictures/{member_id}.jpg`
- Frontend loads images via `convertFileSrc()` from `@tauri-apps/api/core` to convert the file path to an asset protocol URL

## Edge cases

- Member with no first or last name: show a generic user icon instead of empty initials
- Upload failure: show error toast, keep existing state
- File picker cancelled: no-op
- Deleting a member: DB delete first, then remove picture file from disk
- Re-upload: cache-busted via timestamp query parameter
- EXIF orientation: consider handling rotation metadata from phone photos
- Pictures directory: created on first upload via `create_dir_all`
