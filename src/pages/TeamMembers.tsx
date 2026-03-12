import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MemberList } from "@/components/team/MemberList";
import { MemberDetail } from "@/components/team/MemberDetail";
import { getTeamMembers, createTeamMember, deleteTeamMember, getPicturesDirPath } from "@/lib/db";
import type { TeamMember } from "@/lib/types";

export function TeamMembers() {
  const location = useLocation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [picturesDir, setPicturesDir] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const memberId = location.state?.memberId;
    if (typeof memberId === "number") {
      // Clear the state so refreshing doesn't re-select
      window.history.replaceState({}, "");
      return memberId;
    }
    return null;
  });

  useEffect(() => {
    getPicturesDirPath().then(setPicturesDir);
  }, []);

  const loadMembers = useCallback(async () => {
    const data = await getTeamMembers();
    setMembers(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTeamMembers().then((data) => {
      if (!cancelled) setMembers(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setMembers((prev) => prev.map((m) => (m.id === selectedId ? { ...m, [field]: value } : m)));
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
        picturesDir={picturesDir}
      />
      <div className="flex-1 overflow-auto">
        {selectedMember ? (
          <MemberDetail
            key={selectedMember.id}
            member={selectedMember}
            onMemberChange={handleMemberChange}
            picturesDir={picturesDir}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a team member to view details
          </div>
        )}
      </div>
    </div>
  );
}
