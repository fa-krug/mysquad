import type { OpenEscalationsData } from "@/lib/types";

export function OpenEscalationsBlock({ data }: { data: OpenEscalationsData }) {
  if (data.escalations.length === 0) {
    return <p className="text-sm text-muted-foreground">No open escalations.</p>;
  }

  return (
    <div className="space-y-2">
      {data.escalations.map((e) => (
        <div key={e.id} className="flex items-start gap-2 text-sm">
          <span className="shrink-0 mt-0.5 size-1.5 rounded-full bg-orange-500" />
          <div className="min-w-0">
            <span>{e.text}</span>
            <span className="text-muted-foreground ml-1.5">— {e.member_name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
