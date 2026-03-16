import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { TitleList } from "@/components/titles/TitleList";
import { TitleDetail } from "@/components/titles/TitleDetail";
import {
  getTitles,
  createTitle,
  updateTitle,
  deleteTitle,
  getTeamMembers,
  getTrashedTitles,
  restoreTitle,
  permanentDeleteTitle,
} from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Title, TeamMember } from "@/lib/types";

export function Titles() {
  const location = useLocation();
  const [titles, setTitles] = useState<Title[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedTitles, setTrashedTitles] = useState<Title[]>([]);
  const [permanentDeleteId, setPermanentDeleteId] = useState<number | null>(null);

  const loadTitles = useCallback(async () => {
    const [t, m] = await Promise.all([getTitles(), getTeamMembers()]);
    setTitles(t);
    setMembers(m);
    return t;
  }, []);

  const loadTrashedTitles = useCallback(async () => {
    const data = await getTrashedTitles();
    setTrashedTitles(data);
  }, []);

  useEffect(() => {
    if (showTrash) loadTrashedTitles();
  }, [showTrash, loadTrashedTitles]);

  // Load trashed titles count on mount for the badge
  useEffect(() => {
    loadTrashedTitles();
  }, [loadTrashedTitles]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTitles(), getTeamMembers()])
      .then(([t, m]) => {
        if (!cancelled) {
          setTitles(t);
          setMembers(m);
        }
      })
      .catch(() => {
        if (!cancelled) showError("Failed to load titles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-title") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await createTitle("New Title");
      await loadTitles();
      setSelectedId(created.id);
      setFocusName(true);
      showSuccess("Title created");
    } catch {
      showError("Failed to create title");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    const title = titles.find((t) => t.id === id);
    if (!title) return;

    // Check if any members use this title before deleting
    const assignedMembers = members.filter((m) => m.title_id === id || m.current_title_id === id);
    if (assignedMembers.length > 0) {
      showError(`Cannot delete "${title.name}" — ${assignedMembers.length} member(s) assigned`);
      return;
    }

    if (selectedId === id) setSelectedId(null);
    await deleteTitle(id);
    await Promise.all([loadTitles(), loadTrashedTitles()]);
  };

  const handleRestore = async (id: number) => {
    await restoreTitle(id);
    await Promise.all([loadTitles(), loadTrashedTitles()]);
    setSelectedId(null);
  };

  const handlePermanentDelete = async (id: number) => {
    await permanentDeleteTitle(id);
    await loadTrashedTitles();
    setSelectedId(null);
  };

  const handleTitleChange = async (field: string, value: string) => {
    if (selectedId === null) return;
    if (field === "name") {
      await updateTitle(selectedId, value);
      setTitles((prev) => prev.map((t) => (t.id === selectedId ? { ...t, name: value } : t)));
    }
  };

  const selectedTitle = titles.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <TitleList
        titles={showTrash ? trashedTitles : titles}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => {
          setSelectedId(id);
          setFocusName(false);
        }}
        onCreate={handleCreate}
        onDelete={handleDelete}
        showTrash={showTrash}
        onToggleTrash={() => {
          setShowTrash(!showTrash);
          setSelectedId(null);
        }}
        trashCount={trashedTitles.length}
        onRestore={handleRestore}
        onPermanentDelete={(id) => setPermanentDeleteId(id)}
      />
      <div className="flex-1 overflow-auto">
        {showTrash ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a trashed title to restore or permanently delete
          </div>
        ) : selectedTitle ? (
          <TitleDetail
            key={selectedTitle.id}
            title={selectedTitle}
            members={members}
            onTitleChange={handleTitleChange}
            focusName={focusName}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a title to view details
          </div>
        )}
      </div>

      <AlertDialog
        open={permanentDeleteId !== null}
        onOpenChange={(o) => !o && setPermanentDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The title will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (permanentDeleteId) handlePermanentDelete(permanentDeleteId);
                setPermanentDeleteId(null);
              }}
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
