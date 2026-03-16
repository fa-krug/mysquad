import { useState, useEffect, useCallback } from "react";
import { PlusIcon, Trash2Icon, Loader2Icon, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, ArrowUpRight } from "lucide-react";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import {
  getTeamMeetings,
  createTeamMeeting,
  deleteTeamMeeting,
  getTeamMeetingDetail,
  getPicturesDirPath,
  updateStatusItem,
  updateProjectStatusItem,
  updateTalkTopic,
  resolveEscalatedTopic,
  unresolveEscalatedTopic,
} from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import type {
  TeamMeeting,
  TeamMeetingDetail,
  TeamMeetingMemberGroup,
  TeamMeetingProjectGroup,
  ReportStatusItem,
  EscalatedTopic,
} from "@/lib/types";

function UpdateItem({
  text,
  checked,
  onToggle,
}: {
  text: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className="flex items-start gap-2 text-sm cursor-pointer select-none group"
      onClick={onToggle}
    >
      {checked ? (
        <CheckIcon className="size-3.5 mt-0.5 shrink-0 text-green-600 group-hover:opacity-70" />
      ) : (
        <span className="size-3.5 mt-0.5 shrink-0 rounded-sm border border-muted-foreground/40 group-hover:border-foreground" />
      )}
      <span className={checked ? "line-through text-muted-foreground" : ""}>{text}</span>
    </li>
  );
}

function EscalatedTopicItem({
  topic,
  onResolve,
  onEdit,
}: {
  topic: EscalatedTopic;
  onResolve: (resolved: boolean) => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(topic.text);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = editText.trim();
      if (trimmed && trimmed !== topic.text) {
        onEdit(trimmed);
      }
      setEditing(false);
    } else if (e.key === "Escape") {
      setEditText(topic.text);
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1 group">
      <Checkbox
        checked={topic.resolved}
        onCheckedChange={(checked) => onResolve(checked as boolean)}
      />
      {editing ? (
        <input
          className="flex-1 bg-transparent text-sm outline-none border-none focus:outline-none"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const trimmed = editText.trim();
            if (trimmed && trimmed !== topic.text) {
              onEdit(trimmed);
            }
            setEditing(false);
          }}
          autoFocus
        />
      ) : (
        <span
          className={`flex-1 text-sm cursor-text ${topic.resolved ? "line-through opacity-50" : ""}`}
          onClick={() => !topic.resolved && setEditing(true)}
        >
          {topic.text}
        </span>
      )}
      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 gap-0.5">
        <ArrowUpRight className="size-2.5" />
        Escalated
      </Badge>
    </div>
  );
}

