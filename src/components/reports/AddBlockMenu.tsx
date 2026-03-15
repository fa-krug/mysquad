import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";
import { BLOCK_LABELS } from "./blocks/BlockRenderer";

interface AddBlockMenuProps {
  existingBlockTypes: string[];
  onAdd: (blockType: string) => void;
}

const ALL_BLOCK_TYPES = Object.keys(BLOCK_LABELS);

export function AddBlockMenu({ existingBlockTypes, onAdd }: AddBlockMenuProps) {
  const available = ALL_BLOCK_TYPES.filter((t) => !existingBlockTypes.includes(t));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={available.length === 0}
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="size-4" />
        Add Block
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ALL_BLOCK_TYPES.map((type) => {
          const disabled = existingBlockTypes.includes(type);
          return (
            <DropdownMenuItem key={type} disabled={disabled} onClick={() => onAdd(type)}>
              {BLOCK_LABELS[type]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
