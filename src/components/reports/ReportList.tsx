import { useState, useMemo, useEffect, useRef } from "react";
import { PlusIcon, Trash2Icon, PencilIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVirtualList } from "@/hooks/useVirtualList";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import type { Report } from "@/lib/types";

interface ReportListProps {
  reports: Report[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}

export function ReportList({
  reports,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
  onEdit,
}: ReportListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter((r) => r.name.toLowerCase().includes(q));
  }, [reports, searchQuery]);

  useEffect(() => {
    if (filteredReports.length > 0) {
      onSelect(filteredReports[0].id);
    }
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery("");
    }
  }, [showSearch]);

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: filteredReports.length,
    estimateSize: 40,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = filteredReports.map((r) => r.id);
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
        <span className="text-sm font-semibold">Reports</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSearch((v) => !v)}
            title={showSearch ? "Hide search" : "Search reports"}
            className={showSearch ? "bg-muted" : ""}
          >
            <SearchIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCreate}
            disabled={creating}
            title="Add report"
          >
            {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          </Button>
        </div>
      </div>

      {showSearch && (
        <div className="px-2 py-1.5 border-b">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs pl-7 pr-7"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                tabIndex={-1}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : filteredReports.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {searchQuery ? "No matching reports" : "No reports yet"}
          </div>
        ) : shouldVirtualize ? (
          <ul
            className="py-1 outline-none relative"
            style={{ height: totalSize }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {virtualItems.map((virtualRow) => {
              const report = filteredReports[virtualRow.index];
              return (
                <li
                  key={report.id}
                  className={`group absolute flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 w-full ${
                    selectedId === report.id ? "bg-muted" : ""
                  }`}
                  style={{ top: virtualRow.start, height: virtualRow.size, left: 0 }}
                  onClick={() => onSelect(report.id)}
                  onMouseEnter={() => setHoveredId(report.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{report.name}</div>
                  </div>

                  {hoveredId === report.id && (
                    <div className="flex items-center gap-0.5 ml-1 shrink-0">
                      <button
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(report.id);
                        }}
                        title="Edit report"
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(report.id);
                        }}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
            {filteredReports.map((report) => (
              <li
                key={report.id}
                className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === report.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelect(report.id)}
                onMouseEnter={() => setHoveredId(report.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{report.name}</div>
                </div>

                {hoveredId === report.id && (
                  <div className="flex items-center gap-0.5 ml-1 shrink-0">
                    <button
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(report.id);
                      }}
                      title="Edit report"
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(report.id);
                      }}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
