import { useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { CheckableItem } from "@/lib/types";

interface CheckableListProps {
  title: string;
  items: CheckableItem[];
  onAdd: (text: string) => Promise<CheckableItem>;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onItemsChange: (items: CheckableItem[]) => void;
}

interface ItemRowProps {
  item: CheckableItem;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onItemsChange: (updater: (prev: CheckableItem[]) => CheckableItem[]) => void;
}

function ItemRow({ item, onUpdate, onDelete, onItemsChange }: ItemRowProps) {
  const [text, setText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const { save } = useAutoSave({
    onSave: async (val) => {
      if (val != null && val !== item.text) {
        await onUpdate(item.id, val, undefined);
        onItemsChange((prev) => prev.map((i) => (i.id === item.id ? { ...i, text: val } : i)));
      }
    },
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    save(e.target.value);
  };

  const handleCheckedChange = async (checked: boolean) => {
    await onUpdate(item.id, undefined, checked);
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)));
  };

  const handleDelete = async () => {
    await onDelete(item.id);
    onItemsChange((prev) => prev.filter((i) => i.id !== item.id));
  };

  return (
    <div className={`flex items-center gap-2 py-1 group ${item.checked ? "opacity-50" : ""}`}>
      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => {
          handleCheckedChange(checked);
        }}
      />
      {item.checked ? (
        <span className="flex-1 text-sm line-through text-muted-foreground select-none">
          {text}
        </span>
      ) : (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm outline-none border-none focus:outline-none placeholder:text-muted-foreground"
          value={text}
          onChange={handleTextChange}
        />
      )}
      <button
        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        onClick={handleDelete}
        title="Delete"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

export function CheckableList({
  title,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onItemsChange,
}: CheckableListProps) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartAdd = () => {
    setAdding(true);
    setNewText("");
    setAddError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancelAdd = () => {
    setAdding(false);
    setNewText("");
    setAddError(null);
  };

  const handleCommitAdd = async () => {
    const trimmed = newText.trim();
    if (!trimmed) {
      handleCancelAdd();
      return;
    }
    try {
      const created = await onAdd(trimmed);
      onItemsChange([...items, created]);
      setAdding(false);
      setNewText("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitAdd();
    } else if (e.key === "Escape") {
      handleCancelAdd();
    }
  };

  const handleItemsUpdater = (updater: (prev: CheckableItem[]) => CheckableItem[]) => {
    onItemsChange(updater(items));
  };

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <Button variant="ghost" size="icon-sm" onClick={handleStartAdd} title={`Add ${title}`}>
          <PlusIcon />
        </Button>
      </div>

      {/* Inline add input */}
      {adding && (
        <div className="flex items-center gap-2 py-1">
          <input
            ref={inputRef}
            className="flex-1 h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 placeholder:text-muted-foreground"
            placeholder="Add item…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button size="sm" onClick={handleCommitAdd}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancelAdd}>
            Cancel
          </Button>
        </div>
      )}

      {addError && <div className="text-xs text-destructive">{addError}</div>}

      {/* Unchecked items */}
      {unchecked.length === 0 && checked.length === 0 && !adding && (
        <div className="text-sm text-muted-foreground py-1">No items yet</div>
      )}

      {unchecked.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onItemsChange={handleItemsUpdater}
        />
      ))}

      {/* Checked (completed) items */}
      {checked.length > 0 && (
        <div className="mt-1">
          {checked.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onItemsChange={handleItemsUpdater}
            />
          ))}
        </div>
      )}
    </div>
  );
}
