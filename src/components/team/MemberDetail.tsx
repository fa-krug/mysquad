import { useState, useEffect } from "react";
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
import type { TeamMember, CheckableItem, Title } from "@/lib/types";

interface MemberDetailProps {
  member: TeamMember;
  onMemberChange: (field: string, value: string | null) => void;
  picturesDir: string | null;
}

export function MemberDetail({ member, onMemberChange, picturesDir }: MemberDetailProps) {
  const [statusItems, setStatusItems] = useState<CheckableItem[]>([]);
  const [talkTopics, setTalkTopics] = useState<CheckableItem[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [picturePath, setPicturePath] = useState<string | null>(member.picture_path);
  const [cacheKey, setCacheKey] = useState<number>(0);
  const [pictureError, setPictureError] = useState<string | null>(null);

  useEffect(() => {
    getStatusItems(member.id).then(setStatusItems);
    getTalkTopics(member.id).then(setTalkTopics);
    getTitles().then(setTitles);
  }, [member.id]);

  const handleUploadPicture = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof selected !== "string") return;
    try {
      await uploadMemberPicture(member.id, selected);
      setPicturePath(`${member.id}.jpg`);
      setCacheKey(Date.now());
      setPictureError(null);
      onMemberChange("picture_path", `${member.id}.jpg`);
    } catch (err) {
      setPictureError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeletePicture = async () => {
    try {
      await deleteMemberPicture(member.id);
      setPicturePath(null);
      setPictureError(null);
      onMemberChange("picture_path", null);
    } catch (err) {
      setPictureError(err instanceof Error ? err.message : String(err));
    }
  };

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
            onUpload={handleUploadPicture}
            onDelete={handleDeletePicture}
          />
          <div>
            <h2 className="text-lg font-semibold">
              {member.first_name} {member.last_name}
            </h2>
            {member.title_name && (
              <p className="text-sm text-muted-foreground">{member.title_name}</p>
            )}
            {pictureError && <p className="text-xs text-destructive">{pictureError}</p>}
          </div>
        </div>
        <InfoSection member={member} titles={titles} onMemberChange={onMemberChange} />
        <ChildrenList teamMemberId={member.id} />
        <Separator />
        <CheckableList
          title="Status"
          items={statusItems}
          onAdd={(text) => addStatusItem(member.id, text)}
          onUpdate={(id, text, checked) => updateStatusItem(id, text, checked)}
          onDelete={deleteStatusItem}
          onItemsChange={(items) => setStatusItems(items as CheckableItem[])}
        />
        <Separator />
        <CheckableList
          title="Talk Topics"
          items={talkTopics}
          onAdd={(text) => addTalkTopic(member.id, text)}
          onUpdate={(id, text, checked) => updateTalkTopic(id, text, checked)}
          onDelete={deleteTalkTopic}
          onItemsChange={(items) => setTalkTopics(items as CheckableItem[])}
        />
      </div>
    </div>
  );
}
