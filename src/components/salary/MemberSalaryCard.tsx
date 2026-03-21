import { memo } from "react";
import { Eye, FileDown, Plus, Star, UserX } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { openPresentationWindow } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { SalaryPartRow } from "./SalaryPartRow";
import { annualTotal, formatCents, formatDeltaPercent, rangeFitColor, getRangeForMember, salaryDelta } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";
import type {
  SalaryDataPointMember,
  SalaryPart,
  SalaryRange,
  ScenarioMemberComparison,
} from "@/lib/types";

const fitColors: Record<string, string> = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
  none: "text-muted-foreground",
};

interface MemberSalaryCardProps {
  member: SalaryDataPointMember;
  ranges: SalaryRange[];
  onAddPart: (dataPointMemberId: number) => void;
  onDeletePart: (partId: number) => void;
  onChanged: () => void;
  dataPointId: number;
  scenarioComparison?: ScenarioMemberComparison[];
  onExportDocx?: (memberId: number, memberName: string) => void;
  previousParts?: SalaryPart[] | null;
  previousDataPointName?: string | null;
}

export const MemberSalaryCard = memo(function MemberSalaryCard({
  member,
  ranges,
  onAddPart,
  onDeletePart,
  onChanged,
  dataPointId,
  scenarioComparison,
  onExportDocx,
  previousParts,
  previousDataPointName,
}: MemberSalaryCardProps) {
  const total = annualTotal(member.parts);
  const range = getRangeForMember(member, ranges);
  const fit = rangeFitColor(total, range);
  const delta = salaryDelta(member.parts, previousParts ?? null);

  return (
    <div
      className={cn(
        "group/card rounded-lg border border-border p-4",
        !member.is_active && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold cursor-pointer hover:underline"
            onClick={() => copyToClipboard(`${member.first_name} ${member.last_name}`)}
          >
            {member.last_name}, {member.first_name}
          </h3>
          {(member.promoted_title_name ?? member.title_name) && (
            <span
              className="text-xs text-muted-foreground cursor-pointer hover:underline"
              onClick={() => copyToClipboard((member.promoted_title_name ?? member.title_name)!)}
            >
              ({member.promoted_title_name ?? member.title_name})
            </span>
          )}
          {!member.is_active && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <UserX className="h-3 w-3" /> Inactive
            </span>
          )}
          {member.is_promoted && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <Star className="h-3 w-3" /> Promoted
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover/card:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              openPresentationWindow(dataPointId, member.member_id);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {onExportDocx && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover/card:opacity-100"
              title="Export salary overview"
              onClick={(e) => {
                e.stopPropagation();
                onExportDocx(member.member_id, `${member.first_name} ${member.last_name}`);
              }}
            >
              <FileDown className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", fitColors[fit])}>
            {formatCents(total)}/yr
          </span>
          {delta.absoluteDelta !== null && (
            <span
              className={cn(
                "text-xs font-medium",
                delta.absoluteDelta > 0
                  ? "text-green-600 dark:text-green-400"
                  : delta.absoluteDelta < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground",
              )}
            >
              {delta.absoluteDelta > 0 ? "+" : ""}
              {formatCents(delta.absoluteDelta)} ({formatDeltaPercent(delta.percentDelta!)})
            </span>
          )}
          {range && (
            <span className="text-xs font-normal text-muted-foreground">
              ({formatCents(range.min_salary)} – {formatCents(range.max_salary)})
            </span>
          )}
        </div>
      </div>

      {member.parts.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Label</th>
              <th className="px-2 py-1 text-left font-medium">Amount</th>
              <th className="px-2 py-1 text-left font-medium">Freq/yr</th>
              <th className="px-2 py-1 text-center font-medium">Variable</th>
              <th className="px-2 py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {member.parts.map((part) => (
              <SalaryPartRow
                key={part.id}
                part={part}
                onDelete={onDeletePart}
                onChanged={onChanged}
              />
            ))}
          </tbody>
        </table>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 text-xs"
        onClick={() => onAddPart(member.id)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
      </Button>
      {previousParts && previousParts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              {previousDataPointName ?? "Previous"}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {formatCents(annualTotal(previousParts))}/yr
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-2 py-1 text-left font-medium">Label</th>
                <th className="px-2 py-1 text-left font-medium">Amount</th>
                <th className="px-2 py-1 text-left font-medium">Freq/yr</th>
                <th className="px-2 py-1 text-center font-medium">Variable</th>
              </tr>
            </thead>
            <tbody>
              {previousParts.map((part) => (
                <SalaryPartRow
                  key={part.id}
                  part={part}
                  onDelete={() => {}}
                  onChanged={() => {}}
                  readonly
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {scenarioComparison && scenarioComparison.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800/50">
          <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
            Scenario comparison
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {scenarioComparison.map((sc) => (
              <div key={sc.data_point_id} className="flex items-center gap-1">
                <span className="text-muted-foreground">{sc.data_point_name}:</span>
                <span className="font-medium">{formatCents(sc.annual_total)}/yr</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
