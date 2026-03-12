# Team Member Profile Pictures Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add uploadable profile pictures to team members with circular avatars and initials fallback.

**Architecture:** Store images as JPEG files on disk under `{app_data_dir}/pictures/`. DB column `picture_path` holds the filename. Rust handles resize/crop via the `image` crate. Frontend uses `convertFileSrc()` with the Tauri asset protocol to display images. The `@tauri-apps/plugin-dialog` provides native file picker.

**Tech Stack:** Rust (`image` crate, `tauri-plugin-dialog`), React (new `MemberAvatar` component), Tauri v2 asset protocol

---

## Chunk 1: Backend — Migration, Struct, and Picture Commands

### Task 1: DB migration for `picture_path` column

**Files:**
- Create: `src-tauri/migrations/003_member_pictures.sql`
- Modify: `src-tauri/src/db.rs:34-38` (add v3 migration block)

- [ ] **Step 1: Write the migration SQL file**

```sql
ALTER TABLE team_members ADD COLUMN picture_path TEXT;
```

- [ ] **Step 2: Write the failing test**

Add to `src-tauri/src/db.rs` tests:

```rust
#[test]
fn test_migration_v3_picture_path() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    // Verify picture_path column exists
    let has_col: bool = conn
        .prepare("SELECT picture_path FROM team_members LIMIT 0")
        .is_ok();
    assert!(has_col);

    // Verify user_version is 3
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 3);
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_migration_v3_picture_path`
Expected: FAIL — `picture_path` column doesn't exist, version is still 2

- [ ] **Step 4: Add migration block to `db.rs`**

In `src-tauri/src/db.rs`, after the `if version < 2` block (line 38), add:

```rust
    if version < 3 {
        let migration_sql = include_str!("../migrations/003_member_pictures.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 3)?;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src-tauri && cargo test test_migration_v3_picture_path`
Expected: PASS

- [ ] **Step 6: Update existing version test**

In `src-tauri/src/db.rs`, update `test_schema_version_tracking`:

```rust
assert_eq!(version, 3);
```

- [ ] **Step 7: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src-tauri/migrations/003_member_pictures.sql src-tauri/src/db.rs
git commit -m "feat: add migration v3 for picture_path column"
```

---

### Task 2: Update `TeamMember` struct and queries

**Files:**
- Modify: `src-tauri/src/commands.rs:44-59` (struct), `commands.rs:67-92` (query/mapping), `commands.rs:111-125` (create return)

- [ ] **Step 1: Add `picture_path` to `TeamMember` struct**

In `src-tauri/src/commands.rs`, after `notes: Option<String>` (line 58), add:

```rust
    pub picture_path: Option<String>,
```

- [ ] **Step 2: Update `get_team_members` SQL query**

In `src-tauri/src/commands.rs`, update the SELECT (lines 67-69) to include `m.picture_path`:

```rust
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.start_date, m.notes, m.picture_path
             FROM team_members m
             LEFT JOIN titles t ON m.title_id = t.id
             ORDER BY m.last_name ASC, m.first_name ASC",
```

And add the mapping after `notes` (after line 91):

```rust
                notes: row.get(12)?,
                picture_path: row.get(13)?,
```

- [ ] **Step 3: Update `create_team_member` return**

In `src-tauri/src/commands.rs`, add after `notes: None` (line 124):

```rust
        picture_path: None,
```

- [ ] **Step 4: Build to verify compilation**

Run: `cd src-tauri && cargo build`
Expected: Compiles successfully

- [ ] **Step 5: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add picture_path to TeamMember struct and queries"
```

---

### Task 3: Add `image` crate and `tauri-plugin-dialog` dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml:20-30`
- Modify: `src-tauri/src/lib.rs:10-11`
- Modify: `src-tauri/capabilities/default.json:6-9`

- [ ] **Step 1: Add Rust dependencies to `Cargo.toml`**

In `src-tauri/Cargo.toml`, after `chrono = "0.4"` (line 30), add:

```toml
image = "0.25"
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register dialog plugin in `lib.rs`**

In `src-tauri/src/lib.rs`, change line 10-11 from:

```rust
    tauri::Builder::default()
        .manage(AppDb::new())
```

to:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppDb::new())
```

- [ ] **Step 3: Add dialog permission to capabilities**

In `src-tauri/capabilities/default.json`, update permissions array:

```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
```

- [ ] **Step 4: Build to verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles (dialog plugin and image crate resolve)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: add image crate and tauri-plugin-dialog dependencies"
```

---

### Task 4: Implement `upload_member_picture` and `delete_member_picture` commands

**Files:**
- Modify: `src-tauri/src/commands.rs` (add new commands after `delete_team_member`, ~line 166)
- Modify: `src-tauri/src/lib.rs:12-49` (register new commands)

- [ ] **Step 1: Extract shared `get_app_data_dir` helper and add `get_pictures_dir`**

In `src-tauri/src/commands.rs`, refactor `get_db_path` (lines 1010-1016) to extract a shared helper, then add pictures dir:

```rust
fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir().ok_or("Could not determine app data directory")?;
    let app_dir = data_dir.join("com.mysquad.app");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;
    Ok(app_dir)
}

