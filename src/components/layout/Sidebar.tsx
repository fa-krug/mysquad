import { NavLink } from "react-router-dom";
import { Users, BadgeCheck, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/", icon: Users, label: "Team Members" },
  { to: "/titles", icon: BadgeCheck, label: "Titles" },
  { to: "/salary", icon: DollarSign, label: "Salary Planner" },
];

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  extraClass,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  extraClass?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <NavLink
            to={to}
            className={({ isActive }: { isActive: boolean }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                extraClass
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        }
      />
      {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r bg-muted/40 transition-all duration-200",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        <div className="flex h-14 items-center px-3">
          <Button variant="ghost" size="icon" onClick={onToggle}>
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ to, icon, label }) => (
            <NavItem key={to} to={to} icon={icon} label={label} collapsed={collapsed} />
          ))}

          <div className="flex-1" />

          <NavItem
            to="/settings"
            icon={Settings}
            label="Settings"
            collapsed={collapsed}
            extraClass="mb-2"
          />
        </nav>
      </aside>
    </TooltipProvider>
  );
}
