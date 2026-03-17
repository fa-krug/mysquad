import { BlockCard } from "./BlockCard";
import { TeamOverviewBlock } from "./TeamOverviewBlock";
import { MemberStatusesBlock } from "./MemberStatusesBlock";
import { OpenEscalationsBlock } from "./OpenEscalationsBlock";
import { ProjectStatusBlock } from "./ProjectStatusBlock";
import { SalarySummaryBlock } from "./SalarySummaryBlock";
import { OneOnOneCoverageBlock } from "./OneOnOneCoverageBlock";
import { UpcomingBirthdaysBlock } from "./UpcomingBirthdaysBlock";
import { SalaryOverTimeChart } from "@/components/salary/SalaryOverTimeChart";
import type {
  ReportBlockData,
  TeamOverviewData,
  MemberStatusesData,
  OpenEscalationsData,
  ProjectStatusData,
  SalarySummaryData,
  OneOnOneCoverageData,
  UpcomingBirthdaysData,
  SalaryOverTimePoint,
} from "@/lib/types";

export const BLOCK_LABELS: Record<string, string> = {
  team_overview: "Team Overview",
  member_statuses: "Member Statuses",
  open_escalations: "Open Escalations",
  project_status: "Project Status",
  salary_summary: "Salary Summary",
  one_on_one_coverage: "1:1 Coverage",
  upcoming_birthdays: "Upcoming Birthdays",
  salary_over_time: "Salary Over Time",
};

interface BlockRendererProps {
  block: ReportBlockData;
  onRemove?: (id: number) => void;
}

export function BlockRenderer({ block, onRemove }: BlockRendererProps) {
  const title = BLOCK_LABELS[block.block_type] ?? block.block_type;

  const content = (() => {
    switch (block.block_type) {
      case "team_overview":
        return <TeamOverviewBlock data={block.data as TeamOverviewData} />;
      case "member_statuses":
        return <MemberStatusesBlock data={block.data as MemberStatusesData} />;
      case "open_escalations":
        return <OpenEscalationsBlock data={block.data as OpenEscalationsData} />;
      case "project_status":
        return <ProjectStatusBlock data={block.data as ProjectStatusData} />;
      case "salary_summary":
        return <SalarySummaryBlock data={block.data as SalarySummaryData} />;
      case "one_on_one_coverage":
        return <OneOnOneCoverageBlock data={block.data as OneOnOneCoverageData} />;
      case "upcoming_birthdays":
        return <UpcomingBirthdaysBlock data={block.data as UpcomingBirthdaysData} />;
      case "salary_over_time":
        return <SalaryOverTimeChart data={block.data as SalaryOverTimePoint[]} />;
      default:
        return <p className="text-sm text-muted-foreground">Unknown block type.</p>;
    }
  })();

  return (
    <BlockCard title={title} onRemove={onRemove ? () => onRemove(block.id) : undefined}>
      {content}
    </BlockCard>
  );
}
