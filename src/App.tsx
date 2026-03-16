import { useState, useCallback, useEffect, useRef, lazy } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppLayout } from "./components/layout/AppLayout";
import { LockScreen } from "./components/layout/LockScreen";
import { UpdateDialog, useUpdateCheck } from "./components/layout/UpdateDialog";
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
const Meeting = lazy(() => import("@/pages/Meeting").then((m) => ({ default: m.Meeting })));
const TeamMeetingsPage = lazy(() =>
  import("@/pages/TeamMeetings").then((m) => ({ default: m.TeamMeetings })),
);
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })));
import { useAutoLock } from "./hooks/useAutoLock";
import { flushRegistry } from "./hooks/useAutoSave";
import {
  authenticate,
  unlockDb,
  lockDb,
  getConfig,
  getTalkTopicById,
  getSetting,
  setSetting,
} from "./lib/db";
import { Onboarding } from "./components/onboarding/Onboarding";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

function parseDeepLink(url: string): { topicId: number } | null {
  const match = url.match(/^mysquad:\/\/talktopic\/(\d+)/);
  if (!match) return null;
  return { topicId: Number(match[1]) };
}

function DeepLinkHandler({
  pendingUrlRef,
}: {
  pendingUrlRef: React.MutableRefObject<string | null>;
}) {
  const navigate = useNavigate();

  const handleDeepLink = useCallback(
    async (url: string) => {
      const parsed = parseDeepLink(url);
      if (!parsed) return;
      try {
        const topic = await getTalkTopicById(parsed.topicId);
        navigate("/", {
          state: { memberId: topic.team_member_id, highlightTalkTopicId: topic.id },
        });
      } catch {
        // Topic may have been deleted — ignore
      }
    },
    [navigate],
  );

  useEffect(() => {
    // Process any URL that arrived while locked
    if (pendingUrlRef.current) {
      const url = pendingUrlRef.current;
      pendingUrlRef.current = null;
      handleDeepLink(url);
    }
  }, [handleDeepLink, pendingUrlRef]);

  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      if (urls.length > 0) handleDeepLink(urls[0]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleDeepLink]);

  return null;
}

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [requireAuth, setRequireAuth] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { theme, setTheme } = useTheme(unlocked);
  const pendingDeepLink = useRef<string | null>(null);

  // Listen for deep links before unlock so we can queue them
  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      if (urls.length > 0) pendingDeepLink.current = urls[0];
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);

  useAutoLock({ onLock: handleLock, enabled: unlocked, requireAuth });

  // Check onboarding status after DB unlock
  useEffect(() => {
    if (!unlocked) return;
    getSetting("onboarding_completed")
      .then((value) => {
        setShowOnboarding(value !== "true");
        setOnboardingChecked(true);
      })
      .catch(() => {
        setShowOnboarding(true);
        setOnboardingChecked(true);
      });
  }, [unlocked]);

  const handleShowWelcome = useCallback(async () => {
    try {
      await setSetting("onboarding_completed", "false");
    } catch {
      // Best effort
    }
    setShowOnboarding(true);
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await setSetting("onboarding_completed", "true");
    } catch {
      // Best effort — continue to the app
    }
    setShowOnboarding(false);
  }, []);

  const { dialogState, setDialogState, checkForUpdate, dismiss } = useUpdateCheck();

  // Check for updates after unlock (main window only)
  useEffect(() => {
    if (unlocked && getCurrentWebviewWindow().label === "main") {
      checkForUpdate({ silent: true });
    }
  }, [unlocked, checkForUpdate]);

  // Show nothing while checking config
  if (!configLoaded) return null;

  if (!unlocked) {
    if (!requireAuth) return null; // Still waiting for unlockDb() to finish
    return <LockScreen onUnlock={handleUnlock} />;
  }

  // Show nothing while checking onboarding status
  if (!onboardingChecked) return null;

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <>
      <UpdateDialog state={dialogState} onDismiss={dismiss} onStateChange={setDialogState} />
      <BrowserRouter>
        <DeepLinkHandler pendingUrlRef={pendingDeepLink} />
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TeamMembers />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/titles" element={<Titles />} />
            <Route path="/salary" element={<SalaryPlanner />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/meeting/:meetingId" element={<Meeting />} />
            <Route path="/team-meetings" element={<TeamMeetingsPage />} />
            <Route
              path="/settings"
              element={
                <Settings
                  theme={theme}
                  onThemeChange={setTheme}
                  requireAuth={requireAuth}
                  onRequireAuthChange={setRequireAuth}
                  onShowWelcome={handleShowWelcome}
                  onCheckForUpdate={checkForUpdate}
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
