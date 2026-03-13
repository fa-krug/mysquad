import { PlusIcon, Loader2Icon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import type { Title } from "@/lib/types";

interface TitleListProps {
  titles: Title[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function TitleList({
  titles,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
}: TitleListProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ids = titles.map((t) => t.id);
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
        <span className="text-sm font-semibold">Titles</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="Add title"
        >
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <ListSkeleton />
        ) : titles.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No titles yet</div>
        ) : (
          <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
            {titles.map((title) => (
              <li
                key={title.id}
                className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === title.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelect(title.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{title.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {title.member_count} {title.member_count === 1 ? "member" : "members"}
                  </div>
                </div>

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
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
