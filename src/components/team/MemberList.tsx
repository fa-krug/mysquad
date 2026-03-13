import { useState } from "react";
import { PlusIcon, Loader2Icon, Trash2 } from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "@/components/ui/button";
import { useVirtualList } from "@/hooks/useVirtualList";
import { ListSkeleton } from "@/components/ui/list-skeleton";
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

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: members.length,
    estimateSize: 40,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = members.map((m) => m.id);
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
        ) : members.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No team members yet
          </div>
        ) : shouldVirtualize ? (
          <ul
            className="py-1 outline-none relative"
            style={{ height: totalSize }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {virtualItems.map((virtualRow) => {
              const member = members[virtualRow.index];
              return (
                <li
                  key={member.id}
                  className={`group absolute flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selectedId === member.id ? "bg-muted" : ""
                  }`}
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
                    left: 0,
                    width: "100%",
                  }}
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
                      <div className="text-xs text-muted-foreground truncate">
                        {member.current_title_name}
                      </div>
                    )}
                  </div>

                  {/* Delete button on hover */}
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
            })}
          </ul>
        ) : (
          <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
            {members.map((member) => (
              <li
                key={member.id}
                className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
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
                  {member.title_name && (
                    <div className="text-xs text-muted-foreground truncate">
                      {member.title_name}
                    </div>
                  )}
                </div>

                {/* Delete button on hover */}
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
