import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { ReportList } from "@/components/reports/ReportList";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { ReportEditDialog } from "@/components/reports/ReportEditDialog";
import { getReports, createReport, deleteReport } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import { usePendingDelete } from "@/hooks/usePendingDelete";
import type { Report } from "@/lib/types";

export function Reports() {
  const location = useLocation();
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { scheduleDelete, pendingIds } = usePendingDelete();

  const loadReports = useCallback(async () => {
    const r = await getReports();
    setReports(r);
    return r;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReports()
      .then((r) => {
        if (!cancelled) setReports(r);
      })
      .catch(() => {
        if (!cancelled) showError("Failed to load reports");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-report") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await createReport();
      await loadReports();
      setSelectedId(created.id);
      setEditingId(created.id);
      showSuccess("Report created");
    } catch {
      showError("Failed to create report");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: number) => {
    const report = reports.find((r) => r.id === id);
    if (!report) return;
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    scheduleDelete({
      id,
      label: report.name || "Report",
      onConfirm: async () => {
        await deleteReport(id);
        await loadReports();
      },
    });
  };

  const handleReportChange = (updated: Report) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const visibleReports = useMemo(
    () => reports.filter((r) => !pendingIds.has(r.id)),
    [reports, pendingIds],
  );
  const selectedReport = visibleReports.find((r) => r.id === selectedId) ?? null;
  const editingReport = reports.find((r) => r.id === editingId) ?? null;

  return (
    <div className="flex h-full">
      <ReportList
        reports={visibleReports}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onEdit={(id) => setEditingId(id)}
      />
      <div className="flex-1 overflow-auto">
        {selectedReport ? (
          <ReportDetail
            key={`${selectedReport.id}-${selectedReport.collect_statuses}-${selectedReport.include_stakeholders}-${selectedReport.include_projects}`}
            report={selectedReport}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a report to view details
          </div>
        )}
      </div>

      {editingReport && (
        <ReportEditDialog
          report={editingReport}
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          onReportChange={handleReportChange}
        />
      )}
    </div>
  );
}
