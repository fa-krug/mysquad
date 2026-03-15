import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { useAutoSave } from "@/hooks/useAutoSave";
import { getSubtreeIds } from "@/lib/tree-utils";
import { required, email, phone, zip } from "@/lib/validators";
import type { TeamMember, Title } from "@/lib/types";

interface InfoSectionProps {
  member: TeamMember;
  members: TeamMember[];
  titles: Title[];
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => Promise<void>;
}

// AutoSaveInput: renders a labeled text input with auto-save behavior and validation
interface AutoSaveInputProps {
  label: string;
  initialValue: string | null;
  onSave: (value: string | null) => Promise<void>;
  validate?: (value: string | null) => string | null;
  type?: string;
  multiline?: boolean;
  className?: string;
}

function AutoSaveInput({
  label,
  initialValue,
  onSave,
  validate,
  type = "text",
  multiline = false,
  className = "",
}: AutoSaveInputProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const { save, error } = useAutoSave({ onSave, validate });

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
          className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          value={value}
          onChange={handleChange}
          aria-invalid={!!error || undefined}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={handleChange}
          aria-invalid={!!error || undefined}
        />
      )}
      <div className="h-3 text-xs">
        {error && <span className="text-destructive truncate">{error}</span>}
      </div>
    </div>
  );
}

interface AutoSaveDatePickerProps {
  label: string;
  initialValue: string | null;
  onSave: (value: string | null) => Promise<void>;
}

function AutoSaveDatePicker({ label, initialValue, onSave }: AutoSaveDatePickerProps) {
  const [value, setValue] = useState(initialValue);
  const { save } = useAutoSave({ onSave });

  const handleChange = (newVal: string | null) => {
    setValue(newVal);
    save(newVal);
  };

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <DatePicker value={value} onChange={handleChange} clearable />
    </div>
  );
}

export function InfoSection({ member, members, titles, onMemberChange }: InfoSectionProps) {
  const navigate = useNavigate();
  const [titleId, setTitleId] = useState<string>(
    member.title_id != null ? String(member.title_id) : "",
  );

  const [leadId, setLeadId] = useState<string>(
    member.lead_id != null ? String(member.lead_id) : "",
  );

  const subtreeIds = useMemo(() => getSubtreeIds(members, member.id), [members, member.id]);

  const leadOptions = useMemo(
    () => members.filter((m) => m.id !== member.id && !m.left_date && !subtreeIds.has(m.id)),
    [members, member.id, subtreeIds],
  );

  const handleLeadChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLeadId(val);
    try {
      await onMemberChange("lead_id", val === "" ? null : val);
    } catch {
      // silently handled
    }
  };

  const handleTitleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTitleId(val);
    try {
      const selectedTitle = titles.find((t) => String(t.id) === val);
      await onMemberChange("title_id", val === "" ? null : val, selectedTitle?.name ?? null);
    } catch {
      // silently handled
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
        validate={required("First name")}
      />

      {/* Last name */}
      <AutoSaveInput
        key={`last_name-${member.id}`}
        label="Last Name"
        initialValue={member.last_name}
        onSave={makeOnSave("last_name")}
        validate={required("Last name")}
      />

      {/* Work email */}
      <AutoSaveInput
        key={`email-${member.id}`}
        label="Work Email"
        initialValue={member.email}
        onSave={makeOnSave("email")}
        type="email"
        validate={email}
      />

      {/* Original title dropdown */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Original Title</Label>
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
      </div>

      {/* Lead */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Lead</Label>
        <select
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring dark:bg-input/30"
          value={leadId}
          onChange={handleLeadChange}
        >
          <option value="">No lead</option>
          {leadOptions.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.last_name}, {m.first_name}
              {m.current_title_name ? ` — ${m.current_title_name}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Current title (read-only, derived from data points) */}
      {member.current_title_name && member.current_title_name !== member.title_name && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Current Title</Label>
          <div className="flex items-center h-8 text-sm">
            <span>{member.current_title_name}</span>
            {member.current_title_data_point_id && (
              <button
                type="button"
                className="ml-2 text-xs text-primary hover:underline"
                onClick={() =>
                  navigate("/salary", {
                    state: { dataPointId: member.current_title_data_point_id },
                  })
                }
              >
                View data point
              </button>
            )}
          </div>
        </div>
      )}

      {/* Start date */}
      <AutoSaveDatePicker
        key={`start_date-${member.id}`}
        label="Start Date"
        initialValue={member.start_date}
        onSave={makeOnSave("start_date")}
      />

      {/* Leave date */}
      <AutoSaveDatePicker
        key={`left_date-${member.id}`}
        label="Leave Date"
        initialValue={member.left_date}
        onSave={makeOnSave("left_date")}
      />

      {/* Personal email */}
      <AutoSaveInput
        key={`personal_email-${member.id}`}
        label="Personal Email"
        initialValue={member.personal_email}
        onSave={makeOnSave("personal_email")}
        type="email"
        validate={email}
      />

      {/* Personal phone */}
      <AutoSaveInput
        key={`personal_phone-${member.id}`}
        label="Personal Phone"
        initialValue={member.personal_phone}
        onSave={makeOnSave("personal_phone")}
        type="tel"
        validate={phone}
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
        validate={zip}
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

      {/* Former member with active reports warning */}
      {member.left_date &&
        (() => {
          const activeReportCount = members.filter(
            (m) => m.lead_id === member.id && !m.left_date,
          ).length;
          return activeReportCount > 0 ? (
            <div className="col-span-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
              This former member is still listed as lead for {activeReportCount} active member
              {activeReportCount !== 1 ? "s" : ""}.
            </div>
          ) : null;
        })()}
    </div>
  );
}
