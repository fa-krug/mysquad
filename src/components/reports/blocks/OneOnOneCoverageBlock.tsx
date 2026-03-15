import type { OneOnOneCoverageData } from "@/lib/types";

export function OneOnOneCoverageBlock({ data }: { data: OneOnOneCoverageData }) {
  if (data.members.length === 0) {
    return <p className="text-sm text-muted-foreground">No active team members.</p>;
  }

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const recent = data.members.filter((m) => m.last_meeting_date && m.last_meeting_date >= cutoff);
  const needs = data.members.filter((m) => !m.last_meeting_date || m.last_meeting_date < cutoff);

  return (
    <div className="space-y-4">
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold text-green-600">{recent.length}</div>
          <div className="text-xs text-muted-foreground">Recent 1:1</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-orange-500">{needs.length}</div>
          <div className="text-xs text-muted-foreground">Needs 1:1</div>
        </div>
      </div>

      {needs.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Needs Attention</div>
          {needs.map((m) => (
            <div key={m.member_id} className="flex items-center justify-between text-sm">
              <span>
                {m.first_name} {m.last_name}
              </span>
              <span className="text-muted-foreground text-xs">
                {m.last_meeting_date
                  ? `Last: ${new Date(m.last_meeting_date).toLocaleDateString()}`
                  : "Never"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
