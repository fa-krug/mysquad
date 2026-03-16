import { useState } from "react";
import { PlusIcon, Loader2Icon, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useVirtualList } from "@/hooks/useVirtualList";
import type { Title } from "@/lib/types";

interface TitleListProps {
  titles: Title[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  showTrash?: boolean;
  onToggleTrash?: () => void;
  trashCount?: number;
  onRestore?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
}

export function TitleList({
  titles,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
  showTrash,
  onToggleTrash,
  trashCount,
  onRestore,
  onPermanentDelete,
}: TitleListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: titles.length,
    estimateSize: 40,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = titles.map((t) => t.id);
    const currentIndex = ids.indexOf(selectedId ?? -1);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
      onSelect(ids[next]);
      if (shouldVirtualize) virtualizer.scrollToIndex(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
      onSelect(ids[prev]);
      if (shouldVirtualize) virtualizer.scrollToIndex(prev);
    }
  };

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">{showTrash ? "Trash" : "Titles"}</span>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleTrash}
              title={showTrash ? "Back to list" : "View trash"}
              className={showTrash ? "bg-muted" : ""}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {!showTrash && (trashCount ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-muted-foreground text-background text-[10px] rounded-full h-3.5 min-w-3.5 flex items-center justify-center px-0.5">
                {trashCount}
              </span>
            )}
          </div>
          {!showTrash && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCreate}
              disabled={creating}
              title="Add title"
            >
              {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {showTrash ? (
          titles.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Trash is empty
            </div>
          ) : (
            <ul className="py-1">
              {titles.map((title) => (
                <li
                  key={title.id}
                  className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 opacity-60 ${
                    selectedId === title.id ? "bg-muted" : ""
                  }`}
                  onClick={() => onSelect(title.id)}
                  onMouseEnter={() => setHoveredId(title.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{title.name}</div>
                  </div>
                  {hoveredId === title.id && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore?.(title.id);
                        }}
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPermanentDelete?.(title.id);
                        }}
                        title="Delete forever"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <ListSkeleton />
        ) : titles.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No titles yet</div>
        ) : shouldVirtualize ? (
          <ul
            className="py-1 outline-none relative"
            style={{ height: totalSize }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {virtualItems.map((virtualRow) => {
              const title = titles[virtualRow.index];
              return (
                <li
                  key={title.id}
                  className={`group absolute left-0 w-full flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selectedId === title.id ? "bg-muted" : ""
                  }`}
                  style={{ top: virtualRow.start, height: virtualRow.size }}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(title.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(title.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
