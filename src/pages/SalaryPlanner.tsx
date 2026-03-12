import { useState, useEffect } from "react";
import { getTeamMembers, updateTeamMember } from "@/lib/db";
import { useAutoSave } from "@/hooks/useAutoSave";
import { Input } from "@/components/ui/input";
import type { TeamMember } from "@/lib/types";

interface SalaryRowProps {
  member: TeamMember;
}

function SalaryRow({ member }: SalaryRowProps) {
  // salary is stored as cents in DB, displayed as dollars
  const [displayValue, setDisplayValue] = useState<string>(
    member.salary != null ? String(Math.round(member.salary / 100)) : ""
  );

  const { save, saving, saved, error } = useAutoSave({
    onSave: async (value) => {
      const cents =
        value === null || value === ""
          ? null
          : String(Math.round(parseFloat(value) * 100));
      await updateTeamMember(member.id, "salary", cents);
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDisplayValue(val);
    save(val === "" ? null : val);
  }

  const displayName = `${member.last_name}, ${member.first_name}`;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-2 text-sm">{displayName}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">
        {member.title_name ?? "—"}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min="0"
              step="1"
              value={displayValue}
              onChange={handleChange}
              className="pl-6 w-32 text-sm"
              placeholder="0"
            />
          </div>
          {saving && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
          {saved && !saving && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          {error && !saving && (
            <span className="text-xs text-destructive" title={error}>
              Error
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function SalaryPlanner() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeamMembers()
      .then((data) => {
        // Sort by last name, then first name
        const sorted = [...data].sort((a, b) => {
          const last = a.last_name.localeCompare(b.last_name);
          if (last !== 0) return last;
          return a.first_name.localeCompare(b.first_name);
        });
        setMembers(sorted);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Salary Planner</h1>

      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold">Name</th>
              <th className="px-4 py-2 text-left text-sm font-semibold">Title</th>
              <th className="px-4 py-2 text-left text-sm font-semibold">Salary</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No team members found.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <SalaryRow key={member.id} member={member} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
