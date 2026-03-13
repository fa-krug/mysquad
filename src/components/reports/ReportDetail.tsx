import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { getReportDetail } from "@/lib/db";
import type {
  Report,
  ReportDetail as ReportDetailType,
  ReportMemberStatus,
  ReportProjectStatus,
} from "@/lib/types";
import { CheckIcon, Download } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";

interface ReportDetailProps {
  report: Report;
}

function StatusItem({ text, checked }: { text: string; checked: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {checked ? (
        <CheckIcon className="size-3.5 mt-0.5 shrink-0 text-green-600" />
      ) : (
        <span className="size-3.5 mt-0.5 shrink-0 rounded-sm border border-muted-foreground/40" />
      )}
      <span className={checked ? "line-through text-muted-foreground" : ""}>{text}</span>
    </li>
  );
}

function MemberStatusSection({ member }: { member: ReportMemberStatus }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">
          {member.first_name} {member.last_name}
        </span>
        {member.title_name && (
          <span className="text-xs text-muted-foreground">{member.title_name}</span>
        )}
      </div>
      {member.statuses.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-2">No status items</p>
      ) : (
        <ul className="space-y-0.5 pl-2">
          {member.statuses.map((s) => (
            <StatusItem key={s.id} text={s.text} checked={s.checked} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectStatusSection({ project }: { project: ReportProjectStatus }) {
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{project.project_name}</span>
      {project.statuses.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-2">No status items</p>
      ) : (
        <ul className="space-y-0.5 pl-2">
          {project.statuses.map((s) => (
            <StatusItem key={s.id} text={s.text} checked={s.checked} />
          ))}
        </ul>
      )}
    </div>
  );
}

async function generatePdf(detail: ReportDetailType) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
  };

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

  const renderStatusList = (statuses: { text: string; checked: boolean }[], indent: number) => {
    if (statuses.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text("No status items", margin + indent, y);
      doc.setTextColor(0);
      y += 5;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const s of statuses) {
        checkPageBreak(6);
        const prefix = s.checked ? "[x] " : "[ ] ";
        const lines = doc.splitTextToSize(prefix + s.text, maxWidth - indent);
        if (s.checked) doc.setTextColor(150);
        doc.text(lines, margin + indent, y);
        if (s.checked) doc.setTextColor(0);
        y += lines.length * 4.5;
      }
    }
  };

  const renderSectionHeading = (title: string) => {
    checkPageBreak(14);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100);
    doc.text(title.toUpperCase(), margin, y);
    doc.setTextColor(0);
    y += 8;
  };

  if (detail.stakeholders.length > 0) {
    renderSectionHeading("Stakeholders");
    for (const member of detail.stakeholders) {
      checkPageBreak(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      let label = `${member.first_name} ${member.last_name}`;
      if (member.title_name) label += `  —  ${member.title_name}`;
      doc.text(label, margin, y);
      y += 5;
      renderStatusList(member.statuses, 4);
      y += 3;
    }
  }

  if (detail.members.length > 0) {
    renderSectionHeading("Team Members");
    for (const member of detail.members) {
      checkPageBreak(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      let label = `${member.first_name} ${member.last_name}`;
      if (member.title_name) label += `  —  ${member.title_name}`;
      doc.text(label, margin, y);
      y += 5;
      renderStatusList(member.statuses, 4);
      y += 3;
    }
  }

  if (detail.projects.length > 0) {
    renderSectionHeading("Projects");
    for (const project of detail.projects) {
      checkPageBreak(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(project.project_name, margin, y);
      y += 5;
      renderStatusList(project.statuses, 4);
      y += 3;
    }
  }

  doc.save(`${detail.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  showSuccess("PDF exported");
}

export function ReportDetail({ report }: ReportDetailProps) {
  const [detail, setDetail] = useState<ReportDetailType | null>(null);

  useEffect(() => {
    getReportDetail(report.id)
      .then(setDetail)
      .catch(() => showError("Failed to load report details"));
  }, [report.id, report.collect_statuses, report.include_stakeholders, report.include_projects]);

  if (!detail) return null;

  const hasContent =
    detail.stakeholders.length > 0 || detail.members.length > 0 || detail.projects.length > 0;

  if (!hasContent) {
    return (
      <div className="max-w-2xl p-6 space-y-6">
        <h2 className="text-lg font-semibold">{detail.name}</h2>
        <p className="text-sm text-muted-foreground">
          Nothing to show yet. Edit the report to enable content sections.
        </p>
      </div>
    );
  }

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

      {detail.stakeholders.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Stakeholders
            </h3>
            {detail.stakeholders.map((m) => (
              <MemberStatusSection key={m.member_id} member={m} />
            ))}
          </div>
        </>
      )}

      {detail.members.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Team Members
            </h3>
            {detail.members.map((m) => (
              <MemberStatusSection key={m.member_id} member={m} />
            ))}
          </div>
        </>
      )}

      {detail.projects.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Projects
            </h3>
            {detail.projects.map((p) => (
              <ProjectStatusSection key={p.project_id} project={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
