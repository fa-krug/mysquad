import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getSalaryDataPointFull, getSetting } from "@/lib/db";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { SalaryBarChart } from "@/components/salary/SalaryBarChart";
import { VariablePayChart } from "@/components/salary/VariablePayChart";
import { ComparisonChart } from "@/components/salary/ComparisonChart";
import { SalaryOverTimeChart } from "@/components/salary/SalaryOverTimeChart";
import { useSalarySync } from "@/hooks/useSalarySync";
import { annualTotal, formatCents } from "@/lib/salary-utils";
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

  const loadData = useCallback(async () => {
    const full = await getSalaryDataPointFull(dpId);
    setDetail(full.detail);
    setPreviousData(full.previous_data);
    setLineage(full.lineage);
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

  const total = annualTotal(member.parts);
  const prevParts = previousData[mId] ?? null;
  const prevTotal = prevParts ? annualTotal(prevParts) : null;

  // Filter lineage to just this member
  const memberLineage = lineage.map((point) => ({
    ...point,
    members: point.members.filter((m) => m.member_id === mId),
  }));

  // Build a single-member detail for charts
  const singleMemberDetail = { ...detail, members: [member] };
  const singlePreviousData: Record<number, SalaryPart[]> = prevParts ? { [mId]: prevParts } : {};

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {member.first_name} {member.last_name}
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(member.promoted_title_name ?? member.title_name) && (
            <span>{member.promoted_title_name ?? member.title_name}</span>
          )}
          {member.is_promoted && member.title_name && member.promoted_title_name && (
            <span className="text-amber-600">(promoted from {member.title_name})</span>
          )}
        </div>
        <div className="text-lg font-semibold mt-1">{formatCents(total)}/yr</div>
        {prevTotal !== null && (
          <div className="text-sm text-muted-foreground">
            Previous: {formatCents(prevTotal)}/yr
            {total !== prevTotal && (
              <span className={total > prevTotal ? "text-green-600 ml-1" : "text-red-600 ml-1"}>
                ({total > prevTotal ? "+" : ""}
                {formatCents(total - prevTotal)})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Editable salary card */}
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
        previousDataPointName={detail.name}
      />

      {/* Charts */}
      <SalaryBarChart
        members={singleMemberDetail.members}
        ranges={showRanges ? detail.ranges : []}
        budget={null}
      />
      <VariablePayChart members={singleMemberDetail.members} />
      <ComparisonChart members={singleMemberDetail.members} previousData={singlePreviousData} />
      {memberLineage.length >= 2 && <SalaryOverTimeChart data={memberLineage} />}
    </div>
  );
}
