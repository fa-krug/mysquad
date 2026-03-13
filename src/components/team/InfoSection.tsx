import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { TeamMember, Title } from "@/lib/types";

interface InfoSectionProps {
  member: TeamMember;
  titles: Title[];
  onMemberChange: (field: string, value: string | null) => void;
}

// AutoSaveInput: renders a labeled text input with auto-save behavior
interface AutoSaveInputProps {
  label: string;
  initialValue: string | null;
  onSave: (value: string | null) => Promise<void>;
  type?: string;
  multiline?: boolean;
  className?: string;
}

function AutoSaveInput({
  label,
  initialValue,
  onSave,
  type = "text",
  multiline = false,
  className = "",
}: AutoSaveInputProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const { save, saving, saved, error } = useAutoSave({ onSave });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setValue(newVal);
    save(newVal === "" ? null : newVal);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {multiline ? (
        <textarea
          className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
          value={value}
          onChange={handleChange}
        />
      ) : (
        <Input type={type} value={value} onChange={handleChange} />
      )}
      <div className="h-3 text-xs">
        {saving && <span className="text-muted-foreground">Saving…</span>}
        {saved && !saving && <span className="text-green-600">Saved</span>}
        {error && <span className="text-destructive truncate">{error}</span>}
      </div>
    </div>
  );
}

export function InfoSection({ member, titles, onMemberChange }: InfoSectionProps) {
  const [titleId, setTitleId] = useState<string>(
    member.title_id != null ? String(member.title_id) : "",
  );
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const handleTitleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTitleId(val);
    setTitleSaving(true);
    setTitleError(null);
    try {
      await onMemberChange("title_id", val === "" ? null : val);
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : String(err));
    } finally {
      setTitleSaving(false);
    }
  };

  const makeOnSave = (field: string) => async (value: string | null) => {
    await onMemberChange(field, value);
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      {/* First name */}
      <AutoSaveInput
        key={`first_name-${member.id}`}
        label="First Name"
        initialValue={member.first_name}
        onSave={makeOnSave("first_name")}
      />

      {/* Last name */}
      <AutoSaveInput
        key={`last_name-${member.id}`}
        label="Last Name"
        initialValue={member.last_name}
        onSave={makeOnSave("last_name")}
      />

      {/* Work email */}
      <AutoSaveInput
        key={`email-${member.id}`}
        label="Work Email"
        initialValue={member.email}
        onSave={makeOnSave("email")}
        type="email"
      />

      {/* Title dropdown */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Title</Label>
        <select
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring dark:bg-input/30"
          value={titleId}
          onChange={handleTitleChange}
        >
          <option value="">No title</option>
          {titles.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="h-3 text-xs">
          {titleSaving && <span className="text-muted-foreground">Saving…</span>}
          {titleError && <span className="text-destructive truncate">{titleError}</span>}
        </div>
      </div>

      {/* Start date */}
      <AutoSaveInput
        key={`start_date-${member.id}`}
        label="Start Date"
        initialValue={member.start_date}
        onSave={makeOnSave("start_date")}
        type="date"
      />

      {/* Personal email */}
      <AutoSaveInput
        key={`personal_email-${member.id}`}
        label="Personal Email"
        initialValue={member.personal_email}
        onSave={makeOnSave("personal_email")}
        type="email"
      />

      {/* Personal phone */}
      <AutoSaveInput
        key={`personal_phone-${member.id}`}
        label="Personal Phone"
        initialValue={member.personal_phone}
        onSave={makeOnSave("personal_phone")}
        type="tel"
      />

      {/* Street address */}
      <AutoSaveInput
        key={`address_street-${member.id}`}
        label="Street Address"
        initialValue={member.address_street}
        onSave={makeOnSave("address_street")}
      />

      {/* City */}
      <AutoSaveInput
        key={`address_city-${member.id}`}
        label="City"
        initialValue={member.address_city}
        onSave={makeOnSave("address_city")}
      />

      {/* ZIP */}
      <AutoSaveInput
        key={`address_zip-${member.id}`}
        label="ZIP Code"
        initialValue={member.address_zip}
        onSave={makeOnSave("address_zip")}
      />

      {/* Notes - spans full width */}
      <AutoSaveInput
        key={`notes-${member.id}`}
        label="Notes"
        initialValue={member.notes}
        onSave={makeOnSave("notes")}
        multiline
        className="col-span-2"
      />

      {/* Stakeholder toggle */}
      <div className="col-span-2 flex items-center justify-between rounded-lg border border-input px-3 py-2">
        <div>
          <Label className="text-sm">Stakeholder</Label>
          <p className="text-xs text-muted-foreground">
            Not a direct report — excluded from the Salary Planner
          </p>
        </div>
        <Switch
          key={`exclude_salary-${member.id}`}
          checked={member.exclude_from_salary}
          onCheckedChange={(checked) => {
            onMemberChange("exclude_from_salary", checked ? "1" : "0");
          }}
        />
      </div>
    </div>
  );
}
