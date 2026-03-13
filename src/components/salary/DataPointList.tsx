import type React from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointSummary } from "@/lib/types";

interface DataPointListProps {
  dataPoints: SalaryDataPointSummary[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onEdit: (dp: SalaryDataPointSummary) => void;
  onDelete: (id: number) => void;
}

export function DataPointList({
  dataPoints,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: DataPointListProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = dataPoints.map((dp) => dp.id);
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
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 h-12">
        <h2 className="text-sm font-semibold">Data Points</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="New Data Point"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-2">
            <ListSkeleton />
          </div>
        ) : (
          <div
            className="flex flex-col gap-1 p-2 outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {dataPoints.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No data points yet.
              </p>
            )}
            {dataPoints.map((dp) => (
              <div
                key={dp.id}
                onClick={() => onSelect(dp.id)}
                className={cn(
                  "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                  selectedId === dp.id && "bg-muted",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{dp.name}</div>
                  {dp.budget != null && (
                    <div className="text-xs text-muted-foreground">
                      Budget: {formatCents(dp.budget)}
                    </div>
                  )}
                </div>
                <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(dp);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(dp.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
