import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  PlusIcon,
  XIcon,
  CheckIcon,
  CalendarIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import {
  getMeetingDetail,
  addMeetingUpdate,
  checkTalkTopicInMeeting,
  updateStatusItem,
  deleteStatusItem,
  deleteMeeting,
  getPicturesDirPath,
} from "@/lib/db";
import { showError } from "@/lib/toast";
import type { MeetingDetail } from "@/lib/types";

export function Meeting() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [picturesDir, setPicturesDir] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = Number(meetingId);

  useEffect(() => {
    if (!id) return;
    getMeetingDetail(id)
      .then(setDetail)
      .catch(() => showError("Failed to load meeting"));
    getPicturesDirPath()
      .then(setPicturesDir)
      .catch(() => {});
  }, [id]);

  const handleCheckTopic = useCallback(
    async (topicId: number, checked: boolean) => {
      try {
        await checkTalkTopicInMeeting(topicId, id, checked);
        // Refresh to get updated topic lists
        const updated = await getMeetingDetail(id);
        setDetail(updated);
      } catch {
        showError("Failed to update topic");
      }
    },
    [id],
  );

  const handleStartAdd = () => {
    setAdding(true);
    setNewText("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancelAdd = () => {
    setAdding(false);
    setNewText("");
  };

  const handleCommitAdd = async () => {
    const trimmed = newText.trim();
    if (!trimmed || !detail) {
      handleCancelAdd();
      return;
    }
    try {
      const created = await addMeetingUpdate(id, detail.team_member_id, trimmed);
      setDetail((prev) =>
        prev ? { ...prev, meeting_updates: [...prev.meeting_updates, created] } : prev,
      );
      setNewText("");
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      showError("Failed to add update");
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

  const handleUpdateCheck = async (itemId: number, checked: boolean) => {
    try {
      await updateStatusItem(itemId, undefined, checked);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              meeting_updates: prev.meeting_updates.map((u) =>
                u.id === itemId ? { ...u, checked } : u,
              ),
            }
          : prev,
      );
    } catch {
      showError("Failed to update");
    }
  };

  const handleDeleteUpdate = async (itemId: number) => {
    try {
      await deleteStatusItem(itemId);
      setDetail((prev) =>
        prev
          ? { ...prev, meeting_updates: prev.meeting_updates.filter((u) => u.id !== itemId) }
          : prev,
      );
    } catch {
      showError("Failed to delete update");
    }
  };

  const handleDeleteMeeting = async () => {
    try {
      await deleteMeeting(id);
      navigate(-1);
    } catch {
      showError("Failed to delete meeting");
    }
  };

  const handleEndMeeting = () => {
    navigate(-1);
  };

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  const { member } = detail;
  const hasUpdates = detail.meeting_updates.length > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl p-6 space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Meeting</h1>
              <Badge variant="outline" className="gap-1">
                <CalendarIcon className="size-3" />
                {detail.date}
              </Badge>
            </div>
          </div>
        </div>

        {/* Member info card */}
        <div className="flex items-center gap-4 rounded-lg border p-4">
          <MemberAvatar
            firstName={member.first_name}
            lastName={member.last_name}
            picturePath={member.picture_path}
            picturesDir={picturesDir}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              {member.first_name} {member.last_name}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              {member.title_name && <span>{member.title_name}</span>}
              {member.start_date && (
                <>
                  {member.title_name && <span>·</span>}
                  <span>Since {member.start_date}</span>
                </>
              )}
              {member.lead_name && (
                <>
                  <span>·</span>
                  <span>Lead: {member.lead_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Previous updates */}
        {detail.previous_updates.length > 0 && (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">Previous Updates</span>
              <div className="rounded-lg border p-3 space-y-1">
                {detail.previous_updates.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 py-0.5 text-sm ${item.checked ? "opacity-50 line-through" : ""}`}
                  >
                    {item.checked ? (
                      <CheckIcon className="size-3.5 shrink-0 text-green-600" />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded-sm border border-muted-foreground/40" />
                    )}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Talk topics (agenda) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Talk Topics</span>
            {detail.talk_topics.length === 0 && detail.meeting_talk_topics.length === 0 && (
              <span className="text-xs text-muted-foreground">No open topics</span>
            )}
          </div>

          {/* Topics checked off in this meeting */}
          {detail.meeting_talk_topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-2 py-1">
              <Checkbox checked={true} onCheckedChange={() => handleCheckTopic(topic.id, false)} />
              <span className="text-sm opacity-50 line-through">{topic.text}</span>
            </div>
          ))}

          {/* Open topics */}
          {detail.talk_topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-2 py-1">
              <Checkbox checked={false} onCheckedChange={() => handleCheckTopic(topic.id, true)} />
              <span className="text-sm">{topic.text}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Meeting updates (outcomes) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Updates
              {!hasUpdates && (
                <span className="ml-2 text-xs font-normal text-amber-600">
                  Add at least one update
                </span>
              )}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={handleStartAdd} title="Add update">
              <PlusIcon />
            </Button>
          </div>

          {detail.meeting_updates.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 py-1 group ${item.checked ? "opacity-50" : ""}`}
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={(checked) => handleUpdateCheck(item.id, checked as boolean)}
              />
              <span className={`flex-1 text-sm ${item.checked ? "line-through" : ""}`}>
                {item.text}
              </span>
              <button
                className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={() => handleDeleteUpdate(item.id)}
                title="Delete"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}

          {adding && (
            <div className="flex items-center gap-2 py-1">
              <input
                ref={inputRef}
                className="flex-1 h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 placeholder:text-muted-foreground"
                placeholder="What's the update?"
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

          {!hasUpdates && !adding && (
            <button
              onClick={handleStartAdd}
              className="w-full rounded-lg border border-dashed border-muted-foreground/40 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              Add your first update...
            </button>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={handleDeleteMeeting}
          >
            Delete Meeting
          </Button>
          <Button onClick={handleEndMeeting} disabled={!hasUpdates}>
            End Meeting
          </Button>
        </div>
      </div>
    </div>
  );
}
