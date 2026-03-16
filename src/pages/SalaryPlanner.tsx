import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointModal } from "@/components/salary/DataPointModal";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { ScenarioComparisonTable } from "@/components/salary/ScenarioComparisonTable";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const SalaryAnalytics = lazy(() =>
  import("@/components/salary/SalaryAnalytics").then((m) => ({ default: m.SalaryAnalytics })),
);
import {
  getSalaryDataPoints,
  getSalaryDataPoint,
  deleteSalaryDataPoint,
  createSalaryPart,
  deleteSalaryPart as deleteSalaryPartApi,
  getPreviousMemberData,
  getTitles,
  deleteScenarioGroup,
  promoteScenario,
  getScenarioSummaries,
  getScenarioMemberComparison,
  updateSalaryDataPointMember,
  uploadSalaryTemplate,
  deleteSalaryTemplate,
  exportMemberSalaryDocx,
  getSetting,
  getTrashedSalaryDataPoints,
  restoreSalaryDataPoint,
  permanentDeleteSalaryDataPoint,
  restoreScenarioGroup,
  permanentDeleteScenarioGroup,
} from "@/lib/db";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import { EyeOff, Upload, FileDown, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/toast";
import type {
  SalaryListItem,
  SalaryDataPointSummary,
  SalaryDataPointDetail,
  SalaryPart,
  Title,
  ScenarioGroup,
  ScenarioSummary,
  ScenarioMemberComparison,
} from "@/lib/types";
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

export function SalaryPlanner() {
  const location = useLocation();
  const [listItems, setListItems] = useState<SalaryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[] | null>>({});
  const [titles, setTitles] = useState<Title[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDpId, setEditingDpId] = useState<number | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [scenarioSummaries, setScenarioSummaries] = useState<ScenarioSummary[]>([]);
  const [memberComparisons, setMemberComparisons] = useState<
    Record<number, ScenarioMemberComparison[]>
  >({});
  const [editingGroup, setEditingGroup] = useState<ScenarioGroup | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [showRangesInPresentation, setShowRangesInPresentation] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedItems, setTrashedItems] = useState<SalaryListItem[]>([]);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{
    id: number;
    type: "data_point" | "scenario_group";
  } | null>(null);

  const loadDataPoints = useCallback(async () => {
    const [items, t] = await Promise.all([getSalaryDataPoints(), getTitles()]);
    setListItems(items);
    setTitles(t);
    return items;
  }, []);

  const loadTrashedItems = useCallback(async () => {
    const items = await getTrashedSalaryDataPoints();
    setTrashedItems(items);
  }, []);

  useEffect(() => {
    if (showTrash) loadTrashedItems();
  }, [showTrash, loadTrashedItems]);

  const loadDetail = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);

    // Load comparison data for all members
    const prev: Record<number, SalaryPart[] | null> = {};
    await Promise.all(
      d.members.map(async (m) => {
        prev[m.member_id] = await getPreviousMemberData(id, m.member_id);
      }),
    );
    setPreviousData(prev);
  }, []);

  useEffect(() => {
    getSetting("show_ranges_in_presentation").then((value) => {
      if (value !== null) setShowRangesInPresentation(value === "true");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSalaryDataPoints(), getTitles()])
      .then(([items, t]) => {
        if (cancelled) return;
        setListItems(items);
        setTitles(t);
        // Select first selectable item
        for (const item of items) {
          if (item.type === "data_point") {
            setSelectedId(item.data_point.id);
            break;
          } else if (item.scenario_group.children.length > 0) {
            setSelectedId(item.scenario_group.children[0].id);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          showError("Failed to load salary data");
          setLoading(false);
        }
      });
    loadTrashedItems();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailError(null);
    getSalaryDataPoint(selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        Promise.all(
          d.members.map(
            async (m) =>
              [m.member_id, await getPreviousMemberData(selectedId, m.member_id)] as const,
          ),
        ).then((entries) => {
          if (cancelled) return;
          setPreviousData(Object.fromEntries(entries));
        });
      })
      .catch((err) => {
        if (!cancelled) setDetailError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!detail?.scenario_group_id) {
      setScenarioSummaries([]);
      setMemberComparisons({});
      return;
    }
    let cancelled = false;
    const sgId = detail.scenario_group_id;

    getScenarioSummaries(sgId).then((summaries) => {
      if (!cancelled) setScenarioSummaries(summaries);
    });

    Promise.all(
      detail.members.map(async (m) => {
        const comparison = await getScenarioMemberComparison(sgId, m.member_id);
        return [m.member_id, comparison] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setMemberComparisons(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [detail]);

  function handleCreate() {
    setEditingDpId(null);
    setEditingGroup(null);
    setEditingIsNew(true);
    setModalOpen(true);
  }

  function handleEdit(dp: SalaryDataPointSummary) {
    setEditingDpId(dp.id);
    setEditingIsNew(false);
    setModalOpen(true);
  }

  function handleEditGroup(group: ScenarioGroup) {
    setEditingGroup(group);
    setEditingDpId(null);
    setEditingIsNew(false);
    setModalOpen(true);
  }

  async function handleGroupRefresh(groupId: number) {
    const items = await loadDataPoints();
    const found = items.find(
      (item): item is { type: "scenario_group"; scenario_group: ScenarioGroup } =>
        item.type === "scenario_group" && item.scenario_group.id === groupId,
    );
    if (found) {
      setEditingGroup(found.scenario_group);
    }
    if (selectedId) await loadDetail(selectedId);
  }

  async function handleDeleteGroup(groupId: number) {
    setSelectedId(null);
    setDetail(null);
    await deleteScenarioGroup(groupId);
    const items = await loadDataPoints();
    await loadTrashedItems();
    for (const item of items) {
      if (item.type === "data_point") {
        setSelectedId(item.data_point.id);
        break;
      }
    }
  }

  async function handlePromote(dataPointId: number) {
    try {
      await promoteScenario(dataPointId);
      await loadDataPoints();
      setSelectedId(dataPointId);
      if (selectedId === dataPointId) {
        await loadDetail(dataPointId);
      }
      showSuccess("Scenario promoted to data point");
    } catch {
      showError("Failed to promote scenario");
    }
  }

  async function handleDelete(id: number) {
    const wasSelected = selectedId === id;
    if (wasSelected) {
      setSelectedId(null);
      setDetail(null);
    }
    await deleteSalaryDataPoint(id);
    const items = await loadDataPoints();
    await loadTrashedItems();
    if (wasSelected) {
      for (const item of items) {
        if (item.type === "data_point") {
          setSelectedId(item.data_point.id);
          break;
        }
      }
    }
  }

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-datapoint") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    } else if (typeof state.dataPointId === "number") {
      setSelectedId(state.dataPointId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Light refetch: only detail, no comparison data (used for part edits)
  const loadDetailOnly = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);
  }, []);

  const handleAddPart = useCallback(
    async (dataPointMemberId: number) => {
      await createSalaryPart(dataPointMemberId);
      if (selectedId) await loadDetailOnly(selectedId);
    },
    [selectedId, loadDetailOnly],
  );

  const handleDeletePart = useCallback(
    async (partId: number) => {
      await deleteSalaryPartApi(partId);
      if (selectedId) await loadDetailOnly(selectedId);
    },
    [selectedId, loadDetailOnly],
  );

  const handlePartChanged = useCallback(() => {
    if (selectedId) loadDetailOnly(selectedId);
  }, [selectedId, loadDetailOnly]);

  const handleUploadTemplate = useCallback(async () => {
    if (!selectedId) return;
    try {
      const filePath = await openFile({
        filters: [{ name: "Word Document", extensions: ["docx"] }],
        multiple: false,
      });
      if (!filePath) return;
      await uploadSalaryTemplate(selectedId, filePath);
      await loadDetailOnly(selectedId);
      showSuccess("Template uploaded");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedId, loadDetailOnly]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!selectedId) return;
    try {
      await deleteSalaryTemplate(selectedId);
      await loadDetailOnly(selectedId);
      showSuccess("Template removed");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedId, loadDetailOnly]);

  const handleExportMemberDocx = useCallback(
    async (memberId: number, memberName: string) => {
      if (!selectedId) return;
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
      }
    },
    [selectedId],
  );

  const handleTogglePresented = useCallback(
    async (id: number, value: boolean) => {
      await updateSalaryDataPointMember(id, "is_presented", value ? "1" : "0");
      if (selectedId) await loadDetailOnly(selectedId);
    },
    [selectedId, loadDetailOnly],
  );

  async function handleModalSaved() {
    await loadDataPoints();
    if (selectedId) await loadDetail(selectedId);
  }

  const sortedMembers = useMemo(
    () =>
      detail?.members
        .slice()
        .sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1)) ?? [],
    [detail],
  );

  const anyPresented = useMemo(
    () => detail?.members.some((m) => m.is_presented) ?? false,
    [detail],
  );
  const presentedMembers = useMemo(
    () => (anyPresented ? sortedMembers.filter((m) => m.is_presented) : sortedMembers),
    [sortedMembers, anyPresented],
  );

  const handleExportAllDocx = useCallback(async () => {
    if (!selectedId || !detail) return;
    const members = anyPresented ? presentedMembers : detail.members;
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
  }, [selectedId, detail, anyPresented, presentedMembers]);

  const filteredDetail = useMemo(() => {
    if (!detail) return null;
    if (!anyPresented) return detail;
    return { ...detail, members: detail.members.filter((m) => m.is_presented) };
  }, [detail, anyPresented]);

  const filteredPreviousData = useMemo(() => {
    if (!anyPresented) return previousData;
    const visibleMemberIds = new Set(presentedMembers.map((m) => m.member_id));
    return Object.fromEntries(
      Object.entries(previousData).filter(([id]) => visibleMemberIds.has(Number(id))),
    );
  }, [previousData, presentedMembers, anyPresented]);

  const activeMembers = useMemo(
    () => (filteredDetail?.members ?? []).filter((m) => m.is_active),
    [filteredDetail],
  );

  async function handleRestore(id: number, type: "data_point" | "scenario_group") {
    if (type === "scenario_group") await restoreScenarioGroup(id);
    else await restoreSalaryDataPoint(id);
    await Promise.all([loadDataPoints(), loadTrashedItems()]);
    setSelectedId(null);
  }

  async function handlePermanentDelete(id: number, type: "data_point" | "scenario_group") {
    if (type === "scenario_group") await permanentDeleteScenarioGroup(id);
    else await permanentDeleteSalaryDataPoint(id);
    await loadTrashedItems();
    setSelectedId(null);
  }

  // Exclude promoted members to match budgetTotals logic
  const promotedMemberIds = useMemo(
    () => new Set(detail?.members.filter((m) => m.is_promoted).map((m) => m.member_id) ?? []),
    [detail],
  );

  const previousTotal = useMemo(() => {
    if (!filteredPreviousData || Object.keys(filteredPreviousData).length === 0) return null;
    let total = 0;
    for (const [id, parts] of Object.entries(filteredPreviousData)) {
      if (parts && !promotedMemberIds.has(Number(id))) {
        for (const p of parts) {
          total += p.amount * p.frequency;
        }
      }
    }
    return total;
  }, [filteredPreviousData, promotedMemberIds]);

  const previousHeadcount = useMemo(() => {
    if (!filteredPreviousData) return null;
    let count = 0;
    for (const [id, parts] of Object.entries(filteredPreviousData)) {
      if (parts && !promotedMemberIds.has(Number(id))) count++;
    }
    return count > 0 ? count : null;
  }, [filteredPreviousData, promotedMemberIds]);

  const previousBudget = useMemo(() => {
    if (!detail?.previous_data_point_id) return null;
    const prevId = detail.previous_data_point_id;
    for (const item of listItems) {
      if (item.type === "data_point" && item.data_point.id === prevId) {
        return item.data_point.budget;
      }
    }
    return null;
  }, [detail, listItems]);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 shrink-0">
        <DataPointList
          items={showTrash ? trashedItems : listItems}
          selectedId={selectedId}
          loading={loading}
          creating={false}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onEditGroup={handleEditGroup}
          onDelete={handleDelete}
          onDeleteGroup={handleDeleteGroup}
          onPromote={setPromotingId}
          showTrash={showTrash}
          onToggleTrash={() => {
            setShowTrash(!showTrash);
            setSelectedId(null);
            setDetail(null);
          }}
          trashCount={trashedItems.length}
          onRestore={handleRestore}
          onPermanentDelete={(id, type) => setPermanentDeleteTarget({ id, type })}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        <ErrorBoundary>
          {showTrash ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a trashed item to restore or permanently delete
            </div>
          ) : detailError ? (
            <div className="flex h-full items-center justify-center">
              <pre className="text-sm text-destructive max-w-lg whitespace-pre-wrap">
                {detailError}
              </pre>
            </div>
          ) : !detail ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a data point to view details
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-2">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold">{detail.name}</h1>
                  <div className="flex items-center gap-2">
                    {!anyPresented &&
                      (detail.template_path ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportAllDocx}
                            title="Export salary overview for all members"
                          >
                            <FileDown className="h-4 w-4 mr-1" />
                            Export All
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
                      ))}
                    {anyPresented && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await Promise.all(
                            detail.members
                              .filter((m) => m.is_presented)
                              .map((m) => updateSalaryDataPointMember(m.id, "is_presented", "0")),
                          );
                          await loadDetailOnly(selectedId!);
                        }}
                      >
                        <EyeOff className="h-4 w-4 mr-1" />
                        Clear presentation
                      </Button>
                    )}
                  </div>
                </div>
                {detail.template_path && !anyPresented && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    Template uploaded
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 space-y-6">
                {!anyPresented && detail.scenario_group_id && scenarioSummaries.length > 0 && (
                  <ScenarioComparisonTable
                    summaries={scenarioSummaries}
                    currentDataPointId={detail.id}
                    budget={detail.budget}
                    previousTotal={previousTotal}
                    previousBudget={previousBudget}
                    previousHeadcount={previousHeadcount}
                    anyPresented={anyPresented}
                  />
                )}
                <div className="flex flex-col 2xl:flex-row gap-6">
                  {/* Member salary cards */}
                  <div className="max-w-2xl min-w-0 2xl:flex-1 space-y-6">
                    {presentedMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No members in this data point.
                      </p>
                    ) : (
                      presentedMembers.map((member) => (
                        <MemberSalaryCard
                          key={member.id}
                          member={member}
                          ranges={detail.ranges}
                          onAddPart={handleAddPart}
                          onDeletePart={handleDeletePart}
                          onChanged={handlePartChanged}
                          anyPresented={anyPresented}
                          showRangesInPresentation={showRangesInPresentation}
                          onTogglePresented={handleTogglePresented}
                          scenarioComparison={
                            detail.scenario_group_id
                              ? memberComparisons[member.member_id]
                              : undefined
                          }
                          onExportDocx={detail.template_path ? handleExportMemberDocx : undefined}
                        />
                      ))
                    )}
                  </div>

                  {/* Analytics */}
                  {activeMembers.length > 0 && (
                    <div className="max-w-2xl min-w-0 2xl:flex-1 2xl:sticky 2xl:top-0 2xl:self-start space-y-6">
                      <ErrorBoundary>
                        <Suspense
                          fallback={<div className="h-64 animate-pulse rounded bg-muted" />}
                        >
                          <SalaryAnalytics
                            detail={filteredDetail!}
                            previousData={filteredPreviousData}
                            anyPresented={anyPresented}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </ErrorBoundary>
      </div>

      {/* Edit modal */}
      <DataPointModal
        dataPointId={editingDpId}
        editingGroup={editingGroup}
        titles={titles}
        dataPoints={listItems}
        isNew={editingIsNew}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingGroup(null);
        }}
        onSaved={handleModalSaved}
        onGroupRefresh={handleGroupRefresh}
      />

      <AlertDialog open={promotingId !== null} onOpenChange={(o) => !o && setPromotingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote this scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              This will convert this scenario into a normal data point and delete all other
              scenarios in the group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (promotingId) handlePromote(promotingId);
                setPromotingId(null);
              }}
            >
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={permanentDeleteTarget !== null}
        onOpenChange={(o) => !o && setPermanentDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The data point and all its data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (permanentDeleteTarget)
                  handlePermanentDelete(permanentDeleteTarget.id, permanentDeleteTarget.type);
                setPermanentDeleteTarget(null);
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
