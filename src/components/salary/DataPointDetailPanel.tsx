import { useMemo, useEffect, lazy, Suspense, useCallback, useState } from "react";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { ScenarioComparisonTable } from "@/components/salary/ScenarioComparisonTable";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  uploadSalaryTemplate,
  deleteSalaryTemplate,
  exportMemberSalaryDocx,
  createSalaryPart,
  deleteSalaryPart as deleteSalaryPartApi,
  getSalaryDataPoint,
} from "@/lib/db";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import { Upload, FileDown, Trash2, FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/toast";
import { useSalarySync } from "@/hooks/useSalarySync";
import type {
  SalaryListItem,
  SalaryDataPointDetail,
  SalaryPart,
  ScenarioSummary,
  ScenarioMemberComparison,
  SalaryOverTimePoint,
} from "@/lib/types";

const SalaryAnalytics = lazy(() =>
  import("@/components/salary/SalaryAnalytics").then((m) => ({ default: m.SalaryAnalytics })),
);

interface DataPointDetailPanelProps {
  detail: SalaryDataPointDetail;
  selectedId: number;
  previousData: Record<number, SalaryPart[] | null>;
  scenarioSummaries: ScenarioSummary[];
  memberComparisons: Record<number, ScenarioMemberComparison[]>;
  salaryLineage: SalaryOverTimePoint[];
  listItems: SalaryListItem[];
  onDetailRefresh: (detail: SalaryDataPointDetail) => void;
}

export function DataPointDetailPanel({
  detail,
  selectedId,
  previousData,
  scenarioSummaries,
  memberComparisons,
  salaryLineage,
  listItems,
  onDetailRefresh,
}: DataPointDetailPanelProps) {
  const [exporting, setExporting] = useState(false);

  const loadDetailOnly = useCallback(async () => {
    const d = await getSalaryDataPoint(selectedId);
    onDetailRefresh(d);
  }, [selectedId, onDetailRefresh]);

  useSalarySync(loadDetailOnly);

  const handleAddPart = useCallback(
    async (dataPointMemberId: number) => {
      await createSalaryPart(dataPointMemberId);
      await loadDetailOnly();
    },
    [loadDetailOnly],
  );

  const handleDeletePart = useCallback(
    async (partId: number) => {
      await deleteSalaryPartApi(partId);
      await loadDetailOnly();
    },
    [loadDetailOnly],
  );

  // Debounced refresh: field edits trigger a background refresh after 1s of inactivity.
  // This avoids re-fetching on every keystroke while keeping analytics totals up to date.
  const partChangedTimer = useMemo(
    () => ({ id: null as ReturnType<typeof setTimeout> | null }),
    [],
  );
  const handlePartChanged = useCallback(() => {
    if (partChangedTimer.id) clearTimeout(partChangedTimer.id);
    partChangedTimer.id = setTimeout(() => {
      loadDetailOnly();
      partChangedTimer.id = null;
    }, 1000);
  }, [loadDetailOnly, partChangedTimer]);

  useEffect(() => {
    return () => {
      if (partChangedTimer.id) clearTimeout(partChangedTimer.id);
    };
  }, [partChangedTimer]);

  const handleUploadTemplate = useCallback(async () => {
    try {
      const filePath = await openFile({
        filters: [{ name: "Word Document", extensions: ["docx"] }],
        multiple: false,
      });
      if (!filePath) return;
      await uploadSalaryTemplate(selectedId, filePath);
      await loadDetailOnly();
      showSuccess("Template uploaded");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedId, loadDetailOnly]);

  const handleDeleteTemplate = useCallback(async () => {
    try {
      await deleteSalaryTemplate(selectedId);
      await loadDetailOnly();
      showSuccess("Template removed");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedId, loadDetailOnly]);

  const handleExportMemberDocx = useCallback(
    async (memberId: number, memberName: string) => {
      setExporting(true);
      try {
        const filePath = await save({
          defaultPath: `${memberName.replace(/\s+/g, "_")}_salary.docx`,
          filters: [{ name: "Word Document", extensions: ["docx"] }],
        });
        if (!filePath) return;
        await exportMemberSalaryDocx(selectedId, memberId, filePath);
        showSuccess(`Exported salary overview for ${memberName}`);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      } finally {
        setExporting(false);
      }
    },
    [selectedId],
  );

  const sortedMembers = useMemo(
    () =>
      detail.members
        .slice()
        .sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1)),
    [detail],
  );

  const activeMembers = useMemo(() => detail.members.filter((m) => m.is_active), [detail]);

  const promotedMemberIds = useMemo(
    () => new Set(detail.members.filter((m) => m.is_promoted).map((m) => m.member_id)),
    [detail],
  );

  const previousTotal = useMemo(() => {
    if (!previousData || Object.keys(previousData).length === 0) return null;
    let total = 0;
    for (const [id, parts] of Object.entries(previousData)) {
      if (parts && !promotedMemberIds.has(Number(id))) {
        for (const p of parts) {
          total += p.amount * p.frequency;
        }
      }
    }
    return total;
  }, [previousData, promotedMemberIds]);

  const previousHeadcount = useMemo(() => {
    if (!previousData) return null;
    let count = 0;
    for (const [id, parts] of Object.entries(previousData)) {
      if (parts && !promotedMemberIds.has(Number(id))) count++;
    }
    return count > 0 ? count : null;
  }, [previousData, promotedMemberIds]);

  const previousBudget = useMemo(() => {
    if (!detail.previous_data_point_id) return null;
    const prevId = detail.previous_data_point_id;
    for (const item of listItems) {
      if (item.type === "data_point" && item.data_point.id === prevId) {
        return item.data_point.budget;
      }
    }
    return null;
  }, [detail, listItems]);

  const previousDataPointName = useMemo(() => {
    if (!detail.previous_data_point_id) return null;
    const prevId = detail.previous_data_point_id;
    for (const item of listItems) {
      if (item.type === "data_point" && item.data_point.id === prevId) {
        return item.data_point.name;
      }
    }
    return null;
  }, [detail, listItems]);

  const handleExportAllDocx = useCallback(async () => {
    setExporting(true);
    try {
      const members = detail.members;
      let exported = 0;
      for (const member of members) {
        const memberName = `${member.first_name}_${member.last_name}`;
        try {
          const filePath = await save({
            defaultPath: `${memberName}_salary.docx`,
            filters: [{ name: "Word Document", extensions: ["docx"] }],
          });
          if (!filePath) continue;
          await exportMemberSalaryDocx(selectedId, member.member_id, filePath);
          exported++;
        } catch (err) {
          showError(
            `Failed for ${member.first_name} ${member.last_name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (exported > 0) {
        showSuccess(`Exported ${exported} salary overview(s)`);
      }
    } finally {
      setExporting(false);
    }
  }, [selectedId, detail]);

  const handleDownloadPdf = useCallback(async () => {
    setExporting(true);
    try {
      const { generateSalaryPdf } = await import("@/lib/salary-pdf");
      await generateSalaryPdf(detail, previousData, previousTotal, salaryLineage);
      showSuccess("PDF exported");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [detail, previousData, previousTotal, salaryLineage]);

  return (
    <>
      <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={exporting}
              title="Download data point as PDF"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              {exporting ? "Exporting..." : "Download PDF"}
            </Button>
            {detail.template_path ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAllDocx}
                  disabled={exporting}
                  title="Export salary overview for all members"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-1" />
                  )}
                  {exporting ? "Exporting..." : "Export All"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteTemplate}
                  title="Remove template"
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Template
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadTemplate}
                title="Upload a .docx template for salary overviews"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Template
              </Button>
            )}
          </div>
        </div>
        {detail.template_path && (
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            Template uploaded
          </div>
        )}
      </div>
      <div className="px-6 pb-6 space-y-6">
        {detail.scenario_group_id && scenarioSummaries.length > 0 && (
          <ScenarioComparisonTable
            summaries={scenarioSummaries}
            currentDataPointId={detail.id}
            budget={detail.budget}
            previousTotal={previousTotal}
            previousBudget={previousBudget}
            previousHeadcount={previousHeadcount}
          />
        )}
        <div className="flex flex-col 2xl:flex-row gap-6">
          {/* Member salary cards */}
          <div className="max-w-2xl min-w-0 2xl:flex-1 space-y-6">
            {sortedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No members yet. Edit this data point to add team members.
              </p>
            ) : (
              sortedMembers.map((member) => (
                <MemberSalaryCard
                  key={member.id}
                  member={member}
                  ranges={detail.ranges}
                  onAddPart={handleAddPart}
                  onDeletePart={handleDeletePart}
                  onChanged={handlePartChanged}
                  dataPointId={selectedId}
                  scenarioComparison={
                    detail.scenario_group_id ? memberComparisons[member.member_id] : undefined
                  }
                  onExportDocx={detail.template_path ? handleExportMemberDocx : undefined}
                  previousParts={previousData[member.member_id]}
                  previousDataPointName={previousDataPointName}
                />
              ))
            )}
          </div>

          {/* Analytics */}
          {activeMembers.length > 0 && (
            <div className="max-w-2xl min-w-0 2xl:flex-1 2xl:sticky 2xl:top-0 2xl:self-start space-y-6">
              <ErrorBoundary>
                <Suspense fallback={<div className="h-64 animate-pulse rounded bg-muted" />}>
                  <SalaryAnalytics
                    detail={detail}
                    previousData={previousData}
                    salaryLineage={salaryLineage}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
