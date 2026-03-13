import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Users,
  FolderKanban,
  BadgeCheck,
  DollarSign,
  FileText,
  Settings,
  Plus,
} from "lucide-react";
import { getTeamMembers, getProjects, getTitles } from "@/lib/db";
import type { TeamMember, Project, Title } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pages = [
  { name: "Team Members", path: "/", icon: Users },
  { name: "Projects", path: "/projects", icon: FolderKanban },
  { name: "Titles", path: "/titles", icon: BadgeCheck },
  { name: "Salary Planner", path: "/salary", icon: DollarSign },
  { name: "Reports", path: "/reports", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

const actions = [
  { name: "New Team Member", path: "/", action: "create-member", icon: Plus },
  { name: "New Project", path: "/projects", action: "create-project", icon: Plus },
  { name: "New Title", path: "/titles", action: "create-title", icon: Plus },
  { name: "New Report", path: "/reports", action: "create-report", icon: Plus },
  { name: "New Data Point", path: "/salary", action: "create-datapoint", icon: Plus },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([getTeamMembers(), getProjects(), getTitles()]).then(([m, p, t]) => {
      setMembers(m);
      setProjects(p);
      setTitles(t);
    });
  }, [open]);

  const runCommand = useCallback(
    (callback: () => void) => {
      onOpenChange(false);
      callback();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Team Members">
          {members.map((m) => (
            <CommandItem
              key={`member-${m.id}`}
              value={`${m.first_name} ${m.last_name}`}
              onSelect={() => runCommand(() => navigate("/", { state: { memberId: m.id } }))}
            >
              <Users className="mr-2 h-4 w-4" />
              {m.first_name} {m.last_name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <CommandItem
              key={`project-${p.id}`}
              value={p.name || "Untitled Project"}
              onSelect={() =>
                runCommand(() => navigate("/projects", { state: { projectId: p.id } }))
              }
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              {p.name || "Untitled Project"}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Titles">
          {titles.map((t) => (
            <CommandItem
              key={`title-${t.id}`}
              value={t.name}
              onSelect={() => runCommand(() => navigate("/titles", { state: { titleId: t.id } }))}
            >
              <BadgeCheck className="mr-2 h-4 w-4" />
              {t.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem
              key={page.path}
              value={page.name}
              onSelect={() => runCommand(() => navigate(page.path))}
            >
              <page.icon className="mr-2 h-4 w-4" />
              {page.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem
              key={action.action}
              value={action.name}
              onSelect={() =>
                runCommand(() => navigate(action.path, { state: { action: action.action } }))
              }
            >
              <action.icon className="mr-2 h-4 w-4" />
              {action.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
