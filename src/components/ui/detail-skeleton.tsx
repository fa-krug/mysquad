import { Skeleton } from "@/components/ui/skeleton";

export function DetailSkeleton() {
  return (
    <div className="max-w-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>

      {/* Field groups */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      <Skeleton className="h-px w-full" />

      {/* Section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
