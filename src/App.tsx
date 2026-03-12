import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LockScreen } from "./components/layout/LockScreen";
import { TeamMembers } from "./pages/TeamMembers";
import { Titles } from "./pages/Titles";
import { SalaryPlanner } from "./pages/SalaryPlanner";
import { Projects } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";
import { useTheme } from "./hooks/useTheme";
import { useAutoLock } from "./hooks/useAutoLock";
import { flushRegistry } from "./hooks/useAutoSave";
import { authenticate, unlockDb, lockDb } from "./lib/db";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const { theme, setTheme } = useTheme(unlocked);

  const handleUnlock = useCallback(async () => {
    await authenticate("Unlock MySquad");
    await unlockDb();
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(async () => {
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);

  useAutoLock({ onLock: handleLock, enabled: unlocked });

  if (!unlocked) {
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
          <Route
            path="/settings"
            element={<SettingsPage theme={theme} onThemeChange={setTheme} />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
