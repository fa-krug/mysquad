import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ReportList } from "@/components/reports/ReportList";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { ReportModal } from "@/components/reports/ReportModal";
import { getReports, createReport, deleteReport } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorRetry } from "@/components/ui/error-retry";
import type { Report } from "@/lib/types";
import { useResourceLoader } from "@/hooks/useResourceLoader";

export function Reports() {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const {
    data: reports,
    setData: setReports,
    loading,
    error,
    reload: loadReports,
  } = useResourceLoader(() => getReports(), [] as Report[]);

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

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    await deleteReport(id);
    await loadReports();
  };

  const handleReportChange = (updated: Report) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;
  const editingReport = reports.find((r) => r.id === editingId) ?? null;

  return (
    <div className="flex h-full">
      <ReportList
        reports={reports}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onEdit={(id) => setEditingId(id)}
      />
      <div className="flex-1 overflow-auto">
        <ErrorBoundary>
          {selectedReport ? (
            <ReportDetail
              key={`${selectedReport.id}-${selectedReport.collect_statuses}-${selectedReport.include_stakeholders}-${selectedReport.include_projects}`}
              report={selectedReport}
              onEdit={() => setEditingId(selectedReport.id)}
            />
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <ErrorRetry message="Failed to load reports" onRetry={loadReports} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">Select a report</p>
            </div>
          )}
        </ErrorBoundary>
      </div>

      {editingReport && (
        <ReportModal
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
