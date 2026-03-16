import type React from "react";
import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowUpFromLine,
  RotateCcw,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryListItem, SalaryDataPointSummary, ScenarioGroup } from "@/lib/types";

interface DataPointListProps {
  items: SalaryListItem[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onEdit: (dp: SalaryDataPointSummary) => void;
  onEditGroup: (group: ScenarioGroup) => void;
  onDelete: (id: number) => void;
  onDeleteGroup: (id: number) => void;
  onPromote: (dataPointId: number) => void;
  showTrash?: boolean;
  onToggleTrash?: () => void;
  trashCount?: number;
  onRestore?: (id: number, type: "data_point" | "scenario_group") => void;
  onPermanentDelete?: (id: number, type: "data_point" | "scenario_group") => void;
}

export function DataPointList({
  items,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onEdit,
  onEditGroup,
  onDelete,
  onDeleteGroup,
  onPromote,
  showTrash,
  onToggleTrash,
  trashCount,
  onRestore,
  onPermanentDelete,
}: DataPointListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function toggleGroup(groupId: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  // Build flat list of selectable IDs for keyboard navigation
  const selectableIds = useMemo(() => {
    const ids: number[] = [];
    for (const item of items) {
      if (item.type === "data_point") {
        ids.push(item.data_point.id);
      } else if (expandedGroups.has(item.scenario_group.id)) {
        for (const child of item.scenario_group.children) {
          ids.push(child.id);
        }
      }
    }
    return ids;
  }, [items, expandedGroups]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = selectableIds.indexOf(selectedId ?? -1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < selectableIds.length - 1 ? currentIndex + 1 : 0;
      onSelect(selectableIds[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : selectableIds.length - 1;
      onSelect(selectableIds[prev]);
    }
  };

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 h-12">
        <h2 className="text-sm font-semibold">{showTrash ? "Trash" : "Data Points"}</h2>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleTrash}
              title={showTrash ? "Back to list" : "View trash"}
              className={showTrash ? "bg-muted" : ""}
            >
              {showTrash ? <List className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
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
              title="New Data Point"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-2">
            <ListSkeleton />
          </div>
        ) : showTrash ? (
          items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Trash is empty</p>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {items.map((item) => {
                if (item.type === "data_point") {
                  const dp = item.data_point;
                  const key = `dp-${dp.id}`;
                  return (
                    <div
                      key={key}
                      className="group flex items-center justify-between rounded-md px-3 py-2 text-sm opacity-60 hover:bg-muted/50 cursor-pointer"
                      onClick={() => onSelect(dp.id)}
                      onMouseEnter={() => setHoveredId(key)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{dp.name}</div>
                      </div>
                      {hoveredId === key && (
                        <div className="ml-2 flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestore?.(dp.id, "data_point");
                            }}
                            title="Restore"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPermanentDelete?.(dp.id, "data_point");
                            }}
                            title="Delete forever"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  const group = item.scenario_group;
                  const key = `sg-${group.id}`;
                  return (
                    <div
                      key={key}
                      className="group flex items-center justify-between rounded-md px-3 py-2 text-sm opacity-60 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 bg-purple-50/50 dark:bg-purple-950/10 cursor-pointer"
                      onMouseEnter={() => setHoveredId(key)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-purple-700 dark:text-purple-300">
                          {group.name}
                        </div>
                      </div>
                      {hoveredId === key && (
                        <div className="ml-2 flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestore?.(group.id, "scenario_group");
                            }}
                            title="Restore"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPermanentDelete?.(group.id, "scenario_group");
                            }}
                            title="Delete forever"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          )
        ) : (
          <div
            className="flex flex-col gap-1 p-2 outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {items.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No data points yet.
              </p>
            )}
            {items.map((item) => {
              if (item.type === "data_point") {
                const dp = item.data_point;
                return (
                  <div
                    key={`dp-${dp.id}`}
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
                );
              } else {
                const group = item.scenario_group;
                const isExpanded = expandedGroups.has(group.id);
                return (
                  <div key={`sg-${group.id}`}>
                    <div
                      onClick={() => toggleGroup(group.id)}
                      className="group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-purple-100/50 dark:hover:bg-purple-900/20 bg-purple-50/50 dark:bg-purple-950/10"
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-purple-700 dark:text-purple-300">
                            {group.name}
                          </div>
                          {group.budget != null && (
                            <div className="text-xs text-muted-foreground">
                              Budget: {formatCents(group.budget)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditGroup(group);
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
                            onDeleteGroup(group.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded &&
                      group.children.map((child) => (
                        <div
                          key={`child-${child.id}`}
                          onClick={() => onSelect(child.id)}
                          className={cn(
                            "group flex cursor-pointer items-center justify-between rounded-md pl-8 pr-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                            selectedId === child.id && "bg-muted",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-muted-foreground">{child.name}</div>
                          </div>
                          <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Promote this scenario"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPromote(child.id);
                              }}
                            >
                              <ArrowUpFromLine className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
