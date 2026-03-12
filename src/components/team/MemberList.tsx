import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { TeamMember } from "@/lib/types";

interface MemberListProps {
  members: TeamMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function MemberList({ members, selectedId, onSelect, onCreate, onDelete }: MemberListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Team Members</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add member">
          <PlusIcon />
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {members.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No team members yet
          </div>
        ) : (
          <ul className="py-1">
            {members.map((member) => (
              <li
                key={member.id}
                className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === member.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelect(member.id)}
                onMouseEnter={() => setHoveredId(member.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
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
                  <AlertDialog
                    open={pendingDeleteId === member.id}
                    onOpenChange={(open) => {
                      if (!open) setPendingDeleteId(null);
                    }}
                  >
                    <AlertDialogTrigger
                      render={
                        <button
                          className="ml-1 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(member.id);
                          }}
                          title="Delete member"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Member</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete{" "}
                          <strong>
                            {member.first_name} {member.last_name}
                          </strong>
                          ? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(member.id);
                            setPendingDeleteId(null);
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
