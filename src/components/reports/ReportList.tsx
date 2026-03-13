import { useState } from "react";
import { PlusIcon, Trash2Icon, PencilIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = reports.map((r) => r.id);
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

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Reports</span>
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

      <ScrollArea className="flex-1">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : reports.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No reports yet</div>
        ) : (
          <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
            {reports.map((report) => (
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
      </ScrollArea>
    </div>
  );
}
