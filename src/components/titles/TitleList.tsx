import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Title } from "@/lib/types";

interface TitleListProps {
  titles: Title[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function TitleList({ titles, selectedId, onSelect, onCreate, onDelete }: TitleListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const pendingTitle = titles.find((t) => t.id === pendingDeleteId);

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Titles</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add title">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {titles.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No titles yet</div>
        ) : (
          <ul className="py-1">
            {titles.map((title) => (
              <li
                key={title.id}
                className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === title.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelect(title.id)}
                onMouseEnter={() => setHoveredId(title.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{title.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {title.member_count} {title.member_count === 1 ? "member" : "members"}
                  </div>
                </div>

                {hoveredId === title.id && (
                  <button
                    className="ml-1 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(title.id);
                    }}
                    title="Delete title"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Title</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{pendingTitle?.name}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId !== null) {
                  onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
