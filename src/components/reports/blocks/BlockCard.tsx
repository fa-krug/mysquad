import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BlockCardProps {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}

export function BlockCard({ title, onRemove, children }: BlockCardProps) {
  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
