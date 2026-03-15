import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getReportDetail } from "@/lib/db";
import type { Report, ReportDetail as ReportDetailType } from "@/lib/types";
import { Download } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";

interface ReportDetailProps {
  report: Report;
}

async function generatePdf(detail: ReportDetailType) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(detail.name, margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), margin, y);
  doc.setTextColor(0);
  y += 10;

  doc.save(`${detail.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  showSuccess("PDF exported");
}

export function ReportDetail({ report }: ReportDetailProps) {
  const [detail, setDetail] = useState<ReportDetailType | null>(null);

  useEffect(() => {
    getReportDetail(report.id)
      .then(setDetail)
      .catch(() => showError("Failed to load report details"));
  }, [report.id]);

  if (!detail) return null;

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{detail.name}</h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            generatePdf(detail).catch(() => showError("Export failed"));
          }}
        >
          <Download className="size-4" />
          Download PDF
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Report content will be available here in future updates.
      </p>
    </div>
  );
}
