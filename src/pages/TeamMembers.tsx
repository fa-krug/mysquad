import { useState, useEffect, useCallback } from "react";
import { MemberList } from "@/components/team/MemberList";
import { MemberDetail } from "@/components/team/MemberDetail";
import { getTeamMembers, createTeamMember, deleteTeamMember } from "@/lib/db";
import type { TeamMember } from "@/lib/types";

export function TeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadMembers = useCallback(async () => {
    const data = await getTeamMembers();
    setMembers(data);
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleCreate = async () => {
    const member = await createTeamMember();
    await loadMembers();
    setSelectedId(member.id);
  };

  const handleDelete = async (id: number) => {
    await deleteTeamMember(id);
    if (selectedId === id) setSelectedId(null);
    await loadMembers();
  };

  const handleMemberChange = (field: string, value: string | null) => {
    setMembers((prev) => prev.map((m) => m.id === selectedId ? { ...m, [field]: value } : m));
  };

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <MemberList
        members={members}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1">
        {selectedMember ? (
          <MemberDetail key={selectedMember.id} member={selectedMember} onMemberChange={handleMemberChange} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a team member to view details
          </div>
        )}
      </div>
    </div>
  );
}