fn get_db_path() -> Result<String, String> {
    Ok(get_app_data_dir()?.join("mysquad.db").to_string_lossy().into_owned())
}

fn get_pictures_dir() -> Result<std::path::PathBuf, String> {
    let pictures_dir = get_app_data_dir()?.join("pictures");
    std::fs::create_dir_all(&pictures_dir)
        .map_err(|e| format!("Failed to create pictures directory: {}", e))?;
    Ok(pictures_dir)
}
```

- [ ] **Step 2: Add `upload_member_picture` command**

In `src-tauri/src/commands.rs`, after `delete_team_member` (line 166), add:

```rust
#[tauri::command]
pub fn upload_member_picture(db: State<AppDb>, id: i64, file_path: String) -> Result<String, String> {
    use image::imageops::FilterType;
    use image::GenericImageView;

    let pictures_dir = get_pictures_dir()?;
    let filename = format!("{}.jpg", id);
    let dest_path = pictures_dir.join(&filename);

    // Load and resize image
    let img = image::open(&file_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    // Center crop to square
    let (w, h) = img.dimensions();
    let side = w.min(h);
    let x = (w - side) / 2;
    let y = (h - side) / 2;
    let cropped = img.crop_imm(x, y, side, side);

    // Resize to 256x256
    let resized = cropped.resize_exact(256, 256, FilterType::Lanczos3);

    // Save as JPEG
    resized
        .save(&dest_path)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    // Update DB
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET picture_path = ?1 WHERE id = ?2",
        params![filename, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_member_picture(db: State<AppDb>, id: i64) -> Result<(), String> {
    let pictures_dir = get_pictures_dir()?;
    let filename = format!("{}.jpg", id);
    let file_path = pictures_dir.join(&filename);

    // Remove file if it exists
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete picture: {}", e))?;
    }

    // Clear DB
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET picture_path = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 3: Add `get_pictures_dir_path` command for frontend**

In `src-tauri/src/commands.rs`, after the new commands, add:

```rust
#[tauri::command]
pub fn get_pictures_dir_path() -> Result<String, String> {
    let pictures_dir = get_pictures_dir()?;
    Ok(pictures_dir.to_string_lossy().into_owned())
}
```

- [ ] **Step 4: Update `delete_team_member` to clean up picture file**

In `src-tauri/src/commands.rs`, update `delete_team_member` (lines 159-166):

```rust
#[tauri::command]
pub fn delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    // Clean up picture file
    if let Ok(pictures_dir) = get_pictures_dir() {
        let file_path = pictures_dir.join(format!("{}.jpg", id));
        let _ = std::fs::remove_file(file_path); // Ignore errors — file may not exist
    }

    Ok(())
}
```

- [ ] **Step 5: Register new commands in `lib.rs`**

In `src-tauri/src/lib.rs`, add after `commands::delete_team_member,` (line 19):

```rust
            commands::upload_member_picture,
            commands::delete_member_picture,
            commands::get_pictures_dir_path,
```

- [ ] **Step 6: Build to verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles successfully

- [ ] **Step 7: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add upload/delete member picture commands"
```

---

## Chunk 2: Frontend — Avatar Component, Integration, and File Picker

### Task 5: Update TypeScript types and db.ts

**Files:**
- Modify: `src/lib/types.ts:1-15`
- Modify: `src/lib/db.ts:17-22`

- [ ] **Step 1: Add `picture_path` to `TeamMember` interface**

In `src/lib/types.ts`, after `notes: string | null;` (line 14), add:

```typescript
  picture_path: string | null;
```

- [ ] **Step 2: Add picture commands to `db.ts`**

In `src/lib/db.ts`, after `deleteTeamMember` (line 22), add:

```typescript
export const uploadMemberPicture = (id: number, filePath: string) =>
  invoke<string>("upload_member_picture", { id, file_path: filePath });
export const deleteMemberPicture = (id: number) =>
  invoke<void>("delete_member_picture", { id });
export const getPicturesDirPath = () =>
  invoke<string>("get_pictures_dir_path");
```

- [ ] **Step 3: Install `@tauri-apps/plugin-dialog` npm package**

Run: `npm install @tauri-apps/plugin-dialog`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds (or only fails on unused imports — not type errors)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts package.json package-lock.json
git commit -m "feat: add picture types and db functions to frontend"
```

---

### Task 6: Create `MemberAvatar` component

**Files:**
- Create: `src/components/team/MemberAvatar.tsx`

- [ ] **Step 1: Create the `MemberAvatar` component**

Create `src/components/team/MemberAvatar.tsx`:

```tsx
import { useState } from "react";
import { Trash2Icon, UserIcon } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface MemberAvatarProps {
  firstName: string;
  lastName: string;
  picturePath: string | null;
  picturesDir: string | null;
  size: "sm" | "lg";
  cacheKey?: number;
  onUpload?: () => void;
  onDelete?: () => void;
}

const COLORS = [
  "#e57373", "#f06292", "#ba68c8", "#9575cd",
  "#7986cb", "#64b5f6", "#4fc3f7", "#4dd0e1",
  "#4db6ac", "#81c784", "#aed581", "#ff8a65",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function MemberAvatar({
  firstName,
  lastName,
  picturePath,
  picturesDir,
  size,
  cacheKey,
  onUpload,
  onDelete,
}: MemberAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const px = size === "sm" ? 32 : 96;
  const textSize = size === "sm" ? "text-xs" : "text-2xl";

  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
  const hasInitials = initials.trim().length > 0;
  const bgColor = COLORS[hashName(`${firstName} ${lastName}`) % COLORS.length];

  const hasImage = picturePath && picturesDir && !imgError;
  const imageSrc = hasImage
    ? convertFileSrc(`${picturesDir}/${picturePath}`) + (cacheKey ? `?t=${cacheKey}` : "")
    : null;

  const isInteractive = size === "lg" && (onUpload || onDelete);

  return (
    <div
      className="relative shrink-0 rounded-full overflow-hidden select-none"
      style={{ width: px, height: px }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={isInteractive && !hovered ? onUpload : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={`${firstName} ${lastName}`}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : hasInitials ? (
        <div
          className={`flex items-center justify-center w-full h-full font-semibold text-white ${textSize}`}
          style={{ backgroundColor: bgColor }}
        >
          {initials}
        </div>
      ) : (
        <div
          className={`flex items-center justify-center w-full h-full bg-muted text-muted-foreground`}
        >
          <UserIcon className={size === "sm" ? "size-4" : "size-10"} />
        </div>
      )}

      {/* Hover overlay for delete (large avatar with existing photo only) */}
      {size === "lg" && hasImage && hovered && onDelete && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2Icon className="size-6 text-white" />
        </div>
      )}

      {/* Click-to-upload hint for large avatar without photo */}
      {size === "lg" && !hasImage && hovered && onUpload && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onUpload();
          }}
        >
          <span className="text-white text-xs font-medium">Upload</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberAvatar.tsx
git commit -m "feat: add MemberAvatar component with initials and image support"
```

---

### Task 7: Fetch `picturesDir` in parent and pass as prop

**Files:**
- Modify: `src/pages/TeamMembers.tsx:1-79`
- Modify: `src/components/team/MemberDetail.tsx:1-61` (add `picturesDir` prop)
- Modify: `src/components/team/MemberList.tsx:1-127` (add `picturesDir` prop)

- [ ] **Step 1: Add `picturesDir` state to `TeamMembers` page**

In `src/pages/TeamMembers.tsx`, add import:

```typescript
import { getPicturesDirPath } from "@/lib/db";
```

Add state and effect inside the component:

```typescript
const [picturesDir, setPicturesDir] = useState<string | null>(null);

useEffect(() => {
  getPicturesDirPath().then(setPicturesDir);
}, []);
```

Pass `picturesDir` to both `MemberList` and `MemberDetail`:

```tsx
<MemberList
  members={members}
  selectedId={selectedId}
  onSelect={setSelectedId}
  onCreate={handleCreate}
  onDelete={handleDelete}
  picturesDir={picturesDir}
/>
```

```tsx
<MemberDetail
  key={selectedMember.id}
  member={selectedMember}
  onMemberChange={handleMemberChange}
  picturesDir={picturesDir}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/TeamMembers.tsx
git commit -m "feat: fetch picturesDir once in TeamMembers parent"
```

---

### Task 8: Integrate avatar into `MemberDetail`

**Files:**
- Modify: `src/components/team/MemberDetail.tsx:1-61`

- [ ] **Step 1: Update `MemberDetail` to show avatar with upload/delete**

In `src/components/team/MemberDetail.tsx`:

Add `picturesDir` to the props interface:

```typescript
interface MemberDetailProps {
  member: TeamMember;
  onMemberChange: (field: string, value: string | null) => void;
  picturesDir: string | null;
}
```

Add imports at the top:

```typescript
import { open } from "@tauri-apps/plugin-dialog";
import { MemberAvatar } from "./MemberAvatar";
import { uploadMemberPicture, deleteMemberPicture } from "@/lib/db";
```

Add state for `picturePath` and `cacheKey` alongside existing state:

```typescript
const [picturePath, setPicturePath] = useState<string | null>(member.picture_path);
const [cacheKey, setCacheKey] = useState<number>(0);
const [pictureError, setPictureError] = useState<string | null>(null);
```

Add upload and delete handlers:

```typescript
const handleUploadPicture = async () => {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (typeof selected !== "string") return; // cancelled or unexpected type
  try {
    await uploadMemberPicture(member.id, selected);
    setPicturePath(`${member.id}.jpg`);
    setCacheKey(Date.now());
    setPictureError(null);
    onMemberChange("picture_path", `${member.id}.jpg`);
  } catch (err) {
    setPictureError(err instanceof Error ? err.message : String(err));
  }
};

const handleDeletePicture = async () => {
  try {
    await deleteMemberPicture(member.id);
    setPicturePath(null);
    setPictureError(null);
    onMemberChange("picture_path", null);
  } catch (err) {
    setPictureError(err instanceof Error ? err.message : String(err));
  }
};
```

Add avatar JSX at the top of the detail content, before `InfoSection`:

```tsx
<div className="flex items-center gap-4">
  <MemberAvatar
    firstName={member.first_name}
    lastName={member.last_name}
    picturePath={picturePath}
    picturesDir={picturesDir}
    size="lg"
    cacheKey={cacheKey}
    onUpload={handleUploadPicture}
    onDelete={handleDeletePicture}
  />
  <div>
    <h2 className="text-lg font-semibold">
      {member.first_name} {member.last_name}
    </h2>
    {member.title_name && (
      <p className="text-sm text-muted-foreground">{member.title_name}</p>
    )}
    {pictureError && (
      <p className="text-xs text-destructive">{pictureError}</p>
    )}
  </div>
</div>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberDetail.tsx
git commit -m "feat: add avatar with upload/delete to MemberDetail"
```

**Known limitation:** EXIF orientation from phone photos is not handled. Images taken in portrait mode may appear rotated. This can be addressed in a follow-up with the `kamadak-exif` crate or by applying EXIF rotation before cropping in the `upload_member_picture` command.

---

### Task 9: Integrate avatar into `MemberList`

**Files:**
- Modify: `src/components/team/MemberList.tsx:1-127`

- [ ] **Step 1: Add avatar to list items**

In `src/components/team/MemberList.tsx`:

Add import:

```typescript
import { MemberAvatar } from "./MemberAvatar";
```

Add `picturesDir` to the props interface:

```typescript
interface MemberListProps {
  members: TeamMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  picturesDir: string | null;
}
```

Destructure `picturesDir` from props in the component signature.

In each list item (line 58, the `<div className="flex-1 min-w-0">` block), add the avatar before it:

```tsx
<MemberAvatar
  firstName={member.first_name}
  lastName={member.last_name}
  picturePath={member.picture_path}
  picturesDir={picturesDir}
  size="sm"
/>
```

Add `gap-2` to the parent `li` element's flex classes and `items-center` instead of `items-start`:

```tsx
className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
  selectedId === member.id ? "bg-muted" : ""
}`}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberList.tsx
git commit -m "feat: add avatar thumbnails to MemberList"
```

---

### Task 10: Configure Tauri asset protocol scope

**Files:**
- Modify: `src-tauri/tauri.conf.json:23-25`

- [ ] **Step 1: Add asset protocol scope**

In `src-tauri/tauri.conf.json`, update the `security` block (lines 23-25):

```json
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": ["$APPLOCALDATA/pictures/**"]
      }
    }
```

Note: `$APPLOCALDATA` is a Tauri path variable that resolves to the app's local data directory. Verify this resolves to the same directory as `dirs::data_local_dir()/com.mysquad.app` on macOS. If not, use `app_handle.path().app_local_data()` in Rust commands instead.

- [ ] **Step 2: Add asset protocol permission to capabilities**

In `src-tauri/capabilities/default.json`, add the fs scope permission:

```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    {
      "identifier": "core:asset:default",
      "allow": [{ "path": "$APPLOCALDATA/pictures/**" }]
    }
  ]
```

- [ ] **Step 3: Build full app to verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: configure asset protocol scope for member pictures"
```

---

### Task 11: Manual smoke test

- [ ] **Step 1: Run the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Test the full flow**

1. Create a new team member — verify initials avatar appears (colored circle) in both list and detail
2. Click the large avatar — verify file picker opens
3. Select a photo — verify it appears as circular avatar in both list and detail
4. Hover the large avatar — verify trash icon overlay appears
5. Click trash — verify photo is removed and initials return
6. Delete the team member — verify no orphaned files in `~/Library/Application Support/com.mysquad.app/pictures/`
7. Test with a member with no name — verify generic user icon appears

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
