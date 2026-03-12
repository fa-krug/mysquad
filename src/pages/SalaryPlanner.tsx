import { useState, useEffect, useCallback } from "react";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointModal } from "@/components/salary/DataPointModal";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { SalaryAnalytics } from "@/components/salary/SalaryAnalytics";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
import type { SalaryDataPointSummary, SalaryDataPointDetail, SalaryPart, Title } from "@/lib/types";

export function SalaryPlanner() {
  const [dataPoints, setDataPoints] = useState<SalaryDataPointSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[] | null>>({});
  const [titles, setTitles] = useState<Title[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDpId, setEditingDpId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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
    Promise.all([getSalaryDataPoints(), getTitles()]).then(([dps, t]) => {
      if (cancelled) return;
      setDataPoints(dps);
      setTitles(t);
      if (dps.length > 0) {
        setSelectedId(dps[0].id);
      }
      setLoading(false);
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

  async function handleCreate() {
    const dp = await createSalaryDataPoint();
    await loadDataPoints();
    setSelectedId(dp.id);
    setEditingDpId(dp.id);
    setModalOpen(true);
  }

  function handleEdit(dp: SalaryDataPointSummary) {
    setEditingDpId(dp.id);
    setModalOpen(true);
  }

  async function handleDelete(id: number) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await deleteSalaryDataPoint(id);
    const dps = await loadDataPoints();
    if (selectedId === id) {
      setSelectedId(dps.length > 0 ? dps[0].id : null);
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

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const activeMembers = detail?.members.filter((m) => m.is_active) ?? [];

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 shrink-0">
        <DataPointList
          dataPoints={dataPoints}
          selectedId={selectedId}
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
                <SalaryAnalytics detail={detail} previousData={previousData} />
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data Point</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this data point? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
