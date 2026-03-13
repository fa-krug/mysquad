import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { TitleList } from "@/components/titles/TitleList";
import { TitleDetail } from "@/components/titles/TitleDetail";
import { getTitles, createTitle, updateTitle, deleteTitle, getTeamMembers } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import { usePendingDelete } from "@/hooks/usePendingDelete";
import type { Title, TeamMember } from "@/lib/types";

export function Titles() {
  const location = useLocation();
  const [titles, setTitles] = useState<Title[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const { scheduleDelete, pendingIds } = usePendingDelete();

  const loadTitles = useCallback(async () => {
    const [t, m] = await Promise.all([getTitles(), getTeamMembers()]);
    setTitles(t);
    setMembers(m);
    return t;
  }, []);

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

  const handleDelete = (id: number) => {
    const title = titles.find((t) => t.id === id);
    if (!title) return;

    // Check if any members use this title before scheduling
    const assignedMembers = members.filter((m) => m.title_id === id);
    if (assignedMembers.length > 0) {
      showError(`Cannot delete "${title.name}" — ${assignedMembers.length} member(s) assigned`);
      return;
    }

    if (selectedId === id) setSelectedId(null);
    scheduleDelete({
      id,
      label: title.name || "Title",
      onConfirm: async () => {
        await deleteTitle(id);
        await loadTitles();
      },
    });
  };

  const handleTitleChange = async (field: string, value: string) => {
    if (selectedId === null) return;
    if (field === "name") {
      await updateTitle(selectedId, value);
      setTitles((prev) => prev.map((t) => (t.id === selectedId ? { ...t, name: value } : t)));
    }
  };

  const visibleTitles = useMemo(
    () => titles.filter((t) => !pendingIds.has(t.id)),
    [titles, pendingIds],
  );
  const selectedTitle = visibleTitles.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <TitleList
        titles={visibleTitles}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => {
          setSelectedId(id);
          setFocusName(false);
        }}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-auto">
        {selectedTitle ? (
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
    </div>
  );
}
