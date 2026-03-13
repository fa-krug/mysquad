import { useState } from "react";
import { PlusIcon, Trash2, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import type { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function ProjectList({
  projects,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
}: ProjectListProps) {
  const [finishedOpen, setFinishedOpen] = useState(false);

  const active = projects.filter((p) => !p.end_date);
  const finished = projects.filter((p) => p.end_date);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const visibleProjects = finishedOpen ? [...active, ...finished] : active;
    const ids = visibleProjects.map((p) => p.id);
    const currentIndex = ids.indexOf(selectedId ?? -1);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
      onSelect(ids[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
      onSelect(ids[prev]);
    }
  };

  const renderItem = (project: Project) => (
    <li
      key={project.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
        selectedId === project.id ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(project.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{project.name || "Untitled Project"}</div>
        <div className="text-xs text-muted-foreground truncate">{project.start_date}</div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(project.id);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Projects</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="Add project"
        >
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <ListSkeleton />
        ) : active.length === 0 && finished.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No projects yet</div>
        ) : (
          <>
            <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
              {active.map(renderItem)}
            </ul>

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
