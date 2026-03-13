import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Title, TeamMember } from "@/lib/types";
import { useAutoSave } from "@/hooks/useAutoSave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TitleDetailProps {
  title: Title;
  members: TeamMember[];
  onTitleChange: (field: string, value: string) => void;
  focusName?: boolean;
}

export function TitleDetail({ title, members, onTitleChange, focusName }: TitleDetailProps) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title.name);
  const {
    save: saveName,
    saving,
    saved,
    error,
  } = useAutoSave({
    onSave: async (val) => {
      onTitleChange("name", val ?? "");
    },
  });

  useEffect(() => {
    if (focusName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [focusName]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setName(newVal);
    saveName(newVal === "" ? null : newVal);
  };

  const titleMembers = members.filter((m) => (m.current_title_id ?? m.title_id) === title.id);

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Title Name</Label>
        <Input ref={nameRef} value={name} onChange={handleNameChange} />
        <div className="h-3 text-xs">
          {saving && <span className="text-muted-foreground">Saving…</span>}
          {saved && !saving && <span className="text-green-600">Saved</span>}
          {error && <span className="text-destructive truncate">{error}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Members ({titleMembers.length})</h3>
        {titleMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members with this title</p>
        ) : (
          <ul className="space-y-1">
            {titleMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50 text-sm"
                onClick={() => navigate("/", { state: { memberId: member.id } })}
              >
                <span>
                  {member.last_name}, {member.first_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
