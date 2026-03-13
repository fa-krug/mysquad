import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Separator } from "@/components/ui/separator";
import { InfoSection } from "./InfoSection";
import { ChildrenList } from "./ChildrenList";
import { CheckableList } from "./CheckableList";
import { MemberAvatar } from "./MemberAvatar";
import {
  getStatusItems,
  getTalkTopics,
  addStatusItem,
  addTalkTopic,
  updateStatusItem,
  updateTalkTopic,
  deleteStatusItem,
  deleteTalkTopic,
  getTitles,
  uploadMemberPicture,
  deleteMemberPicture,
} from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { showSuccess, showError } from "@/lib/toast";
import type { TeamMember, CheckableItem, Title, BaseCheckableItem } from "@/lib/types";

interface MemberDetailProps {
  member: TeamMember;
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => void;
  picturesDir: string | null;
}

export function MemberDetail({ member, onMemberChange, picturesDir }: MemberDetailProps) {
  const [statusItems, setStatusItems] = useState<CheckableItem[]>([]);
  const [talkTopics, setTalkTopics] = useState<CheckableItem[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [picturePath, setPicturePath] = useState<string | null>(member.picture_path);
  const [cacheKey, setCacheKey] = useState<number>(0);
  const [pictureLoading, setPictureLoading] = useState(false);

  useEffect(() => {
    getStatusItems(member.id)
      .then(setStatusItems)
      .catch(() => showError("Failed to load status items"));
    getTalkTopics(member.id)
      .then(setTalkTopics)
      .catch(() => showError("Failed to load talk topics"));
    getTitles()
      .then(setTitles)
      .catch(() => showError("Failed to load titles"));
  }, [member.id]);

  const handleUploadPicture = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof selected !== "string") return;
    setPictureLoading(true);
    try {
      await uploadMemberPicture(member.id, selected);
      setPicturePath(`${member.id}.jpg`);
      setCacheKey(Date.now());
      onMemberChange("picture_path", `${member.id}.jpg`);
      showSuccess("Picture uploaded");
    } catch (err) {
      showError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPictureLoading(false);
    }
  }, [member.id, onMemberChange]);

  const handleDeletePicture = useCallback(async () => {
    setPictureLoading(true);
    try {
      await deleteMemberPicture(member.id);
      setPicturePath(null);
      onMemberChange("picture_path", null);
    } catch (err) {
      showError(`Failed to delete picture: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPictureLoading(false);
    }
  }, [member.id, onMemberChange]);

  const handleStatusAdd = useCallback(
    (text: string) => addStatusItem(member.id, text),
    [member.id],
  );

  const handleStatusUpdate = useCallback(
    (id: number, text?: string, checked?: boolean) => updateStatusItem(id, text, checked),
    [],
  );

  const handleStatusItemsChange = useCallback(
    (
      itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[]),
    ) => {
      setStatusItems((prev) => {
        const next = typeof itemsOrUpdater === "function" ? itemsOrUpdater(prev) : itemsOrUpdater;
        return next as CheckableItem[];
      });
    },
    [],
  );

  const handleTopicAdd = useCallback((text: string) => addTalkTopic(member.id, text), [member.id]);

  const handleTopicUpdate = useCallback(
    (id: number, text?: string, checked?: boolean) => updateTalkTopic(id, text, checked),
    [],
  );

  const handleTopicItemsChange = useCallback(
    (
      itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[]),
    ) => {
      setTalkTopics((prev) => {
        const next = typeof itemsOrUpdater === "function" ? itemsOrUpdater(prev) : itemsOrUpdater;
        return next as CheckableItem[];
      });
    },
    [],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl space-y-6 p-6">
        <div className="flex items-center gap-4">
          <MemberAvatar
            firstName={member.first_name}
            lastName={member.last_name}
            picturePath={picturePath}
            picturesDir={picturesDir}
            size="lg"
            cacheKey={cacheKey}
            loading={pictureLoading}
            onUpload={handleUploadPicture}
            onDelete={handleDeletePicture}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {member.first_name} {member.last_name}
              </h2>
              {member.left_date && <Badge variant="secondary">Left</Badge>}
            </div>
            {member.current_title_name && (
              <p className="text-sm text-muted-foreground">{member.current_title_name}</p>
            )}
          </div>
        </div>
        <InfoSection member={member} titles={titles} onMemberChange={onMemberChange} />
        <ChildrenList teamMemberId={member.id} />
        <Separator />
        <CheckableList
          title="Status"
          items={statusItems}
          onAdd={handleStatusAdd}
          onUpdate={handleStatusUpdate}
          onDelete={deleteStatusItem}
          onItemsChange={handleStatusItemsChange}
        />
        <Separator />
        <CheckableList
          title="Talk Topics"
          items={talkTopics}
          onAdd={handleTopicAdd}
          onUpdate={handleTopicUpdate}
          onDelete={deleteTalkTopic}
          onItemsChange={handleTopicItemsChange}
        />
      </div>
    </div>
  );
}
