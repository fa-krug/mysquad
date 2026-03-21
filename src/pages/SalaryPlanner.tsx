import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointDetailPanel } from "@/components/salary/DataPointDetailPanel";
const DataPointModal = lazy(() =>
  import("@/components/salary/DataPointModal").then((m) => ({ default: m.DataPointModal })),
);
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorRetry } from "@/components/ui/error-retry";
import {
  getSalaryDataPoints,
  getSalaryDataPointFull,
  deleteSalaryDataPoint,
  getTitles,
  deleteScenarioGroup,
  promoteScenario,
  getScenarioSummaries,
  getAllScenarioMemberComparisons,
  getTrashedSalaryDataPoints,
  restoreSalaryDataPoint,
  permanentDeleteSalaryDataPoint,
  restoreScenarioGroup,
  permanentDeleteScenarioGroup,
} from "@/lib/db";
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
  SalaryOverTimePoint,
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

  // List state
  const [listItems, setListItems] = useState<SalaryListItem[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail state
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[] | null>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scenarioSummaries, setScenarioSummaries] = useState<ScenarioSummary[]>([]);
  const [memberComparisons, setMemberComparisons] = useState<
    Record<number, ScenarioMemberComparison[]>
  >({});
  const [salaryLineage, setSalaryLineage] = useState<SalaryOverTimePoint[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDpId, setEditingDpId] = useState<number | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ScenarioGroup | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{
    id: number;
    type: "data_point" | "scenario_group";
  } | null>(null);

  // Trash state
  const [showTrash, setShowTrash] = useState(false);
  const [trashedItems, setTrashedItems] = useState<SalaryListItem[]>([]);

  // ── Data loading ──

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

  const loadDetail = useCallback(async (id: number) => {
    const full = await getSalaryDataPointFull(id);
    setDetail(full.detail);
    setPreviousData(full.previous_data);
    setSalaryLineage(full.lineage);
  }, []);

  useEffect(() => {
    if (showTrash) loadTrashedItems();
  }, [showTrash, loadTrashedItems]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    Promise.all([getSalaryDataPoints(), getTitles()])
      .then(([items, t]) => {
        if (cancelled) return;
        setListItems(items);
        setTitles(t);
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

  // Load detail when selection changes (keeps old detail visible during load)
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailError(null);
    setDetailLoading(true);
    getSalaryDataPointFull(selectedId)
      .then((full) => {
        if (cancelled) return;
        setDetail(full.detail);
        setSalaryLineage(full.lineage);
        setPreviousData(full.previous_data);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Load scenario data when detail changes
  useEffect(() => {
    if (!detail?.scenario_group_id) {
      setScenarioSummaries([]);
      setMemberComparisons({});
      return;
    }
    let cancelled = false;
    const sgId = detail.scenario_group_id;

    Promise.all([getScenarioSummaries(sgId), getAllScenarioMemberComparisons(sgId)])
      .then(([summaries, comparisons]) => {
        if (!cancelled) {
          setScenarioSummaries(summaries);
          setMemberComparisons(comparisons);
        }
      })
      .catch((err) => console.error("Failed to load scenario data:", err));

    return () => {
      cancelled = true;
    };
  }, [detail]);

  // ── List handlers ──

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

  async function handleModalSaved() {
    await loadDataPoints();
    if (selectedId) await loadDetail(selectedId);
  }

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

  const handleDetailRefresh = useCallback((d: SalaryDataPointDetail) => {
    setDetail(d);
  }, []);

  // ── Render ──

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
              <ErrorRetry
                message="Failed to load data point details"
                onRetry={() => {
                  if (selectedId) {
                    setDetailError(null);
                    setDetailLoading(true);
                    getSalaryDataPointFull(selectedId)
                      .then((full) => {
                        setDetail(full.detail);
                        setSalaryLineage(full.lineage);
                        setPreviousData(full.previous_data);
                      })
                      .catch((err) => setDetailError(String(err)))
                      .finally(() => setDetailLoading(false));
                  }
                }}
              />
            </div>
          ) : !detail ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <p>Select a data point to view details</p>
              {listItems.length === 0 && !loading && (
                <Button variant="outline" size="sm" onClick={handleCreate}>
                  Create your first data point
                </Button>
              )}
            </div>
          ) : (
            <div className={`relative ${detailLoading ? "opacity-60 pointer-events-none" : ""}`}>
              <DataPointDetailPanel
                detail={detail}
                selectedId={selectedId!}
                previousData={previousData}
                scenarioSummaries={scenarioSummaries}
                memberComparisons={memberComparisons}
                salaryLineage={salaryLineage}
                listItems={listItems}
                onDetailRefresh={handleDetailRefresh}
              />
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* Edit modal */}
      <Suspense fallback={null}>
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
      </Suspense>

      {/* Promote dialog */}
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

      {/* Permanent delete dialog */}
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
