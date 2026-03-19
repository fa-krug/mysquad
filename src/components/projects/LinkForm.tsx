import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LinkFormProps {
  initialUrl?: string;
  initialLabel?: string;
  onSubmit: (url: string, label: string) => void;
  onCancel: () => void;
}

export function LinkForm({
  initialUrl = "",
  initialLabel = "",
  onSubmit,
  onCancel,
}: LinkFormProps) {
  const [url, setUrl] = useState(initialUrl);
  const [label, setLabel] = useState(initialLabel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim(), label.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL or file path..."
        className="h-8 flex-1 text-sm"
        autoFocus
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="h-8 w-32 text-sm"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={!url.trim()}
      >
        <CheckIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onCancel}
      >
        <XIcon className="size-4" />
      </Button>
    </form>
  );
}
