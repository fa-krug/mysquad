import { useState, useEffect, useCallback } from "react";
import { ProjectList } from "@/components/projects/ProjectList";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { getProjects, createProject, deleteProject } from "@/lib/db";
import type { Project } from "@/lib/types";

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadProjects = useCallback(async () => {
    const data = await getProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProjects().then((data) => {
      if (!cancelled) setProjects(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const project = await createProject();
    await loadProjects();
    setSelectedId(project.id);
  };

  const handleDelete = async (id: number) => {
    await deleteProject(id);
    if (selectedId === id) setSelectedId(null);
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
