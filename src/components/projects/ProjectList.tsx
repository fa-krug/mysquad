import { useState, useMemo, useEffect, useRef } from "react";
import { PlusIcon, Trash2, ChevronRightIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  // Auto-select first match when search changes
  useEffect(() => {
    if (searchQuery.trim() && filteredProjects.length > 0) {
      onSelect(filteredProjects[0].id);
    }
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when search is shown
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  const active = filteredProjects.filter((p) => !p.end_date);
  const finished = filteredProjects.filter((p) => p.end_date);

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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setShowSearch((v) => !v);
              if (showSearch) setSearchQuery("");
            }}
            title={showSearch ? "Hide search" : "Search projects"}
            className={showSearch ? "bg-muted" : ""}
          >
            <SearchIcon />
          </Button>
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
      </div>

      {showSearch && (
        <div className="px-2 py-1.5 border-b">
          <div className="relative">
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs pr-6"
            />
            {searchQuery && (
              <button
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                tabIndex={-1}
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : active.length === 0 && finished.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {searchQuery.trim() ? "No matches" : "No projects yet"}
          </div>
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
                        style={{
                          position: "absolute",
                          top: virtualRow.start,
                          height: virtualRow.size,
                          left: 0,
                          width: "100%",
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
