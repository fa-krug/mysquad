import { memo, useState } from "react";
import { Loader2Icon, Trash2Icon, UserIcon } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface MemberAvatarProps {
  firstName: string;
  lastName: string;
  picturePath: string | null;
  picturesDir: string | null;
  size: "sm" | "lg";
  cacheKey?: number;
  loading?: boolean;
  onUpload?: () => void;
  onDelete?: () => void;
}

const COLORS = [
  "#e57373",
  "#f06292",
  "#ba68c8",
  "#9575cd",
  "#7986cb",
  "#64b5f6",
  "#4fc3f7",
  "#4dd0e1",
  "#4db6ac",
  "#81c784",
  "#aed581",
  "#ff8a65",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export const MemberAvatar = memo(function MemberAvatar({
  firstName,
  lastName,
  picturePath,
  picturesDir,
  size,
  cacheKey,
  loading,
  onUpload,
  onDelete,
}: MemberAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const px = size === "sm" ? 32 : 96;
  const textSize = size === "sm" ? "text-xs" : "text-2xl";

  const initials = (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
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
        <div className="flex items-center justify-center w-full h-full bg-muted text-muted-foreground">
          <UserIcon className={size === "sm" ? "size-4" : "size-10"} />
        </div>
      )}

      {/* Loading spinner overlay */}
      {size === "lg" && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
          <Loader2Icon className="size-6 text-white animate-spin" />
        </div>
      )}

      {/* Hover overlay for delete (large avatar with existing photo only) */}
      {size === "lg" && !loading && hasImage && hovered && onDelete && (
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
      {size === "lg" && !loading && !hasImage && hovered && onUpload && (
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
});
