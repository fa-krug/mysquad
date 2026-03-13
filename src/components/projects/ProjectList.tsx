import { useState } from "react";
import { PlusIcon, Trash2, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVirtualList } from "@/hooks/useVirtualList";
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

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: active.length,
    estimateSize: 40,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const visibleProjects = finishedOpen ? [...active, ...finished] : active;
    const ids = visibleProjects.map((p) => p.id);
    const currentIndex = ids.indexOf(selectedId ?? -1);

    let nextIndex: number;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    } else {
      return;
    }

    onSelect(ids[nextIndex]);
    if (shouldVirtualize) {
      if (nextIndex < active.length) {
        virtualizer.scrollToIndex(nextIndex);
      } else {
        // Finished item — outside virtualizer, use native scrollIntoView
        const el = scrollRef.current?.querySelector(`[data-project-id="${ids[nextIndex]}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }
    }
  };

  const renderItem = (project: Project, extraProps?: React.HTMLAttributes<HTMLLIElement>) => (
    <li
      key={project.id}
      data-project-id={project.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
        selectedId === project.id ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(project.id)}
      {...extraProps}
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : active.length === 0 && finished.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No projects yet</div>
        ) : (
          <>
            <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
              {shouldVirtualize ? (
                <div style={{ height: totalSize, position: "relative" }}>
                  {virtualItems.map((virtualRow) => {
                    const project = active[virtualRow.index];
                    return (
                      <li
                        key={project.id}
                        data-project-id={project.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                          selectedId === project.id ? "bg-muted" : ""
                        }`}
                        onClick={() => onSelect(project.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {project.name || "Untitled Project"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {project.start_date}
                          </div>
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
                  })}
                </div>
              ) : (
                active.map((p) => renderItem(p))
              )}
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
                {finishedOpen && <ul className="pb-1">{finished.map((p) => renderItem(p))}</ul>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
