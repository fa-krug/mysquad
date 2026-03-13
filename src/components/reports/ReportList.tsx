import { useState } from "react";
import { PlusIcon, Trash2Icon, PencilIcon } from "lucide-react";
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
import type { Report } from "@/lib/types";

interface ReportListProps {
  reports: Report[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}

export function ReportList({
  reports,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onEdit,
}: ReportListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const pendingReport = reports.find((r) => r.id === pendingDeleteId);

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Reports</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add report">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {reports.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No reports yet</div>
        ) : (
          <ul className="py-1">
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
                    <button
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(report.id);
                      }}
                      title="Delete report"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </div>
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
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{pendingReport?.name}</strong>? This action
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
