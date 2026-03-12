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
  salary: number | null;
  start_date: string | null;
  notes: string | null;
}

export interface Child {
  id: number;
  team_member_id: number;
  name: string;
  date_of_birth: string | null;
}

export interface CheckableItem {
  id: number;
  team_member_id: number;
  text: string;
  checked: boolean;
  created_at: string;
}

export interface Title {
  id: number;
  name: string;
  member_count: number;
}
