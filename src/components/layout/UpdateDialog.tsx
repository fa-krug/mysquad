import { useState, useCallback, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

type DialogState =
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string; update: Update };

interface UpdateDialogProps {
  state: DialogState | null;
  onDismiss: () => void;
  onStateChange: (state: DialogState | null) => void;
}

export function UpdateDialog({ state, onDismiss, onStateChange }: UpdateDialogProps) {
  const [currentVersion, setCurrentVersion] = useState("");

  useEffect(() => {
    getVersion().then(setCurrentVersion);
  }, []);

  if (!state) return null;

  async function handleUpdate(update: Update) {
    onStateChange({ kind: "downloading", progress: 0 });
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            onStateChange({
              kind: "downloading",
              progress: Math.round((downloadedBytes / totalBytes) * 100),
            });
          }
        }
      });
      onStateChange({ kind: "ready" });
    } catch (err) {
      onStateChange({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
        update,
      });
    }
  }

  async function handleRelaunch() {
    await relaunch();
  }

  const isOpen = state !== null;
  const canDismiss = state.kind === "available" || state.kind === "error";

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && canDismiss) onDismiss();
      }}
    >
      <AlertDialogContent>
        {state.kind === "available" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Available</AlertDialogTitle>
              <AlertDialogDescription>
                Version {state.update.version} is available
                {currentVersion ? ` (you have ${currentVersion})` : ""}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {state.update.body && (
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {state.update.body}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Later</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleUpdate(state.update)}>
                Update Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state.kind === "downloading" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Downloading Update</AlertDialogTitle>
              <AlertDialogDescription>
                Please wait while the update is downloaded and installed...
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Progress value={state.progress} className="w-full" />
            <p className="text-center text-sm text-muted-foreground">{state.progress}%</p>
          </>
        )}

        {state.kind === "ready" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Installed</AlertDialogTitle>
              <AlertDialogDescription>
                The update has been installed successfully. Relaunch to start using the new version.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleRelaunch}>Relaunch Now</AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {state.kind === "error" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Failed</AlertDialogTitle>
              <AlertDialogDescription>{state.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleUpdate(state.update)}>
                Retry
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useUpdateCheck() {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const checkForUpdate = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const update = await check();
      if (update) {
        setDialogState({ kind: "available", update });
        return true;
      }
      return false;
    } catch {
      if (!options?.silent) {
        throw new Error("Failed to check for updates. Please check your internet connection.");
      }
      return false;
    }
  }, []);

  const dismiss = useCallback(() => setDialogState(null), []);

  return { dialogState, setDialogState, checkForUpdate, dismiss };
}
