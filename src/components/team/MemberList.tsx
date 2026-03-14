import { useState, useMemo } from "react";
import { PlusIcon, Loader2Icon, Trash2, ChevronRight } from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useVirtualList } from "@/hooks/useVirtualList";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { flattenTree } from "@/lib/tree-utils";
import type { TreeRow } from "@/lib/tree-utils";
import type { TeamMember } from "@/lib/types";

interface MemberListProps {
  members: TeamMember[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  picturesDir: string | null;
}

export function MemberList({
  members,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
  picturesDir,
}: MemberListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [formerOpen, setFormerOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  const activeMembers = members.filter((m) => !m.left_date);
  const formerMembers = members.filter((m) => m.left_date);

  const visibleRows = useMemo(
    () => flattenTree(activeMembers, collapsedIds),
    [activeMembers, collapsedIds],
  );

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: visibleRows.length,
    estimateSize: 40,
  });

  const toggleCollapse = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = visibleRows.findIndex((r) => r.member.id === selectedId);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < visibleRows.length - 1 ? currentIndex + 1 : 0;
      onSelect(visibleRows[next].member.id);
      if (shouldVirtualize) virtualizer.scrollToIndex(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : visibleRows.length - 1;
      onSelect(visibleRows[prev].member.id);
      if (shouldVirtualize) virtualizer.scrollToIndex(prev);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (currentIndex >= 0) {
        const row = visibleRows[currentIndex];
        if (row.hasChildren && !row.isExpanded) {
          toggleCollapse(row.member.id);
        }
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (currentIndex >= 0) {
        const row = visibleRows[currentIndex];
        if (row.hasChildren && row.isExpanded) {
          // Collapse this node
          toggleCollapse(row.member.id);
        } else {
          // Move to parent
          const parentId = row.member.lead_id;
          if (parentId != null) {
            const parentIndex = visibleRows.findIndex((r) => r.member.id === parentId);
            if (parentIndex >= 0) {
              onSelect(parentId);
              if (shouldVirtualize) virtualizer.scrollToIndex(parentIndex);
            }
          }
        }
      }
    }
  };

  const renderTreeRow = (row: TreeRow, style?: React.CSSProperties) => {
    const { member, depth, hasChildren, isExpanded } = row;
    const paddingLeft = 8 + Math.min(depth, 4) * 12;

    return (
      <li
        key={member.id}
        className={`group relative flex items-center gap-2 py-2 cursor-pointer hover:bg-muted/50 ${
          selectedId === member.id ? "bg-muted" : ""
        }`}
        style={{ paddingLeft, paddingRight: 8, ...style }}
        onClick={() => onSelect(member.id)}
        onMouseEnter={() => setHoveredId(member.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Tree connector line for non-root rows */}
        {depth > 0 && (
          <div
            className="absolute border-l border-b border-border/40"
            style={{
              left: 8 + Math.min(depth - 1, 3) * 12 + 6,
              top: 0,
              bottom: "50%",
              width: 8,
            }}
          />
        )}

        {/* Chevron toggle for nodes with children, spacer for leaf nodes */}
        {hasChildren ? (
          <button
            className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(member.id);
            }}
            tabIndex={-1}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}

        <MemberAvatar
          firstName={member.first_name}
          lastName={member.last_name}
          picturePath={member.picture_path}
          picturesDir={picturesDir}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {member.last_name}, {member.first_name}
          </div>
          {member.current_title_name && (
            <div className="text-xs text-muted-foreground truncate">
              {member.current_title_name}
            </div>
          )}
        </div>

        {hoveredId === member.id && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(member.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </li>
    );
  };

  const renderFormerMember = (member: TeamMember) => (
    <li
      key={member.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 opacity-60 ${
        selectedId === member.id ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(member.id)}
      onMouseEnter={() => setHoveredId(member.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <MemberAvatar
        firstName={member.first_name}
        lastName={member.last_name}
        picturePath={member.picture_path}
        picturesDir={picturesDir}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {member.last_name}, {member.first_name}
        </div>
        {member.current_title_name && (
          <div className="text-xs text-muted-foreground truncate">{member.current_title_name}</div>
        )}
      </div>

      {hoveredId === member.id && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(member.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );

  const formerSection = formerMembers.length > 0 && (
    <Collapsible open={formerOpen} onOpenChange={setFormerOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full">
        <ChevronRight className={`h-3 w-3 transition-transform ${formerOpen ? "rotate-90" : ""}`} />
        Former ({formerMembers.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="py-1">{formerMembers.map((member) => renderFormerMember(member))}</ul>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Team Members</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="Add member"
        >
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        </Button>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton showAvatar />
        ) : activeMembers.length === 0 && formerMembers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No team members yet
          </div>
        ) : shouldVirtualize ? (
          <div>
            <ul
              className="py-1 outline-none relative"
              style={{ height: totalSize }}
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              {virtualItems.map((virtualRow) => {
                const row = visibleRows[virtualRow.index];
                return renderTreeRow(row, {
                  position: "absolute",
                  top: virtualRow.start,
                  height: virtualRow.size,
                  left: 0,
                  width: "100%",
                });
              })}
            </ul>

            {formerSection}
          </div>
        ) : (
          <div>
            <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
              {visibleRows.map((row) => renderTreeRow(row))}
            </ul>

            {formerSection}
          </div>
        )}
      </div>
    </div>
  );
}
