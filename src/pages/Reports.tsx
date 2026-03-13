import { useState, useEffect, useCallback } from "react";
import { ReportList } from "@/components/reports/ReportList";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { ReportEditDialog } from "@/components/reports/ReportEditDialog";
import { getReports, createReport, deleteReport } from "@/lib/db";
import type { Report } from "@/lib/types";

export function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadReports = useCallback(async () => {
    const r = await getReports();
    setReports(r);
    return r;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReports().then((r) => {
      if (!cancelled) setReports(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const created = await createReport();
    await loadReports();
    setSelectedId(created.id);
    setEditingId(created.id);
  };

  const handleDelete = async (id: number) => {
    await deleteReport(id);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
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
