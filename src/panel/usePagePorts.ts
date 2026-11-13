import { useEffect, useRef } from "react";
import {
  PORT_NAME,
  type HelperMessage,
  type PanelMessage,
} from "../lib/pageApi";
import type { ShortcutId } from "../lib/shortcuts";

// The ports page helpers open to the panel (see src/page/main.ts). Through
// them, shortcuts pressed with focus on the page reach the panel, and the
// panel tells each helper whether shortcuts may run right now. Only the
// panel's own active tab is listened to: every open side panel, in every
// window, hears every helper.
export function usePagePorts(
  activeTabId: number | undefined,
  live: boolean,
  onShortcut: (id: ShortcutId) => void,
): void {
  const ports = useRef(new Set<chrome.runtime.Port>());
  const state = useRef({ activeTabId, live, onShortcut });
  useEffect(() => {
    state.current = { activeTabId, live, onShortcut };
  });

  useEffect(() => {
    const onConnect = (port: chrome.runtime.Port) => {
      if (port.name !== PORT_NAME) return;
      ports.current.add(port);
      port.onDisconnect.addListener(() => ports.current.delete(port));
      port.onMessage.addListener((message: HelperMessage) => {
        const { activeTabId: active, live: now } = state.current;
        if (message?.type !== "shortcut" || !now) return;
        if (port.sender?.tab?.id !== active) return;
        state.current.onShortcut(message.id);
      });
      const tabId = port.sender?.tab?.id;
      port.postMessage({
        type: "live",
        live: state.current.live && tabId === state.current.activeTabId,
      } satisfies PanelMessage);
    };
    chrome.runtime.onConnect.addListener(onConnect);
    return () => chrome.runtime.onConnect.removeListener(onConnect);
  }, []);

  // Each helper consumes shortcut keys only while this says so - and only
  // the helper in the tab the panel is showing.
  useEffect(() => {
    for (const port of ports.current) {
      try {
        port.postMessage({
          type: "live",
          live: live && port.sender?.tab?.id === activeTabId,
        } satisfies PanelMessage);
      } catch {
        ports.current.delete(port);
      }
    }
  }, [live, activeTabId]);
}
