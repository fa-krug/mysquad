import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SortableLink } from "./SortableLink";
import { LinkForm } from "./LinkForm";
import {
  getProjectLinks,
  addProjectLink,
  deleteProjectLink,
  updateProjectLink,
  reorderProjectLinks,
} from "@/lib/db";
import type { ProjectLink } from "@/lib/types";

interface ProjectLinksProps {
  projectId: number;
}

export function ProjectLinks({ projectId }: ProjectLinksProps) {
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    getProjectLinks(projectId).then(setLinks);
  }, [projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = links.findIndex((l) => l.id === active.id);
      const newIndex = links.findIndex((l) => l.id === over.id);
      const reordered = arrayMove(links, oldIndex, newIndex);
      setLinks(reordered);
      await reorderProjectLinks(
        projectId,
        reordered.map((l) => l.id)
      );
    },
    [links, projectId]
  );

  const handleAdd = async (url: string, label: string) => {
    const link = await addProjectLink(projectId, url, label || null);
    setLinks((prev) => [...prev, link]);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: number, url: string, label: string) => {
    await updateProjectLink(id, url, label);
    setLinks((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, url, label: label || null }
          : l
      )
    );
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    await deleteProjectLink(id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const path = (files[i] as any).path as string | undefined;
      if (path) {
        const url = `file://${path}`;
        const link = await addProjectLink(projectId, url, null);
        setLinks((prev) => [...prev, link]);
      }
    }
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <Label>Links</Label>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setShowAddForm(true)}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {links.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={links.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {links.map((link) =>
                editingId === link.id ? (
                  <LinkForm
                    key={link.id}
                    initialUrl={link.url}
                    initialLabel={link.label ?? ""}
                    onSubmit={(url, label) =>
                      handleUpdate(link.id, url, label)
                    }
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SortableLink
                    key={link.id}
                    link={link}
                    onEdit={() => setEditingId(link.id)}
                    onDelete={() => handleDelete(link.id)}
                  />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddForm && (
        <LinkForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {links.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          Drop a folder here or click + to add a link
        </p>
      )}
    </div>
  );
}
