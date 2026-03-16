import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MemberList } from "@/components/team/MemberList";
import { MemberDetail } from "@/components/team/MemberDetail";
import { OrgChart } from "@/components/team/OrgChart";
import { ListIcon, NetworkIcon } from "lucide-react";
import {
  getTeamMembers,
  createTeamMember,
  deleteTeamMember,
  updateTeamMember,
  getPicturesDirPath,
  getTrashedTeamMembers,
  restoreTeamMember,
  permanentDeleteTeamMember,
} from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TeamMember } from "@/lib/types";

export function TeamMembers() {
  const location = useLocation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [picturesDir, setPicturesDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [highlightTalkTopicId, setHighlightTalkTopicId] = useState<number | undefined>(undefined);
  const [view, setView] = useState<"list" | "chart">("list");
  const [showTrash, setShowTrash] = useState(false);
  const [trashedMembers, setTrashedMembers] = useState<TeamMember[]>([]);
  const [permanentDeleteId, setPermanentDeleteId] = useState<number | null>(null);

  useEffect(() => {
    getPicturesDirPath()
      .then(setPicturesDir)
      .catch(() => showError("Failed to load pictures directory"));
  }, []);

  const loadMembers = useCallback(async () => {
    const data = await getTeamMembers();
    setMembers(data);
  }, []);

  const loadTrashedMembers = useCallback(async () => {
    const data = await getTrashedTeamMembers();
    setTrashedMembers(data);
  }, []);

  useEffect(() => {
    if (showTrash) loadTrashedMembers();
  }, [showTrash, loadTrashedMembers]);

  // Load trashed members count on mount for the badge
  useEffect(() => {
    loadTrashedMembers();
  }, [loadTrashedMembers]);

  useEffect(() => {
    let cancelled = false;
    getTeamMembers()
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {
        if (!cancelled) showError("Failed to load team members");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-member") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    } else if (typeof state.memberId === "number") {
      setSelectedId(state.memberId);
      if (typeof state.highlightTalkTopicId === "number") {
        setHighlightTalkTopicId(state.highlightTalkTopicId);
      }
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const member = await createTeamMember();
      await loadMembers();
      setSelectedId(member.id);
      showSuccess("Team member created");
    } catch {
      showError("Failed to create team member");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    await deleteTeamMember(id);
    await loadMembers();
  };

  const handleRestore = async (id: number) => {
    await restoreTeamMember(id);
    await Promise.all([loadMembers(), loadTrashedMembers()]);
    setSelectedId(null);
  };

  const handlePermanentDelete = async (id: number) => {
    await permanentDeleteTeamMember(id);
    await loadTrashedMembers();
    setSelectedId(null);
  };

  const handleMemberChange = async (
    field: string,
    value: string | null,
    titleName?: string | null,
  ) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const updated = { ...m, [field]: value };
        if (field === "title_id") {
          updated.title_name = titleName ?? null;
          // Update current title if no promotion override exists
          if (!updated.current_title_data_point_id) {
            updated.current_title_id = value ? Number(value) : null;
            updated.current_title_name = titleName ?? null;
          }
        }
        if (field === "lead_id") {
          const leadMember = prev.find((lm) => String(lm.id) === value);
          updated.lead_id = value ? Number(value) : null;
          updated.lead_name = leadMember
            ? `${leadMember.first_name} ${leadMember.last_name}`
            : null;
        }
        return updated;
      }),
    );
    if (selectedId !== null) {
      try {
        await updateTeamMember(selectedId, field, value);
      } catch (err) {
        await loadMembers();
        throw err;
      }
    }
  };

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <MemberList
        members={showTrash ? trashedMembers : members}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
        picturesDir={picturesDir}
        showTrash={showTrash}
        onToggleTrash={() => {
          setShowTrash(!showTrash);
          setSelectedId(null);
        }}
        trashCount={trashedMembers.length}
        onRestore={handleRestore}
        onPermanentDelete={(id) => setPermanentDeleteId(id)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View toggle header - hidden in trash mode */}
        {!showTrash && (
          <div className="flex items-center justify-end gap-1 px-3 h-12 border-b">
            <button
              type="button"
              className={`p-1.5 rounded ${view === "list" ? "bg-muted" : "hover:bg-muted/50"}`}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`p-1.5 rounded ${view === "chart" ? "bg-muted" : "hover:bg-muted/50"}`}
              onClick={() => setView("chart")}
              title="Org chart"
            >
              <NetworkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* View content */}
        <div className="flex-1 overflow-auto">
          {showTrash ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a trashed member to restore or permanently delete
            </div>
          ) : view === "chart" ? (
            <OrgChart
              members={members}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setView("list");
              }}
              picturesDir={picturesDir}
            />
          ) : selectedMember ? (
            <MemberDetail
              key={selectedMember.id}
              member={selectedMember}
              members={members}
              onMemberChange={handleMemberChange}
              picturesDir={picturesDir}
              highlightTalkTopicId={highlightTalkTopicId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a team member to view details
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={permanentDeleteId !== null}
        onOpenChange={(o) => !o && setPermanentDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The member and all their data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (permanentDeleteId) handlePermanentDelete(permanentDeleteId);
                setPermanentDeleteId(null);
              }}
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
