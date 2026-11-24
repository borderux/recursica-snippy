import { useEffect, useState } from "react";
import {
  responsesStorageKey,
  sanitizeResponses,
  type ReportResponses,
} from "../lib/responses";

// A report's stored responses, kept up to date as the responder works in
// the report (the page helper writes them; see src/page/responses.ts).
// Null when no report is showing, or until they have been read.
export function useReportResponses(
  reportKey: string | null,
): ReportResponses | null {
  const [state, setState] = useState<{
    key: string;
    responses: ReportResponses;
  } | null>(null);

  useEffect(() => {
    if (reportKey == null) return;
    const storageKey = responsesStorageKey(reportKey);
    let cancelled = false;
    const take = (raw: unknown) => {
      if (!cancelled)
        setState({ key: reportKey, responses: sanitizeResponses(raw) });
    };
    void chrome.storage.local
      .get(storageKey)
      .then((stored) => take(stored[storageKey]))
      .catch(() => {});
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && storageKey in changes)
        take(changes[storageKey].newValue);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [reportKey]);

  return state && state.key === reportKey ? state.responses : null;
}
