import { useState } from "react";
import { PlusIcon, Trash2Icon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function ProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: ProjectListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [finishedOpen, setFinishedOpen] = useState(false);

  const active = projects.filter((p) => !p.end_date);
  const finished = projects.filter((p) => p.end_date);

  const renderItem = (project: Project) => (
    <li
      key={project.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
        selectedId === project.id ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(project.id)}
      onMouseEnter={() => setHoveredId(project.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{project.name || "Untitled Project"}</div>
        <div className="text-xs text-muted-foreground truncate">{project.start_date}</div>
      </div>

      {hoveredId === project.id && (
        <AlertDialog
          open={pendingDeleteId === project.id}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
        >
          <AlertDialogTrigger
            render={
              <button
                className="ml-1 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(project.id);
                }}
                title="Delete project"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <strong>{project.name || "Untitled Project"}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                  setPendingDeleteId(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Projects</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add project">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {active.length === 0 && finished.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No projects yet</div>
        ) : (
          <>
            <ul className="py-1">{active.map(renderItem)}</ul>

            {finished.length > 0 && (
              <div className="border-t">
                <button
                  className="flex w-full items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setFinishedOpen(!finishedOpen)}
                >
                  <ChevronRightIcon
                    className={`size-3 transition-transform ${finishedOpen ? "rotate-90" : ""}`}
                  />
                  Finished ({finished.length})
                </button>
                {finishedOpen && <ul className="pb-1">{finished.map(renderItem)}</ul>}
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
