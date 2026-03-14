import type { TeamMember } from "./types";

export interface TreeRow {
  member: TeamMember;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * Build a map of lead_id -> children from a flat member array.
 */
export function buildChildrenMap(members: TeamMember[]): Map<number | null, TeamMember[]> {
  const map = new Map<number | null, TeamMember[]>();
  for (const m of members) {
    const key = m.lead_id;
    const list = map.get(key);
    if (list) {
      list.push(m);
    } else {
      map.set(key, [m]);
    }
  }
  return map;
}

/**
 * Flatten a tree of members into a visible row list,
 * respecting collapse state.
 */
export function flattenTree(members: TeamMember[], collapsedIds: Set<number>): TreeRow[] {
  const childrenMap = buildChildrenMap(members);
  const rows: TreeRow[] = [];

  function walk(leadId: number | null, depth: number) {
    const children = childrenMap.get(leadId) ?? [];
    const sorted = [...children].sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    );
    for (const member of sorted) {
      const memberChildren = childrenMap.get(member.id);
      const hasChildren = !!memberChildren && memberChildren.length > 0;
      const isExpanded = !collapsedIds.has(member.id);
      rows.push({ member, depth, hasChildren, isExpanded });
      if (hasChildren && isExpanded) {
        walk(member.id, depth + 1);
      }
    }
  }

  walk(null, 0);
  return rows;
}

/**
 * Get all descendant IDs of a member (used to filter the lead dropdown).
 */
export function getSubtreeIds(members: TeamMember[], rootId: number): Set<number> {
  const childrenMap = buildChildrenMap(members);
  const ids = new Set<number>();

  function walk(id: number) {
    const children = childrenMap.get(id) ?? [];
    for (const child of children) {
      ids.add(child.id);
      walk(child.id);
    }
  }

  walk(rootId);
  return ids;
}
