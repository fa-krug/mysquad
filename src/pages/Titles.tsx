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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorRetry } from "@/components/ui/error-retry";
import type { Title, TeamMember } from "@/lib/types";
import { useResourceLoader } from "@/hooks/useResourceLoader";
import { useTrashManager } from "@/hooks/useTrashManager";

export function Titles() {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [creating, setCreating] = useState(false);

  const {
    data: titles,
    setData: setTitles,
    loading,
    error,
    reload: loadTitles,
  } = useResourceLoader(() => getTitles(), [] as Title[]);

  const { data: members } = useResourceLoader(() => getTeamMembers(), [] as TeamMember[]);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const trash = useTrashManager<Title>({
    fetchTrashed: getTrashedTitles,
    restoreItem: restoreTitle,
    permanentDeleteItem: permanentDeleteTitle,
    onRefresh: loadTitles,
    onSelectionClear: clearSelection,
  });

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
    await Promise.all([loadTitles(), trash.loadTrashedItems()]);
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
        titles={trash.showTrash ? trash.trashedItems : titles}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => {
          setSelectedId(id);
          setFocusName(false);
        }}
        onCreate={handleCreate}
        onDelete={handleDelete}
        showTrash={trash.showTrash}
        onToggleTrash={trash.toggleTrash}
        trashCount={trash.trashedItems.length}
        onRestore={trash.handleRestore}
        onPermanentDelete={(id) => trash.requestPermanentDelete(id)}
      />
      <div className="flex-1 overflow-auto">
        <ErrorBoundary>
          {trash.showTrash ? (
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
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <ErrorRetry message="Failed to load titles" onRetry={loadTitles} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a title to view details
            </div>
          )}
        </ErrorBoundary>
      </div>

      <AlertDialog
        open={trash.permanentDeleteId !== null}
        onOpenChange={(o) => !o && trash.cancelPermanentDelete()}
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
            <AlertDialogAction onClick={trash.confirmPermanentDelete}>
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
