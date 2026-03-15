import type { ProjectStatusData } from "@/lib/types";

export function ProjectStatusBlock({ data }: { data: ProjectStatusData }) {
  if (data.projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No active projects.</p>;
  }

  return (
    <div className="space-y-3">
      {data.projects.map((p) => {
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        return (
          <div key={p.project_id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                {p.done}/{p.total} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
