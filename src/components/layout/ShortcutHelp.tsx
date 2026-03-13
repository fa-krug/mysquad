import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ShortcutHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: "⌘ K", description: "Open command palette" },
  { keys: "⌘ N", description: "Create new item" },
  { keys: "⌘ ⌫", description: "Delete selected item" },
  { keys: "⌘ 1–5", description: "Navigate to page" },
  { keys: "↑ / ↓", description: "Move selection in list" },
  { keys: "Escape", description: "Deselect / close" },
  { keys: "⌘ /", description: "Show this help" },
];

export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <kbd className="rounded bg-muted px-2 py-1 text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
