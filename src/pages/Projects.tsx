import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ProjectList } from "@/components/projects/ProjectList";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { getProjects, createProject, deleteProject } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import type { Project } from "@/lib/types";

export function Projects() {
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const loadProjects = useCallback(async () => {
    const data = await getProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProjects()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch(() => {
        if (!cancelled) showError("Failed to load projects");
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

    if (state.action === "create" || state.action === "create-project") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    } else if (typeof state.projectId === "number") {
      setSelectedId(state.projectId);
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const project = await createProject();
      await loadProjects();
      setSelectedId(project.id);
      showSuccess("Project created");
    } catch {
      showError("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    await deleteProject(id);
    await loadProjects();
  };

  const handleProjectChange = (field: string, value: string | null) => {
    setProjects((prev) => prev.map((p) => (p.id === selectedId ? { ...p, [field]: value } : p)));
  };

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <ProjectList
        projects={projects}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-auto">
        {selectedProject ? (
          <ProjectDetail
            key={selectedProject.id}
            project={selectedProject}
            onProjectChange={handleProjectChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a project to view details
          </div>
        )}
      </div>
    </div>
  );
}
