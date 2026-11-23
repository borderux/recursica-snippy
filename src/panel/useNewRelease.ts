import { useEffect, useState } from "react";
import { fetchNewerRelease, type Release } from "../lib/releases";

// A release newer than this build, checked once each time the panel opens
// (GitHub allows 60 unauthenticated requests an hour per address, far more
// than panel openings). Kept in memory only.
export function useNewRelease(): Release | null {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchNewerRelease(__APP_VERSION__, controller.signal).then((found) => {
      if (!controller.signal.aborted) setRelease(found);
    });
    return () => controller.abort();
  }, []);
  return release;
}
