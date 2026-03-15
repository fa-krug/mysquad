import type { TeamOverviewData } from "@/lib/types";

export function TeamOverviewBlock({ data }: { data: TeamOverviewData }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold">{data.active_count}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-muted-foreground">{data.left_count}</div>
          <div className="text-xs text-muted-foreground">Left</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{data.active_count + data.left_count}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </div>
      {data.title_breakdown.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">By Title</div>
          {data.title_breakdown.map((t) => (
            <div key={t.title_name} className="flex items-center justify-between text-sm">
              <span>{t.title_name}</span>
              <span className="text-muted-foreground">{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
