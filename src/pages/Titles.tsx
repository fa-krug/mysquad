import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTitles, createTitle, updateTitle, deleteTitle } from "@/lib/db";
import type { Title } from "@/lib/types";

export function Titles() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add state
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete error per id
  const [deleteError, setDeleteError] = useState<{ id: number; msg: string } | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTitles();
  }, []);

  useEffect(() => {
    if (adding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [adding]);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  async function loadTitles() {
    try {
      const data = await getTitles();
      setTitles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function startAdd() {
    setAdding(true);
    setAddValue("");
    setAddError(null);
  }

  function cancelAdd() {
    setAdding(false);
    setAddValue("");
    setAddError(null);
  }

  async function confirmAdd() {
    const name = addValue.trim();
    if (!name) {
      setAddError("Title name is required.");
      return;
    }
    try {
      const created = await createTitle(name);
      setTitles((prev) => [...prev, created]);
      setAdding(false);
      setAddValue("");
      setAddError(null);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  }

  function startEdit(title: Title) {
    setEditingId(title.id);
    setEditValue(title.name);
    setEditError(null);
    setDeleteError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditError(null);
  }

  async function confirmEdit() {
    if (editingId === null) return;
    const name = editValue.trim();
    if (!name) {
      setEditError("Title name is required.");
      return;
    }
    try {
      await updateTitle(editingId, name);
      setTitles((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, name } : t))
      );
      setEditingId(null);
      setEditValue("");
      setEditError(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(title: Title) {
    setDeleteError(null);
    try {
      await deleteTitle(title.id);
      setTitles((prev) => prev.filter((t) => t.id !== title.id));
    } catch (e) {
      setDeleteError({
        id: title.id,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading titles...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Titles</h1>
        {!adding && (
          <Button size="sm" onClick={startAdd}>
            <Plus className="mr-1" />
            Add
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-1">
        {/* Add row */}
        {adding && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Input
              ref={addInputRef}
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="Title name"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAdd();
                if (e.key === "Escape") cancelAdd();
              }}
            />
            <Button size="icon-sm" variant="ghost" onClick={confirmAdd} title="Save">
              <Check className="size-4 text-green-600" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={cancelAdd} title="Cancel">
              <X className="size-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        {adding && addError && (
          <p className="ml-3 text-sm text-destructive">{addError}</p>
        )}

        {/* Title list */}
        {titles.map((title) => (
          <div key={title.id} className="space-y-1">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50">
              {editingId === title.id ? (
                <>
                  <Input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <Button size="icon-sm" variant="ghost" onClick={confirmEdit} title="Save">
                    <Check className="size-4 text-green-600" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={cancelEdit} title="Cancel">
                    <X className="size-4 text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{title.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {title.member_count} {title.member_count === 1 ? "member" : "members"}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => startEdit(title)}
                    title="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleDelete(title)}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
            {editingId === title.id && editError && (
              <p className="ml-3 text-sm text-destructive">{editError}</p>
            )}
            {deleteError?.id === title.id && (
              <p className="ml-3 text-sm text-destructive">{deleteError.msg}</p>
            )}
          </div>
        ))}

        {titles.length === 0 && !adding && (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No titles yet. Click Add to create one.
          </p>
        )}
      </div>
    </div>
  );
}
