import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  rows?: number;
  showAvatar?: boolean;
}

export function ListSkeleton({ rows = 6, showAvatar = false }: ListSkeletonProps) {
  return (
    <div className="py-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          {showAvatar && <Skeleton className="size-8 rounded-full shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <Skeleton className="h-3" style={{ width: `${30 + ((i * 23) % 25)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
