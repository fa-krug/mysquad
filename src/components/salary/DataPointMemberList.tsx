import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SalaryDataPointMember, TeamMember, Title } from "@/lib/types";

export interface MemberState {
  active: boolean;
  promoted: boolean;
  promotedTitleId: string;
}

interface DataPointMemberListProps {
  members: SalaryDataPointMember[];
  memberStates: Record<number, MemberState>;
  allMembers: TeamMember[];
  titles: Title[];
  onToggleActive: (memberId: number, checked: boolean) => void;
  onTogglePromoted: (memberId: number, checked: boolean) => void;
  onChangePromotedTitle: (memberId: number, titleId: string) => void;
  onRemoveMember: (memberId: number, memberMemberId: number) => Promise<void>;
  onAddMember: (memberId: number) => Promise<void>;
}

export function DataPointMemberList({
  members,
  memberStates,
  allMembers,
  titles,
  onToggleActive,
  onTogglePromoted,
  onChangePromotedTitle,
  onRemoveMember,
  onAddMember,
}: DataPointMemberListProps) {
  const existingMemberIds = new Set(members.map((m) => m.member_id));
  const available = allMembers.filter((m) => !existingMemberIds.has(m.id));

  return (
    <>
      {members.map((member) => {
        const state = memberStates[member.id] ?? {
          active: member.is_active,
          promoted: member.is_promoted,
          promotedTitleId: member.promoted_title_id != null ? String(member.promoted_title_id) : "",
        };
        return (
          <div key={member.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="w-36 sm:w-48 shrink-0 truncate">
                {member.last_name}, {member.first_name}
              </span>
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={state.active}
                  onCheckedChange={(checked) => onToggleActive(member.id, !!checked)}
                />
                <span>Active</span>
              </label>
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={state.promoted}
                  onCheckedChange={(checked) => onTogglePromoted(member.id, !!checked)}
                />
                <span>Promoted</span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => onRemoveMember(member.id, member.member_id)}
              >
                Remove
              </Button>
            </div>
            {state.promoted && (
              <div className="sm:ml-48 sm:pl-4 pl-6">
                <select
                  className="h-7 w-48 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                  value={state.promotedTitleId}
                  onChange={(e) => onChangePromotedTitle(member.id, e.target.value)}
                >
                  <option value="">Select new title…</option>
                  {titles.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
      {available.length > 0 && (
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          value=""
          onChange={async (e) => {
            const memberId = Number(e.target.value);
            if (!memberId) return;
            await onAddMember(memberId);
          }}
        >
          <option value="">Add team member…</option>
          {available
            .sort(
              (a, b) =>
                a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
            )
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.last_name}, {m.first_name}
              </option>
            ))}
        </select>
      )}
    </>
  );
}
