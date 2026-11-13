// The panel's side of the page helper (src/page/main.ts). The panel is
// Chrome's side panel, not part of the page, so everything that has to
// touch the page - the capture overlays, element picking, the page's own
// context, Recursica detection - runs there, called through
// chrome.scripting.executeScript. That reaches any web page because of the
// extension's host permission (<all_urls>); pages no extension may script
// (chrome://, the Web Store, the PDF viewer) refuse it.
//
// Pixels are captured here, with chrome.tabs.captureVisibleTab: it takes
// the tab's own viewport, so the side panel is never in the picture.
import type { ElementResult, PageHelper, RegionResult } from "../lib/pageApi";
import { sanitizeContext, type CommentContext } from "../lib/environment";
import { sanitizeDetection, type RecursicaDetection } from "../lib/recursica";
import type { CapturedElement } from "../lib/types";

// Installs the helper in the tab's page unless it is already there.
// Resolves false when the page can't be scripted.
export async function ensureHelper(tabId: number): Promise<boolean> {
  try {
    const [first] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(globalThis.snippyPage),
    });
    if (first?.result) return true;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["page.js"],
    });
    return true;
  } catch {
    return false;
  }
}

// Calls one of the helper's methods in the tab's page and resolves with
// what it returns (which must be plain, serialisable data).
async function call<K extends keyof PageHelper>(
  tabId: number,
  method: K,
): Promise<Awaited<ReturnType<PageHelper[K]>>>;
async function call(
  tabId: number,
  method: keyof PageHelper,
  arg: string,
): Promise<unknown>;
async function call(
  tabId: number,
  method: keyof PageHelper,
  arg?: string,
): Promise<unknown> {
  if (!(await ensureHelper(tabId)))
    throw new Error("Snippy can't reach this page");
  const [first] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name: string, value: string | null) => {
      const helper = globalThis.snippyPage;
      if (!helper) throw new Error("the page helper is not installed");
      const fn = helper[name as keyof PageHelper] as (v?: string) => unknown;
      return value == null ? fn() : fn(value);
    },
    args: [method, arg ?? null],
  });
  return first?.result;
}

export async function pageContext(
  tabId: number,
): Promise<CommentContext | undefined> {
  try {
    return sanitizeContext(await call(tabId, "context"));
  } catch {
    return undefined;
  }
}

export async function pageRecursica(
  tabId: number,
): Promise<RecursicaDetection | null> {
  try {
    return sanitizeDetection(await call(tabId, "detectRecursica")) ?? null;
  } catch {
    return null;
  }
}

// Forwards a key pressed in the panel to the overlay on the page.
export function forwardKey(tabId: number, key: string): void {
  void call(tabId, "key", key).catch(() => {});
}

// Ends any overlay on the tab's page, as Escape would.
export function cancelCapture(tabId: number): void {
  void chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => globalThis.snippyPage?.cancel(),
    })
    .catch(() => {});
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// `scale` is the device pixel ratio the image was captured at: its pixels
// divided by the scale give its natural size in CSS px.
export type CaptureResult =
  | { dataUrl: string; scale: number; context: CommentContext }
  | { error: string };

async function captureAndCrop(
  windowId: number,
  rect: RegionResult["rect"],
  dpr: number,
): Promise<{ dataUrl: string; scale: number } | { error: string }> {
  let full: string;
  try {
    full = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  } catch (err) {
    console.error("Snippy: captureVisibleTab failed.", err);
    return { error: String(err) };
  }
  const img = await loadImage(full);
  const canvas = document.createElement("canvas");
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "the browser could not create a canvas" };
  ctx.drawImage(
    img,
    rect.x * dpr,
    rect.y * dpr,
    rect.width * dpr,
    rect.height * dpr,
    0,
    0,
    rect.width * dpr,
    rect.height * dpr,
  );
  // JPEG rather than PNG - a UI screenshot has enough gradients (shadows,
  // anti-aliased text) that lossy compression saves real space.
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), scale: dpr };
}

export interface TabTarget {
  tabId: number;
  windowId: number;
}

// Selects a region on the page and captures it. Resolves null when the
// reviewer cancels; never throws - a failure comes back as { error }.
export async function captureRegion(
  tab: TabTarget,
): Promise<CaptureResult | null> {
  try {
    const selected = await call(tab.tabId, "selectRegion");
    if (!selected) return null;
    const shot = await captureAndCrop(
      tab.windowId,
      selected.rect,
      selected.dpr,
    );
    if ("error" in shot) return shot;
    return { ...shot, context: selected.context };
  } catch (err) {
    console.error("Snippy: screenshot capture failed.", err);
    return { error: String(err) };
  }
}

export type ElementCaptureResult =
  | {
      element: CapturedElement;
      dataUrl: string | null;
      scale: number;
      context: CommentContext;
    }
  | { error: string };

// Picks an element and captures it: its selector, HTML, styles and
// viewport, and a screenshot cropped to the part of it that is on screen.
// Resolves null when the reviewer cancels.
export async function captureElement(
  tab: TabTarget,
): Promise<ElementCaptureResult | null> {
  try {
    const picked: ElementResult | null = await call(tab.tabId, "pickElement");
    if (!picked) return null;
    if ("error" in picked) return picked;
    const { element, rect, dpr, context } = picked;
    if (!rect) return { element, dataUrl: null, scale: dpr, context };
    const shot = await captureAndCrop(tab.windowId, rect, dpr);
    if ("error" in shot) return shot;
    return { element, ...shot, context };
  } catch (err) {
    console.error("Snippy: element capture failed.", err);
    return { error: String(err) };
  }
}
