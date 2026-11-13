import { useEffect, useState } from "react";
import { pageKeyFromUrl } from "../lib/pageKey";
import { ensureHelper } from "./pageBridge";

// The tab the side panel is showing: the active tab of the panel's own
// window. One panel serves the whole window, so it follows whichever tab
// is active, and the page it comments on is that tab's page.
export interface ActiveTab {
  tabId: number;
  windowId: number;
  // The page's key (see lib/pageKey.ts), or null where Snippy can't
  // comment (chrome://, the new tab page and so on).
  pageKey: string | null;
  title: string;
  // Whether the page helper is installed: "checking" while the page loads,
  // "blocked" when the page refuses scripting.
  access: "checking" | "ok" | "blocked";
}

export function useActiveTab(): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);

  useEffect(() => {
    let windowId: number | undefined;
    let current: number | undefined;
    let cancelled = false;

    // Re-reads the tab, and installs the helper once its page is loaded.
    // Single-page apps change the address without a load; Chrome reports
    // that as a url change, which lands here too.
    const read = async (tabId: number) => {
      let info: chrome.tabs.Tab;
      try {
        info = await chrome.tabs.get(tabId);
      } catch {
        return;
      }
      if (cancelled || tabId !== current) return;
      const pageKey = pageKeyFromUrl(info.url);
      const base = {
        tabId,
        windowId: info.windowId,
        pageKey,
        title: info.title ?? "",
      };
      if (!pageKey) {
        setTab({ ...base, access: "blocked" });
        return;
      }
      if (info.status !== "complete") {
        setTab((prev) => ({
          ...base,
          // Same page still loading (a reload, a hash change): keep the
          // access it had rather than flicker.
          access:
            prev?.tabId === tabId && prev.pageKey === pageKey
              ? prev.access
              : "checking",
        }));
        return;
      }
      const ok = await ensureHelper(tabId);
      if (cancelled || tabId !== current) return;
      setTab({ ...base, access: ok ? "ok" : "blocked" });
    };

    const follow = async () => {
      if (windowId == null) return;
      const [active] = await chrome.tabs.query({ active: true, windowId });
      if (cancelled || active?.id == null) return;
      current = active.id;
      await read(active.id);
    };

    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (info.windowId !== windowId) return;
      current = info.tabId;
      void read(info.tabId);
    };
    const onUpdated = (
      tabId: number,
      change: { status?: string; url?: string; title?: string },
    ) => {
      if (tabId !== current) return;
      if (change.status || change.url || change.title) void read(tabId);
    };
    // A tab dragged into or out of this window.
    const onMoved = () => void follow();

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onAttached.addListener(onMoved);
    chrome.tabs.onDetached.addListener(onMoved);
    void chrome.windows.getCurrent().then((win) => {
      windowId = win.id;
      void follow();
    });
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onAttached.removeListener(onMoved);
      chrome.tabs.onDetached.removeListener(onMoved);
    };
  }, []);

  return tab;
}
