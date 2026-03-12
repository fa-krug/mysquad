import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { InfoSection } from "./InfoSection";
import { ChildrenList } from "./ChildrenList";
import { CheckableList } from "./CheckableList";
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
} from "@/lib/db";
import type { TeamMember, CheckableItem, Title } from "@/lib/types";

interface MemberDetailProps {
  member: TeamMember;
  onMemberChange: (field: string, value: string | null) => void;
}

export function MemberDetail({ member, onMemberChange }: MemberDetailProps) {
  const [statusItems, setStatusItems] = useState<CheckableItem[]>([]);
  const [talkTopics, setTalkTopics] = useState<CheckableItem[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);

  useEffect(() => {
    getStatusItems(member.id).then(setStatusItems);
    getTalkTopics(member.id).then(setTalkTopics);
    getTitles().then(setTitles);
  }, [member.id]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl space-y-6 p-6">
        <InfoSection member={member} titles={titles} onMemberChange={onMemberChange} />
        <ChildrenList teamMemberId={member.id} />
        <Separator />
        <CheckableList
          title="Status"
          items={statusItems}
          onAdd={(text) => addStatusItem(member.id, text)}
          onUpdate={(id, text, checked) => updateStatusItem(id, text, checked)}
          onDelete={deleteStatusItem}
          onItemsChange={setStatusItems}
        />
        <Separator />
        <CheckableList
          title="Talk Topics"
          items={talkTopics}
          onAdd={(text) => addTalkTopic(member.id, text)}
          onUpdate={(id, text, checked) => updateTalkTopic(id, text, checked)}
          onDelete={deleteTalkTopic}
          onItemsChange={setTalkTopics}
        />
      </div>
    </div>
  );
}
