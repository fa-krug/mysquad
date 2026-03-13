import { memo, useEffect, useState, useCallback } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getChildren, addChild, updateChild, deleteChild } from "@/lib/db";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { Child } from "@/lib/types";

interface ChildrenListProps {
  teamMemberId: number;
}

interface ChildRowProps {
  child: Child;
  onDelete: (id: number) => void;
  onUpdate: (id: number, name: string, dob: string | null) => Promise<void>;
}

const ChildRow = memo(function ChildRow({ child, onDelete, onUpdate }: ChildRowProps) {
  const [name, setName] = useState(child.name);
  const [dob, setDob] = useState(child.date_of_birth ?? "");

  const { save: saveName } = useAutoSave({
    onSave: async (val) => {
      await onUpdate(child.id, val ?? "", child.date_of_birth);
    },
  });

  const { save: saveDob } = useAutoSave({
    onSave: async (val) => {
      await onUpdate(child.id, name, val === "" ? null : val);
    },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    saveName(e.target.value || null);
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDob(e.target.value);
    saveDob(e.target.value === "" ? null : e.target.value);
  };

  return (
    <div className="flex items-center gap-2 py-1.5">
      <Input
        className="flex-1"
        placeholder="Child's name"
        value={name}
        onChange={handleNameChange}
      />
      <Input
        type="date"
        className="w-36"
        value={dob}
        onChange={handleDobChange}
        title="Date of birth"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(child.id)}
        className="text-muted-foreground hover:text-destructive shrink-0"
        title="Remove child"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
});

export function ChildrenList({ teamMemberId }: ChildrenListProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getChildren(teamMemberId);
      setChildren(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamMemberId]);

  useEffect(() => {
    setLoading(true);
    setChildren([]);
    load();
  }, [load]);

  const handleAdd = async () => {
    try {
      const child = await addChild(teamMemberId, "New Child", null);
      setChildren((prev) => [...prev, child]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteChild(id);
      setChildren((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleUpdate = useCallback(async (id: number, name: string, dob: string | null) => {
    await updateChild(id, name, dob);
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, name, date_of_birth: dob } : c)));
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-2">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">Children</span>
        <Button variant="ghost" size="icon-sm" onClick={handleAdd} title="Add child">
          <PlusIcon />
        </Button>
      </div>

      {error && <div className="text-xs text-destructive mb-1">{error}</div>}

      {children.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">No children added</div>
      ) : (
        <div className="flex flex-col">
          {children.map((child) => (
            <ChildRow
              key={child.id}
              child={child}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
