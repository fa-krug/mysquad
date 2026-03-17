import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ProjectList } from "@/components/projects/ProjectList";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { getProjects, createProject, deleteProject } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorRetry } from "@/components/ui/error-retry";
import type { Project } from "@/lib/types";
import { useResourceLoader } from "@/hooks/useResourceLoader";

export function Projects() {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const {
    data: projects,
    setData: setProjects,
    loading,
    error,
    reload: loadProjects,
  } = useResourceLoader(() => getProjects(), [] as Project[]);

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
        <ErrorBoundary>
          {error ? (
            <div className="flex h-full items-center justify-center">
              <ErrorRetry message="Failed to load projects" onRetry={loadProjects} />
            </div>
          ) : selectedProject ? (
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
        </ErrorBoundary>
      </div>
    </div>
  );
}
