// The page helper: the part of Snippy that runs inside the reviewed page.
// The panel itself is Chrome's side panel (src/panel), which can't touch
// the page, so it injects this script into the active tab and calls the
// API below through chrome.scripting.executeScript (see
// src/panel/pageBridge.ts). It draws nothing but the capture overlays -
// except in a downloaded Snippy report, Snippy's own file, where it adds
// the response controls (see responses.ts).
//
// It also forwards Snippy's keyboard shortcuts pressed while focus is on
// the page, over a port to the panel. When every panel that could hear it
// has closed, the port disconnects and the helper removes itself: any
// overlay is cancelled, any response controls are removed, and the page
// gets its keys back.
import { selectRegion } from "../lib/capture";
import { pickElement, serializeElement, visibleRect } from "../lib/element";
import { commentContextNow } from "../lib/environment";
import { cancelOverlay, forwardOverlayKey } from "../lib/overlay";
import {
  PORT_NAME,
  type HelperMessage,
  type PanelMessage,
} from "../lib/pageApi";
import { detectRecursica } from "../lib/recursica";
import { matchShortcut } from "../lib/shortcuts";
import { findReport, mountResponses } from "./responses";

// Two frames, so the page has painted with the overlay gone before the
// panel captures the visible tab.
const twoFrames = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

const pageDpr = () => window.devicePixelRatio || 1;

// A panel left open by an earlier version of Snippy - which drew it into
// the page itself - stays behind, dead, when the extension updates. Take
// it away, with the page push it applied. Each generation used its own
// host id and dataset prefix.
function removeOldPanels(): void {
  const html = document.documentElement;
  for (const [id, prefix] of [
    ["snippy-host", "snippy"],
    ["alan-review-tool-host", "alanReviewTool"],
    ["tagger-host", "tagger"],
  ]) {
    const host = document.getElementById(id);
    if (!host) continue;
    host.remove();
    html.style.width = html.dataset[`${prefix}PrevWidth`] || "";
    html.style.transition = html.dataset[`${prefix}PrevTransition`] || "";
    delete html.dataset[`${prefix}PrevWidth`];
    delete html.dataset[`${prefix}PrevTransition`];
  }
}

function install(): void {
  removeOldPanels();

  // Shortcuts are only consumed while the panel says they may run (no
  // modal open, no capture under way); otherwise the page keeps the key.
  let shortcutsLive = false;
  const port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((message: PanelMessage) => {
    if (message?.type === "live") shortcutsLive = message.live;
  });

  const onKey = (event: KeyboardEvent) => {
    if (!shortcutsLive) return;
    const id = matchShortcut(event);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    port.postMessage({ type: "shortcut", id } satisfies HelperMessage);
  };
  window.addEventListener("keydown", onKey, true);

  // A Snippy report gets its response controls for as long as the helper
  // is here.
  const report = findReport();
  const unmountResponses = report ? mountResponses(report) : null;

  port.onDisconnect.addListener(() => {
    cancelOverlay();
    unmountResponses?.();
    window.removeEventListener("keydown", onKey, true);
    delete globalThis.snippyPage;
  });

  globalThis.snippyPage = {
    async selectRegion() {
      const rect = await selectRegion();
      if (!rect) return null;
      await twoFrames();
      return { rect, dpr: pageDpr(), context: commentContextNow() };
    },
    async pickElement() {
      const picked = await pickElement();
      if (!picked) return null;
      if ("frame" in picked)
        // Never reach into a frame: a cross-origin frame's content isn't
        // readable, and same-origin frames are left out for consistency.
        return {
          error:
            "content inside a frame can't be captured. Open the framed page on its own to capture it.",
        };
      const visible = visibleRect(picked.element);
      const element = serializeElement(
        picked.element,
        visible?.clipped ?? false,
      );
      await twoFrames();
      return {
        element,
        rect: visible?.rect ?? null,
        dpr: pageDpr(),
        context: commentContextNow(),
      };
    },
    context: commentContextNow,
    detectRecursica,
    key: forwardOverlayKey,
    cancel: cancelOverlay,
    report: () => report?.summary ?? null,
    scrollToComment: (index) => {
      const el = report?.els[Number(index)];
      if (!el) return;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    },
  };
}

if (!globalThis.snippyPage) install();
