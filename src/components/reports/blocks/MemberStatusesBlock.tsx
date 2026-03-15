import type { MemberStatusesData } from "@/lib/types";

export function MemberStatusesBlock({ data }: { data: MemberStatusesData }) {
  if (data.members.length === 0) {
    return <p className="text-sm text-muted-foreground">No open status updates.</p>;
  }

  return (
    <div className="space-y-3">
      {data.members.map((m) => (
        <div key={m.member_id}>
          <div className="text-sm font-medium">
            {m.first_name} {m.last_name}
          </div>
          <ul className="mt-1 space-y-0.5">
            {m.statuses.map((s) => (
              <li key={s.id} className="text-sm text-muted-foreground pl-3 relative">
                <span className="absolute left-0">&bull;</span>
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
