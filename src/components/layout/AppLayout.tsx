import { useState, useEffect, Suspense } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { Toaster } from "@/components/ui/sonner";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

const navPaths = ["/", "/projects", "/titles", "/salary", "/reports"];

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (e.metaKey && e.key === "/") {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      if (e.metaKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (navPaths[index]) navigate(navPaths[index]);
        return;
      }

      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        navigate(location.pathname, {
          state: { action: "create" },
          replace: true,
        });
        return;
      }

      if (e.metaKey && e.key === "Backspace") {
        e.preventDefault();
        navigate(location.pathname, {
          state: { action: "delete" },
          replace: true,
        });
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="flex-1 overflow-auto">
        <Suspense fallback={<DetailSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Toaster />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
