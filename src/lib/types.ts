export interface TeamMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_zip: string | null;
  title_id: number | null;
  title_name: string | null;
  current_title_id: number | null;
  current_title_name: string | null;
  current_title_data_point_id: number | null;
  start_date: string | null;
  notes: string | null;
  picture_path: string | null;
  exclude_from_salary: boolean;
  left_date: string | null;
  lead_id: number | null;
  lead_name: string | null;
}

export interface Child {
  id: number;
  team_member_id: number;
  name: string;
  date_of_birth: string | null;
}

// Base interface for checkable items (used by CheckableList component)
export interface BaseCheckableItem {
  id: number;
  text: string;
  checked: boolean;
  created_at: string;
}

export interface CheckableItem extends BaseCheckableItem {
  team_member_id: number;
}

export interface Project {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  team_member_id: number;
  first_name: string;
  last_name: string;
}

export interface ProjectStatusItem extends BaseCheckableItem {
  project_id: number;
}

export interface ProjectLink {
  id: number;
  project_id: number;
  url: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface Title {
  id: number;
  name: string;
  member_count: number;
}

export interface Report {
  id: number;
  name: string;
  collect_statuses: boolean;
  include_stakeholders: boolean;
  include_projects: boolean;
}

export interface ReportStatusItem {
  id: number;
  text: string;
  checked: boolean;
}

export interface ReportMemberStatus {
  member_id: number;
  first_name: string;
  last_name: string;
  title_name: string | null;
  is_stakeholder: boolean;
  statuses: ReportStatusItem[];
}

export interface ReportProjectStatus {
  project_id: number;
  project_name: string;
  statuses: ReportStatusItem[];
}

export interface ReportDetail {
  id: number;
  name: string;
  collect_statuses: boolean;
  include_stakeholders: boolean;
  include_projects: boolean;
  stakeholders: ReportMemberStatus[];
  members: ReportMemberStatus[];
  projects: ReportProjectStatus[];
}

export interface ReportBlock {
  id: number;
  report_id: number;
  block_type: string;
  sort_order: number;
}

export interface TeamOverviewData {
  active_count: number;
  left_count: number;
  title_breakdown: { title_name: string; count: number }[];
}

export interface MemberStatusesData {
  members: {
    member_id: number;
    first_name: string;
    last_name: string;
    statuses: { id: number; text: string }[];
  }[];
}

export interface OpenEscalationsData {
  escalations: {
    id: number;
    text: string;
    member_name: string;
    escalated_at: string | null;
  }[];
}

export interface ProjectStatusData {
  projects: {
    project_id: number;
    name: string;
    total: number;
    done: number;
  }[];
}

export interface SalarySummaryData {
  data_point_name: string | null;
  total_salary: number;
  budget: number | null;
  headcount: number;
}

export interface OneOnOneCoverageData {
  members: {
    member_id: number;
    first_name: string;
    last_name: string;
    last_meeting_date: string | null;
  }[];
}

export interface UpcomingBirthdaysData {
  birthdays: {
    child_name: string;
    date_of_birth: string;
    parent_name: string;
    days_until: number;
  }[];
}

export type ReportBlockDataPayload =
  | TeamOverviewData
  | MemberStatusesData
  | OpenEscalationsData
  | ProjectStatusData
  | SalarySummaryData
  | OneOnOneCoverageData
  | UpcomingBirthdaysData
  | SalaryOverTimePoint[];

export interface ReportBlockData {
  id: number;
  block_type: string;
  sort_order: number;
  data: ReportBlockDataPayload;
}

export interface SalaryDataPointSummary {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  created_at: string;
  scenario_group_id: number | null;
}

export interface SalaryDataPointDetail {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  scenario_group_id: number | null;
  template_path: string | null;
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
}

export interface SalaryDataPointMember {
  id: number;
  member_id: number;
  first_name: string;
  last_name: string;
  title_id: number | null;
  title_name: string | null;
  is_active: boolean;
  is_promoted: boolean;
  promoted_title_id: number | null;
  promoted_title_name: string | null;
  parts: SalaryPart[];
}

export interface SalaryPart {
  id: number;
  name: string | null;
  amount: number;
  frequency: number;
  is_variable: boolean;
  sort_order: number;
}

export interface SalaryRange {
  id: number;
  title_id: number;
  title_name: string;
  min_salary: number;
  max_salary: number;
}

export interface SalaryOverTimeMember {
  member_id: number;
  first_name: string;
  last_name: string;
  left_date: string | null;
  annual_total: number;
}

export interface SalaryOverTimePoint {
  data_point_id: number;
  data_point_name: string;
  members: SalaryOverTimeMember[];
}

export interface SalaryDataPointFull {
  detail: SalaryDataPointDetail;
  lineage: SalaryOverTimePoint[];
  previous_data: Record<number, SalaryPart[]>;
  previous_data_point_name: string | null;
}

export interface ScenarioGroup {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  created_at: string;
  children: SalaryDataPointSummary[];
}

export type SalaryListItem =
  | { type: "data_point"; data_point: SalaryDataPointSummary }
  | { type: "scenario_group"; scenario_group: ScenarioGroup };

export interface ScenarioSummary {
  data_point_id: number;
  data_point_name: string;
  total_salary: number;
  headcount: number;
}

export interface Meeting {
  id: number;
  team_member_id: number;
  date: string;
  created_at: string;
  update_count: number;
}

export interface MeetingMemberInfo {
  first_name: string;
  last_name: string;
  title_name: string | null;
  start_date: string | null;
  email: string | null;
  picture_path: string | null;
  lead_name: string | null;
}

export interface MeetingDetail {
  id: number;
  team_member_id: number;
  date: string;
  member: MeetingMemberInfo;
  previous_updates: CheckableItem[];
  talk_topics: MeetingTalkTopic[];
  meeting_updates: CheckableItem[];
  meeting_talk_topics: MeetingTalkTopic[];
  escalated_with_response: EscalatedTopic[];
}

export interface MeetingTalkTopic extends CheckableItem {
  escalated: boolean;
}

export interface ScenarioMemberComparison {
  data_point_id: number;
  data_point_name: string;
  annual_total: number;
}

export interface EscalatedTopic {
  id: number;
  team_member_id: number;
  text: string;
  checked: boolean;
  escalated: boolean;
  escalated_at: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface SearchResult {
  id: number;
  category: "team_member" | "project" | "title" | "report" | "talk_topic" | "status_item";
  title: string;
  subtitle: string | null;
  parent_id: number | null;
}

export interface TeamMeeting {
  id: number;
  date: string;
  created_at: string;
  escalated_topic_count: number;
}

export interface TeamMeetingMemberGroup {
  member_id: number;
  first_name: string;
  last_name: string;
  title_name: string | null;
  picture_path: string | null;
  escalated_topics: EscalatedTopic[];
  updates: ReportStatusItem[];
}

export interface TeamMeetingProjectGroup {
  project_id: number;
  project_name: string;
  updates: ReportStatusItem[];
}

export interface TeamMeetingDetail {
  id: number;
  date: string;
  member_groups: TeamMeetingMemberGroup[];
  project_groups: TeamMeetingProjectGroup[];
}
