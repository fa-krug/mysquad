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
  start_date: string | null;
  notes: string | null;
  picture_path: string | null;
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

export interface Title {
  id: number;
  name: string;
  member_count: number;
}

export interface SalaryDataPointSummary {
  id: number;
  name: string;
  budget: number | null;
  created_at: string;
}

export interface SalaryDataPointDetail {
  id: number;
  name: string;
  budget: number | null;
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
