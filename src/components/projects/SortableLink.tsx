import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { GripVerticalIcon, FolderIcon, GlobeIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectLink } from "@/lib/types";

interface SortableLinkProps {
  link: ProjectLink;
  onEdit: () => void;
  onDelete: () => void;
}

export function SortableLink({ link, onEdit, onDelete }: SortableLinkProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFolder = link.url.startsWith("file://");
  const Icon = isFolder ? FolderIcon : GlobeIcon;

  const displayText = link.label || link.url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <Icon className="size-4 shrink-0 text-muted-foreground" />

      <button
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() =>
          isFolder ? openPath(link.url.replace(/^file:\/\//, "")) : openUrl(link.url)
        }
        title={link.url}
      >
        {displayText}
      </button>

      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="size-6" onClick={onEdit}>
          <PencilIcon className="size-3" />
        </Button>
        <Button variant="ghost" size="icon" className="size-6" onClick={onDelete}>
          <TrashIcon className="size-3" />
        </Button>
      </div>
    </div>
  );
}
