import { useState, useEffect, useCallback } from "react";
import { TitleList } from "@/components/titles/TitleList";
import { TitleDetail } from "@/components/titles/TitleDetail";
import { getTitles, createTitle, updateTitle, deleteTitle, getTeamMembers } from "@/lib/db";
import type { Title, TeamMember } from "@/lib/types";

export function Titles() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);

  const loadTitles = useCallback(async () => {
    const [t, m] = await Promise.all([getTitles(), getTeamMembers()]);
    setTitles(t);
    setMembers(m);
    return t;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTitles(), getTeamMembers()]).then(([t, m]) => {
      if (!cancelled) {
        setTitles(t);
        setMembers(m);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const created = await createTitle("New Title");
    await loadTitles();
    setSelectedId(created.id);
    setFocusName(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTitle(id);
      if (selectedId === id) setSelectedId(null);
      await loadTitles();
    } catch (e) {
      // Title with members can't be deleted — error from backend
      alert(e instanceof Error ? e.message : String(e));
    }
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
        titles={titles}
        selectedId={selectedId}
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
