import { useState, useCallback, useRef } from "react";
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
  MessageSquare,
  ListChecks,
  Presentation,
} from "lucide-react";
import { globalSearch } from "@/lib/db";
import type { SearchResult } from "@/lib/types";

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
  { name: "Team Meetings", path: "/team-meetings", icon: Presentation },
];

const actions = [
  { name: "New Team Member", path: "/", action: "create-member", icon: Plus },
  { name: "New Project", path: "/projects", action: "create-project", icon: Plus },
  { name: "New Title", path: "/titles", action: "create-title", icon: Plus },
  { name: "New Report", path: "/reports", action: "create-report", icon: Plus },
  { name: "New Data Point", path: "/salary", action: "create-datapoint", icon: Plus },
];

const categoryConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    getRoute: (r: SearchResult) => { path: string; state: Record<string, unknown> };
  }
> = {
  team_member: {
    label: "Team Members",
    icon: Users,
    getRoute: (r) => ({ path: "/", state: { memberId: r.id } }),
  },
  project: {
    label: "Projects",
    icon: FolderKanban,
    getRoute: (r) => ({ path: "/projects", state: { projectId: r.id } }),
  },
  title: {
    label: "Titles",
    icon: BadgeCheck,
    getRoute: (r) => ({ path: "/titles", state: { titleId: r.id } }),
  },
  report: {
    label: "Reports",
    icon: FileText,
    getRoute: () => ({ path: "/reports", state: {} }),
  },
  talk_topic: {
    label: "Talk Topics",
    icon: MessageSquare,
    getRoute: (r) => ({ path: "/", state: { memberId: r.parent_id } }),
  },
  status_item: {
    label: "Status Items",
    icon: ListChecks,
    getRoute: (r) => ({ path: "/", state: { memberId: r.parent_id } }),
  },
  salary_data_point: {
    label: "Salary Data Points",
    icon: DollarSign,
    getRoute: (r) => ({ path: "/salary", state: { dataPointId: r.id } }),
  },
  scenario_group: {
    label: "Scenario Groups",
    icon: DollarSign,
    getRoute: (r) => ({ path: "/salary", state: { scenarioGroupId: r.id } }),
  },
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("");
        setSearchResults([]);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      globalSearch(value.trim()).then(setSearchResults);
    }, 200);
  }, []);

  const runCommand = useCallback(
    (callback: () => void) => {
      handleOpenChange(false);
      callback();
    },
    [handleOpenChange],
  );

  // Group search results by category
  const grouped = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const hasQuery = query.trim().length >= 2;

  const queryLower = query.trim().toLowerCase();
  const filteredPages = hasQuery
    ? pages.filter((p) => p.name.toLowerCase().includes(queryLower))
    : pages;
  const filteredActions = hasQuery
    ? actions.filter((a) => a.name.toLowerCase().includes(queryLower))
    : actions;
  const totalResults = filteredPages.length + filteredActions.length + searchResults.length;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Type a command or search..."
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        {hasQuery && totalResults === 0 && <CommandEmpty>No results found.</CommandEmpty>}

        {filteredPages.length > 0 && (
          <CommandGroup heading="Pages">
            {filteredPages.map((page) => (
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
        )}

        {filteredActions.length > 0 && (
          <CommandGroup heading="Actions">
            {filteredActions.map((action) => (
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
        )}

        {hasQuery &&
          Object.entries(grouped).map(([category, results]) => {
            const config = categoryConfig[category];
            if (!config) return null;
            const Icon = config.icon;

            return (
              <CommandGroup key={category} heading={config.label}>
                {results.map((r) => (
                  <CommandItem
                    key={`${category}-${r.id}`}
                    value={`search-${category}-${r.id}`}
                    onSelect={() =>
                      runCommand(() => {
                        const route = config.getRoute(r);
                        navigate(route.path, { state: route.state });
                      })
                    }
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{r.title}</span>
                    {r.subtitle && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
      </CommandList>
    </CommandDialog>
  );
}
