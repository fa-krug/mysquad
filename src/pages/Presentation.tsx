import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getSalaryDataPointFull, getSetting } from "@/lib/db";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { SalaryBarChart } from "@/components/salary/SalaryBarChart";
import { VariablePayChart } from "@/components/salary/VariablePayChart";
import { ComparisonChart } from "@/components/salary/ComparisonChart";
import { SalaryOverTimeChart } from "@/components/salary/SalaryOverTimeChart";
import { useSalarySync } from "@/hooks/useSalarySync";
import type {
  SalaryDataPointDetail,
  SalaryDataPointMember,
  SalaryPart,
  SalaryOverTimePoint,
} from "@/lib/types";

export function Presentation() {
  const { dataPointId, memberId } = useParams<{ dataPointId: string; memberId: string }>();
  const dpId = Number(dataPointId);
  const mId = Number(memberId);

  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[]>>({});
  const [lineage, setLineage] = useState<SalaryOverTimePoint[]>([]);
  const [showRanges, setShowRanges] = useState(false);
  const [member, setMember] = useState<SalaryDataPointMember | null>(null);
  const [previousDataPointName, setPreviousDataPointName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const full = await getSalaryDataPointFull(dpId);
    setDetail(full.detail);
    setPreviousData(full.previous_data);
    setLineage(full.lineage);
    setPreviousDataPointName(full.previous_data_point_name ?? null);
    const m = full.detail.members.find((m) => m.member_id === mId) ?? null;
    setMember(m);
  }, [dpId, mId]);

  useEffect(() => {
    loadData();
    getSetting("show_ranges_in_presentation").then((v) => setShowRanges(v === "true"));
  }, [loadData]);

  // Listen for salary changes from other windows.
  // Note: this will also fire after local edits (double-fetch), which is harmless.
  useSalarySync(loadData);

  if (!detail || !member) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  const prevParts = previousData[mId] ?? null;

  // Filter lineage to just this member
  const memberLineage = lineage.map((point) => ({
    ...point,
    members: point.members.filter((m) => m.member_id === mId),
  }));

  // Build a single-member detail for charts
  const singleMemberDetail = { ...detail, members: [member] };
  const singlePreviousData: Record<number, SalaryPart[]> = prevParts ? { [mId]: prevParts } : {};

  return (
    <div className="mx-auto p-6 flex flex-col min-[960px]:flex-row justify-center gap-6">
      {/* Salary card */}
      <div
        className="w-full mx-auto min-[960px]:mx-0 min-[960px]:flex-none space-y-6"
        style={{ maxWidth: "560px" }}
      >
        <MemberSalaryCard
          member={member}
          ranges={showRanges ? detail.ranges : []}
          onAddPart={async () => {
            const { createSalaryPart } = await import("@/lib/db");
            await createSalaryPart(member.id);
          }}
          onDeletePart={async (partId) => {
            const { deleteSalaryPart } = await import("@/lib/db");
            await deleteSalaryPart(partId);
          }}
          onChanged={() => {}}
          dataPointId={dpId}
          previousParts={prevParts}
          previousDataPointName={previousDataPointName}
          hidePresentationButton
        />
      </div>

      {/* Charts */}
      <div className="max-w-2xl w-full mx-auto min-[960px]:mx-0 min-[960px]:flex-1 min-[960px]:min-w-0 space-y-6">
        <SalaryBarChart
          members={singleMemberDetail.members}
          ranges={showRanges ? detail.ranges : []}
          budget={null}
        />
        <VariablePayChart members={singleMemberDetail.members} />
        <ComparisonChart members={singleMemberDetail.members} previousData={singlePreviousData} />
        {memberLineage.length >= 2 && <SalaryOverTimeChart data={memberLineage} />}
      </div>
    </div>
  );
}
