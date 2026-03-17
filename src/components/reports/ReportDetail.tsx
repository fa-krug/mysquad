import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { getReportBlockData } from "@/lib/db";
import type { Report, ReportBlockData } from "@/lib/types";
import { Download, Settings } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";
import { BlockRenderer } from "./blocks/BlockRenderer";

interface ReportDetailProps {
  report: Report;
  onEdit: () => void;
}

async function generatePdf(name: string, blocks: ReportBlockData[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(name, margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), margin, y);
  doc.setTextColor(0);
  y += 10;

  if (blocks.length === 0) {
    doc.setFontSize(11);
    doc.text("No blocks added to this report.", margin, y);
  }

  doc.save(`${name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  showSuccess("PDF exported");
}

export function ReportDetail({ report, onEdit }: ReportDetailProps) {
  const [blocks, setBlocks] = useState<ReportBlockData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBlocks = useCallback(async () => {
    try {
      const data = await getReportBlockData(report.id);
      setBlocks(data);
    } catch {
      showError("Failed to load report blocks");
    } finally {
      setLoading(false);
    }
  }, [report.id]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  if (loading) {
    return (
      <div className="max-w-2xl p-6 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{report.name}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={onEdit}>
            <Settings className="size-4" />
            Configure
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              generatePdf(report.name, blocks).catch(() => showError("Export failed"));
            }}
          >
            <Download className="size-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocks added yet. Click "Configure" to build your report.
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