function MemberGroupSection({
  group,
  picturesDir,
  onToggleUpdate,
  onResolveTopic,
  onEditTopic,
}: {
  group: TeamMeetingMemberGroup;
  picturesDir: string | null;
  onToggleUpdate: (item: ReportStatusItem) => void;
  onResolveTopic: (topicId: number, resolved: boolean) => void;
  onEditTopic: (topicId: number, text: string) => void;
}) {
  const hasContent = group.escalated_topics.length > 0 || group.updates.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <MemberAvatar
          firstName={group.first_name}
          lastName={group.last_name}
          picturePath={group.picture_path}
          picturesDir={picturesDir}
          size="sm"
        />
        <div>
          <span className="text-sm font-medium">
            {group.first_name} {group.last_name}
          </span>
          {group.title_name && (
            <span className="text-xs text-muted-foreground ml-2">{group.title_name}</span>
          )}
        </div>
      </div>

      {group.escalated_topics.length > 0 && (
        <div className="pl-[44px] space-y-0.5">
          {group.escalated_topics.map((topic) => (
            <EscalatedTopicItem
              key={topic.id}
              topic={topic}
              onResolve={(resolved) => onResolveTopic(topic.id, resolved)}
              onEdit={(text) => onEditTopic(topic.id, text)}
            />
          ))}
        </div>
      )}

      {group.updates.length > 0 && (
        <ul className="pl-[44px] space-y-0.5">
          {group.updates.map((u) => (
            <UpdateItem
              key={u.id}
              text={u.text}
              checked={u.checked}
              onToggle={() => onToggleUpdate(u)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectGroupSection({
  group,
  onToggleUpdate,
}: {
  group: TeamMeetingProjectGroup;
  onToggleUpdate: (item: ReportStatusItem) => void;
}) {
  if (group.updates.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{group.project_name}</span>
      <ul className="space-y-0.5 pl-2">
        {group.updates.map((u) => (
          <UpdateItem
            key={u.id}
            text={u.text}
            checked={u.checked}
            onToggle={() => onToggleUpdate(u)}
          />
        ))}
      </ul>
    </div>
  );
}

function TeamMeetingDetailView({
  meeting,
  onDelete,
}: {
  meeting: TeamMeeting;
  onDelete: () => void;
}) {
  const [detail, setDetail] = useState<TeamMeetingDetail | null>(null);
  const [picturesDir, setPicturesDir] = useState<string | null>(null);

  useEffect(() => {
    getTeamMeetingDetail(meeting.id)
      .then(setDetail)
      .catch(() => showError("Failed to load team meeting"));
    getPicturesDirPath()
      .then(setPicturesDir)
      .catch(() => {});
  }, [meeting.id]);

  const toggleMemberUpdate = useCallback((item: ReportStatusItem) => {
    const newChecked = !item.checked;
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        member_groups: prev.member_groups.map((g) => ({
          ...g,
          updates: g.updates.map((u) => (u.id === item.id ? { ...u, checked: newChecked } : u)),
        })),
      };
    });
    updateStatusItem(item.id, undefined, newChecked).catch(() => {
      showError("Failed to update");
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          member_groups: prev.member_groups.map((g) => ({
            ...g,
            updates: g.updates.map((u) => (u.id === item.id ? { ...u, checked: !newChecked } : u)),
          })),
        };
      });
    });
  }, []);

  const toggleProjectUpdate = useCallback((item: ReportStatusItem) => {
    const newChecked = !item.checked;
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        project_groups: prev.project_groups.map((g) => ({
          ...g,
          updates: g.updates.map((u) => (u.id === item.id ? { ...u, checked: newChecked } : u)),
        })),
      };
    });
    updateProjectStatusItem(item.id, undefined, newChecked).catch(() => {
      showError("Failed to update");
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          project_groups: prev.project_groups.map((g) => ({
            ...g,
            updates: g.updates.map((u) => (u.id === item.id ? { ...u, checked: !newChecked } : u)),
          })),
        };
      });
    });
  }, []);

  const handleResolveTopic = useCallback(async (topicId: number, resolved: boolean) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        member_groups: prev.member_groups.map((g) => ({
          ...g,
          escalated_topics: g.escalated_topics.map((t) =>
            t.id === topicId ? { ...t, resolved } : t,
          ),
        })),
      };
    });
    try {
      if (resolved) {
        await resolveEscalatedTopic(topicId);
      } else {
        await unresolveEscalatedTopic(topicId);
      }
    } catch {
      showError("Failed to update topic");
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          member_groups: prev.member_groups.map((g) => ({
            ...g,
            escalated_topics: g.escalated_topics.map((t) =>
              t.id === topicId ? { ...t, resolved: !resolved } : t,
            ),
          })),
        };
      });
    }
  }, []);

  const handleEditTopic = useCallback(async (topicId: number, text: string) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        member_groups: prev.member_groups.map((g) => ({
          ...g,
          escalated_topics: g.escalated_topics.map((t) => (t.id === topicId ? { ...t, text } : t)),
        })),
      };
    });
    try {
      await updateTalkTopic(topicId, text, undefined);
    } catch {
      showError("Failed to update topic");
    }
  }, []);

  if (!detail) return null;

  const hasMembers = detail.member_groups.some(
    (g) => g.escalated_topics.length > 0 || g.updates.length > 0,
  );
  const hasProjects = detail.project_groups.some((g) => g.updates.length > 0);
  const hasContent = hasMembers || hasProjects;

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Team Meeting</h2>
          <Badge variant="outline" className="gap-1">
            <CalendarIcon className="size-3" />
            {detail.date}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>

      {!hasContent && (
        <p className="text-sm text-muted-foreground">
          No escalated topics, member updates, or project updates to show.
        </p>
      )}

      {hasMembers && (
        <>
          <Separator />
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Team Members
            </h3>
            {detail.member_groups.map((g) => (
              <MemberGroupSection
                key={g.member_id}
                group={g}
                picturesDir={picturesDir}
                onToggleUpdate={toggleMemberUpdate}
                onResolveTopic={handleResolveTopic}
                onEditTopic={handleEditTopic}
              />
            ))}
          </div>
        </>
      )}

      {hasProjects && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Projects
            </h3>
            {detail.project_groups.map((g) => (
              <ProjectGroupSection
                key={g.project_id}
                group={g}
                onToggleUpdate={toggleProjectUpdate}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TeamMeetings() {
  const [meetings, setMeetings] = useState<TeamMeeting[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const loadMeetings = useCallback(async () => {
    const m = await getTeamMeetings();
    setMeetings(m);
    return m;
  }, []);

  useEffect(() => {
    loadMeetings()
      .catch(() => showError("Failed to load team meetings"))
      .finally(() => setLoading(false));
  }, [loadMeetings]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await createTeamMeeting();
      await loadMeetings();
      setSelectedId(created.id);
      showSuccess("Team meeting created");
    } catch {
      showError("Failed to create team meeting");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    await deleteTeamMeeting(id);
    await loadMeetings();
  };

  const selectedMeeting = meetings.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left panel - list */}
      <div className="w-64 shrink-0 border-r flex flex-col h-full">
        <div className="flex items-center justify-between px-3 h-12 border-b">
          <span className="text-sm font-semibold">Team Meetings</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCreate}
            disabled={creating}
            title="New team meeting"
          >
            {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : meetings.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No team meetings yet
            </div>
          ) : (
            <ul className="py-1">
              {meetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selectedId === meeting.id ? "bg-muted" : ""
                  }`}
                  onClick={() => setSelectedId(meeting.id)}
                  onMouseEnter={() => setHoveredId(meeting.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{meeting.date}</div>
                    {meeting.escalated_topic_count > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {meeting.escalated_topic_count} escalated{" "}
                        {meeting.escalated_topic_count === 1 ? "topic" : "topics"}
                      </div>
                    )}
                  </div>

                  {hoveredId === meeting.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(meeting.id);
                      }}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right panel - detail */}
      <div className="flex-1 overflow-auto">
        {selectedMeeting ? (
          <TeamMeetingDetailView
            key={selectedMeeting.id}
            meeting={selectedMeeting}
            onDelete={() => handleDelete(selectedMeeting.id)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a team meeting or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
