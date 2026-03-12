import { useState, useEffect } from "react";
import { XIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckableList } from "@/components/team/CheckableList";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  updateProject,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectStatusItems,
  addProjectStatusItem,
  updateProjectStatusItem,
  deleteProjectStatusItem,
  getTeamMembers,
} from "@/lib/db";
import type {
  Project,
  ProjectMember,
  ProjectStatusItem,
  BaseCheckableItem,
  TeamMember,
} from "@/lib/types";

interface ProjectDetailProps {
  project: Project;
  onProjectChange: (field: string, value: string | null) => void;
}

export function ProjectDetail({ project, onProjectChange }: ProjectDetailProps) {
  const [name, setName] = useState(project.name);
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>([]);
  const [statusItems, setStatusItems] = useState<ProjectStatusItem[]>([]);

  useEffect(() => {
    getProjectMembers(project.id).then(setMembers);
    getProjectStatusItems(project.id).then(setStatusItems);
    getTeamMembers().then(setAllTeamMembers);
  }, [project.id]);

  const { save: saveName } = useAutoSave({
    onSave: async (val) => {
      if (val != null && val !== project.name) {
        await updateProject(project.id, "name", val);
        onProjectChange("name", val);
      }
    },
  });

  const { save: saveEndDate } = useAutoSave({
    onSave: async (val) => {
      if (val !== undefined) {
        const v = val || null;
        await updateProject(project.id, "end_date", v);
        onProjectChange("end_date", v);
      }
    },
  });

  const { save: saveNotes } = useAutoSave({
    onSave: async (val) => {
      if (val !== undefined) {
        const v = val || null;
        await updateProject(project.id, "notes", v);
        onProjectChange("notes", v);
      }
    },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    saveName(e.target.value);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    saveEndDate(e.target.value);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    saveNotes(e.target.value);
  };

  const handleAddMember = async (teamMemberId: number) => {
    const member = await addProjectMember(project.id, teamMemberId);
    setMembers((prev) => [...prev, member]);
  };

  const handleRemoveMember = async (id: number) => {
    await removeProjectMember(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const assignedIds = new Set(members.map((m) => m.team_member_id));
  const availableMembers = allTeamMembers.filter((m) => !assignedIds.has(m.id));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl space-y-6 p-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={handleNameChange}
            placeholder="Project name"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <div className="text-sm text-muted-foreground py-2">{project.start_date}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-end-date">End Date</Label>
            <Input
              id="project-end-date"
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
            />
          </div>
        </div>

        <Separator />

        {/* Team Members */}
        <div className="space-y-2">
          <Label>Team Members</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
              >
                {m.first_name} {m.last_name}
                <button
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveMember(m.id)}
                  title="Remove member"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {availableMembers.length > 0 && (
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) handleAddMember(id);
              }}
            >
              <option value="">Add a team member...</option>
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <Separator />

        {/* Status Items */}
        <CheckableList
          title="Status"
          items={statusItems as BaseCheckableItem[]}
          onAdd={(text) => addProjectStatusItem(project.id, text) as Promise<BaseCheckableItem>}
          onUpdate={(id, text, checked) => updateProjectStatusItem(id, text, checked)}
          onDelete={deleteProjectStatusItem}
          onItemsChange={(items) => setStatusItems(items as ProjectStatusItem[])}
        />

        <Separator />

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="project-notes">Notes</Label>
          <Textarea
            id="project-notes"
            value={notes}
            onChange={handleNotesChange}
            placeholder="Write notes in markdown..."
            className="min-h-[120px] font-mono text-sm"
          />
          {notes && (
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-4">
              <ReactMarkdown>{notes}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
