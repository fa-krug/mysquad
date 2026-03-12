import { invoke } from "@tauri-apps/api/core";
import type {
  TeamMember,
  Child,
  CheckableItem,
  Title,
  SalaryDataPointSummary,
  SalaryDataPointDetail,
  SalaryPart,
} from "./types";

// Auth
export const authenticate = (reason: string) => invoke<void>("authenticate", { reason });
export const unlockDb = () => invoke<void>("unlock_db");
export const lockDb = () => invoke<void>("lock_db");

// Team Members
export const getTeamMembers = () => invoke<TeamMember[]>("get_team_members");
export const createTeamMember = () => invoke<TeamMember>("create_team_member");
export const updateTeamMember = (id: number, field: string, value: string | null) =>
  invoke<void>("update_team_member", { id, field, value });
export const deleteTeamMember = (id: number) => invoke<void>("delete_team_member", { id });

// Children (snake_case params to match Rust)
export const getChildren = (teamMemberId: number) =>
  invoke<Child[]>("get_children", { team_member_id: teamMemberId });
export const addChild = (teamMemberId: number, name: string, dateOfBirth: string | null) =>
  invoke<Child>("add_child", { team_member_id: teamMemberId, name, date_of_birth: dateOfBirth });
export const updateChild = (id: number, name: string, dateOfBirth: string | null) =>
  invoke<void>("update_child", { id, name, date_of_birth: dateOfBirth });
export const deleteChild = (id: number) => invoke<void>("delete_child", { id });

// Status Items
export const getStatusItems = (teamMemberId: number) =>
  invoke<CheckableItem[]>("get_status_items", { team_member_id: teamMemberId });
export const addStatusItem = (teamMemberId: number, text: string) =>
  invoke<CheckableItem>("add_status_item", { team_member_id: teamMemberId, text });
export const updateStatusItem = (id: number, text?: string, checked?: boolean) =>
  invoke<void>("update_status_item", { id, text: text ?? null, checked: checked ?? null });
export const deleteStatusItem = (id: number) => invoke<void>("delete_status_item", { id });

// Talk Topics
export const getTalkTopics = (teamMemberId: number) =>
  invoke<CheckableItem[]>("get_talk_topics", { team_member_id: teamMemberId });
export const addTalkTopic = (teamMemberId: number, text: string) =>
  invoke<CheckableItem>("add_talk_topic", { team_member_id: teamMemberId, text });
export const updateTalkTopic = (id: number, text?: string, checked?: boolean) =>
  invoke<void>("update_talk_topic", { id, text: text ?? null, checked: checked ?? null });
export const deleteTalkTopic = (id: number) => invoke<void>("delete_talk_topic", { id });

// Titles
export const getTitles = () => invoke<Title[]>("get_titles");
export const createTitle = (name: string) => invoke<Title>("create_title", { name });
export const updateTitle = (id: number, name: string) => invoke<void>("update_title", { id, name });
export const deleteTitle = (id: number) => invoke<void>("delete_title", { id });

// Salary Data Points
export const getSalaryDataPoints = () => invoke<SalaryDataPointSummary[]>("get_salary_data_points");
export const getSalaryDataPoint = (id: number) =>
  invoke<SalaryDataPointDetail>("get_salary_data_point", { id });
export const createSalaryDataPoint = () =>
  invoke<SalaryDataPointSummary>("create_salary_data_point");
export const updateSalaryDataPoint = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_data_point", { id, field, value });
export const deleteSalaryDataPoint = (id: number) =>
  invoke<void>("delete_salary_data_point", { id });

// Salary Data Point Members
export const updateSalaryDataPointMember = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_data_point_member", { id, field, value });

// Salary Parts
export const createSalaryPart = (dataPointMemberId: number) =>
  invoke<SalaryPart>("create_salary_part", { data_point_member_id: dataPointMemberId });
export const updateSalaryPart = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_part", { id, field, value });
export const deleteSalaryPart = (id: number) => invoke<void>("delete_salary_part", { id });

// Salary Ranges
export const updateSalaryRange = (
  dataPointId: number,
  titleId: number,
  minSalary: number,
  maxSalary: number,
) =>
  invoke<void>("update_salary_range", {
    data_point_id: dataPointId,
    title_id: titleId,
    min_salary: minSalary,
    max_salary: maxSalary,
  });

// Salary Comparison
export const getPreviousMemberData = (dataPointId: number, memberId: number) =>
  invoke<SalaryPart[] | null>("get_previous_member_data", {
    data_point_id: dataPointId,
    member_id: memberId,
  });

// Settings
export const getSetting = (key: string) => invoke<string | null>("get_setting", { key });
export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });
