import { useState, useCallback, useEffect, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LockScreen } from "./components/layout/LockScreen";
import { useTheme } from "./hooks/useTheme";

const TeamMembers = lazy(() =>
  import("@/pages/TeamMembers").then((m) => ({ default: m.TeamMembers })),
);
const Titles = lazy(() => import("@/pages/Titles").then((m) => ({ default: m.Titles })));
const SalaryPlanner = lazy(() =>
  import("@/pages/SalaryPlanner").then((m) => ({ default: m.SalaryPlanner })),
);
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const Reports = lazy(() => import("@/pages/Reports").then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })));
import { useAutoLock } from "./hooks/useAutoLock";
import { flushRegistry } from "./hooks/useAutoSave";
import { pendingDeleteRegistry } from "./hooks/usePendingDelete";
import { authenticate, unlockDb, lockDb, getConfig } from "./lib/db";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [requireAuth, setRequireAuth] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const { theme, setTheme } = useTheme(unlocked);

  // Check config on mount to decide auth flow
  useEffect(() => {
    getConfig("require_auth")
      .then((value) => {
        const authRequired = value !== "false";
        setRequireAuth(authRequired);
        setConfigLoaded(true);

        if (!authRequired) {
          unlockDb()
            .then(() => setUnlocked(true))
            .catch(() => {
              // If auto-unlock fails, fall back to requiring auth
              setRequireAuth(true);
            });
        }
      })
      .catch(() => {
        setConfigLoaded(true); // Default to requiring auth
      });
  }, []);

  const handleUnlock = useCallback(async () => {
    await authenticate("Unlock MySquad");
    await unlockDb();
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(async () => {
    for (const cancel of pendingDeleteRegistry) cancel();
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);

  useAutoLock({ onLock: handleLock, enabled: unlocked, requireAuth });

  // Show nothing while checking config
  if (!configLoaded) return null;

  if (!unlocked) {
    if (!requireAuth) return null; // Still waiting for unlockDb() to finish
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<TeamMembers />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/titles" element={<Titles />} />
          <Route path="/salary" element={<SalaryPlanner />} />
          <Route path="/reports" element={<Reports />} />
          <Route
            path="/settings"
            element={
              <Settings
                theme={theme}
                onThemeChange={setTheme}
                requireAuth={requireAuth}
                onRequireAuthChange={setRequireAuth}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
