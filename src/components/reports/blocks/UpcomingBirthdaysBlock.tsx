import type { UpcomingBirthdaysData } from "@/lib/types";

export function UpcomingBirthdaysBlock({ data }: { data: UpcomingBirthdaysData }) {
  if (data.birthdays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No upcoming birthdays in the next 90 days.</p>
    );
  }

  return (
    <div className="space-y-2">
      {data.birthdays.map((b, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <div>
            <span className="font-medium">{b.child_name}</span>
            <span className="text-muted-foreground ml-1.5">({b.parent_name})</span>
          </div>
          <span className="text-muted-foreground text-xs">
            {b.days_until === 0
              ? "Today!"
              : b.days_until === 1
                ? "Tomorrow"
                : `In ${b.days_until} days`}
          </span>
        </div>
      ))}
    </div>
  );
}
