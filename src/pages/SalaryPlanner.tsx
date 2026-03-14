import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointModal } from "@/components/salary/DataPointModal";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { ScenarioComparisonTable } from "@/components/salary/ScenarioComparisonTable";

const SalaryAnalytics = lazy(() =>
  import("@/components/salary/SalaryAnalytics").then((m) => ({ default: m.SalaryAnalytics })),
);
import { usePendingDelete } from "@/hooks/usePendingDelete";
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
} from "@/lib/db";
import { EyeOff } from "lucide-react";
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
  const [scenarioSummaries, setScenarioSummaries] = useState<ScenarioSummary[]>([]);
  const [memberComparisons, setMemberComparisons] = useState<
    Record<number, ScenarioMemberComparison[]>
  >({});
  const [editingGroup, setEditingGroup] = useState<ScenarioGroup | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const { scheduleDelete, pendingIds } = usePendingDelete();

  const loadDataPoints = useCallback(async () => {
    const [items, t] = await Promise.all([getSalaryDataPoints(), getTitles()]);
    setListItems(items);
    setTitles(t);
    return items;
  }, []);

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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getSalaryDataPoint(selectedId).then((d) => {
      if (cancelled) return;
      setDetail(d);
      Promise.all(
        d.members.map(
          async (m) => [m.member_id, await getPreviousMemberData(selectedId, m.member_id)] as const,
        ),
      ).then((entries) => {
        if (cancelled) return;
        setPreviousData(Object.fromEntries(entries));
      });
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

  async function handleDeleteGroup(groupId: number) {
    scheduleDelete({
      id: groupId,
      label: "Scenario group",
      onConfirm: async () => {
        await deleteScenarioGroup(groupId);
        const items = await loadDataPoints();
        setSelectedId(null);
        setDetail(null);
        for (const item of items) {
          if (item.type === "data_point") {
            setSelectedId(item.data_point.id);
            break;
          }
        }
      },
    });
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

  function handleDelete(id: number) {
    let dpName = "Data point";
    for (const item of listItems) {
      if (item.type === "data_point" && item.data_point.id === id) {
        dpName = item.data_point.name || dpName;
        break;
      }
    }
    const wasSelected = selectedId === id;
    scheduleDelete({
      id,
      label: dpName,
      onConfirm: async () => {
        await deleteSalaryDataPoint(id);
        const items = await loadDataPoints();
        if (wasSelected) {
          let newId: number | null = null;
          for (const item of items) {
            if (item.type === "data_point") {
              newId = item.data_point.id;
              break;
            }
          }
          setSelectedId(newId);
          setDetail(null);
        }
      },
      onUndo: wasSelected ? () => setSelectedId(id) : undefined,
    });
    if (wasSelected) {
      setSelectedId(null);
      setDetail(null);
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

  const visibleItems = useMemo(
    () =>
      listItems.filter((item) => {
        if (item.type === "data_point") return !pendingIds.has(item.data_point.id);
        return !pendingIds.has(item.scenario_group.id);
      }),
    [listItems, pendingIds],
  );

  const previousTotal = useMemo(() => {
    if (!filteredPreviousData || Object.keys(filteredPreviousData).length === 0) return null;
    let total = 0;
    for (const parts of Object.values(filteredPreviousData)) {
      if (parts) {
        for (const p of parts) {
          total += p.amount * p.frequency;
        }
      }
    }
    return total;
  }, [filteredPreviousData]);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 shrink-0">
        <DataPointList
          items={visibleItems}
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
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a data point to view details
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{detail.name}</h1>
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
            <div className="px-6 pb-6 space-y-6">
              {!anyPresented && detail.scenario_group_id && scenarioSummaries.length > 0 && (
                <ScenarioComparisonTable
                  summaries={scenarioSummaries}
                  currentDataPointId={detail.id}
                  budget={detail.budget}
                  previousTotal={previousTotal}
                  anyPresented={anyPresented}
                />
              )}
              <div className="flex flex-col 2xl:flex-row gap-6">
                {/* Member salary cards */}
                <div className="max-w-2xl min-w-0 2xl:flex-1 space-y-6">
                  {presentedMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members in this data point.</p>
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
                        onTogglePresented={handleTogglePresented}
                        scenarioComparison={
                          detail.scenario_group_id ? memberComparisons[member.member_id] : undefined
                        }
                      />
                    ))
                  )}
                </div>

                {/* Analytics */}
                {activeMembers.length > 0 && (
                  <div className="max-w-2xl min-w-0 2xl:flex-1 2xl:sticky 2xl:top-0 2xl:self-start space-y-6">
                    <Suspense fallback={<div className="h-64 animate-pulse rounded bg-muted" />}>
                      <SalaryAnalytics
                        detail={filteredDetail!}
                        previousData={filteredPreviousData}
                        anyPresented={anyPresented}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
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
    </div>
  );
}
