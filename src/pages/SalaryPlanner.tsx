import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointModal } from "@/components/salary/DataPointModal";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";

const SalaryAnalytics = lazy(() =>
  import("@/components/salary/SalaryAnalytics").then((m) => ({ default: m.SalaryAnalytics })),
);
import { usePendingDelete } from "@/hooks/usePendingDelete";
import {
  getSalaryDataPoints,
  getSalaryDataPoint,
  createSalaryDataPoint,
  deleteSalaryDataPoint,
  createSalaryPart,
  deleteSalaryPart as deleteSalaryPartApi,
  getPreviousMemberData,
  getTitles,
} from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import type { SalaryDataPointSummary, SalaryDataPointDetail, SalaryPart, Title } from "@/lib/types";

export function SalaryPlanner() {
  const location = useLocation();
  const [dataPoints, setDataPoints] = useState<SalaryDataPointSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[] | null>>({});
  const [titles, setTitles] = useState<Title[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDpId, setEditingDpId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { scheduleDelete, pendingIds } = usePendingDelete();

  const loadDataPoints = useCallback(async () => {
    const [dps, t] = await Promise.all([getSalaryDataPoints(), getTitles()]);
    setDataPoints(dps);
    setTitles(t);
    return dps;
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);

    // Load comparison data for active members
    const prev: Record<number, SalaryPart[] | null> = {};
    await Promise.all(
      d.members
        .filter((m) => m.is_active)
        .map(async (m) => {
          prev[m.member_id] = await getPreviousMemberData(id, m.member_id);
        }),
    );
    setPreviousData(prev);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSalaryDataPoints(), getTitles()])
      .then(([dps, t]) => {
        if (cancelled) return;
        setDataPoints(dps);
        setTitles(t);
        if (dps.length > 0) {
          setSelectedId(dps[0].id);
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
        d.members
          .filter((m) => m.is_active)
          .map(
            async (m) =>
              [m.member_id, await getPreviousMemberData(selectedId, m.member_id)] as const,
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
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-datapoint") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    }
  }, [location.state]);

  async function handleCreate() {
    setCreating(true);
    try {
      const dp = await createSalaryDataPoint();
      await loadDataPoints();
      setSelectedId(dp.id);
      setEditingDpId(dp.id);
      setModalOpen(true);
      showSuccess("Data point created");
    } catch {
      showError("Failed to create data point");
    } finally {
      setCreating(false);
    }
  }

  function handleEdit(dp: SalaryDataPointSummary) {
    setEditingDpId(dp.id);
    setModalOpen(true);
  }

  function handleDelete(id: number) {
    const dp = dataPoints.find((d) => d.id === id);
    if (!dp) return;
    const wasSelected = selectedId === id;
    scheduleDelete({
      id,
      label: dp.name || "Data point",
      onConfirm: async () => {
        await deleteSalaryDataPoint(id);
        const dps = await loadDataPoints();
        if (wasSelected) {
          setSelectedId(dps.length > 0 ? dps[0].id : null);
          setDetail(null);
        }
      },
      onUndo: wasSelected
        ? () => {
            setSelectedId(id);
          }
        : undefined,
    });
    if (wasSelected) {
      const remaining = dataPoints.filter((d) => d.id !== id && !pendingIds.has(d.id));
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      setDetail(null);
    }
  }

  async function handleAddPart(dataPointMemberId: number) {
    await createSalaryPart(dataPointMemberId);
    if (selectedId) await loadDetailOnly(selectedId);
  }

  async function handleDeletePart(partId: number) {
    await deleteSalaryPartApi(partId);
    if (selectedId) await loadDetailOnly(selectedId);
  }

  // Light refetch: only detail, no comparison data (used for part edits)
  const loadDetailOnly = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);
  }, []);

  function handlePartChanged() {
    if (selectedId) loadDetailOnly(selectedId);
  }

  async function handleModalSaved() {
    await loadDataPoints();
    if (selectedId) await loadDetail(selectedId);
  }

  const activeMembers = useMemo(() => detail?.members.filter((m) => m.is_active) ?? [], [detail]);
  const visibleDataPoints = useMemo(
    () => dataPoints.filter((d) => !pendingIds.has(d.id)),
    [dataPoints, pendingIds],
  );

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 shrink-0">
        <DataPointList
          dataPoints={visibleDataPoints}
          selectedId={selectedId}
          loading={loading}
          creating={creating}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a data point to view details
          </div>
        ) : (
          <div className="max-w-2xl p-6 space-y-6">
            <h1 className="text-2xl font-bold">{detail.name}</h1>

            {/* Member salary cards */}
            {activeMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active members in this data point.</p>
            ) : (
              activeMembers.map((member) => (
                <MemberSalaryCard
                  key={member.id}
                  member={member}
                  ranges={detail.ranges}
                  onAddPart={handleAddPart}
                  onDeletePart={handleDeletePart}
                  onChanged={handlePartChanged}
                />
              ))
            )}

            {/* Analytics */}
            {activeMembers.length > 0 && (
              <>
                <hr className="border-border" />
                <Suspense fallback={<div className="h-64 animate-pulse rounded bg-muted" />}>
                  <SalaryAnalytics detail={detail} previousData={previousData} />
                </Suspense>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <DataPointModal
        dataPointId={editingDpId}
        titles={titles}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleModalSaved}
      />
    </div>
  );
}
