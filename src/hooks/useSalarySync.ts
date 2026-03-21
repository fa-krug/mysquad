import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export function useSalarySync(onRefresh: () => void) {
  useEffect(() => {
    const unlisten = listen("salary-data-changed", () => {
      onRefresh();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onRefresh]);
}
