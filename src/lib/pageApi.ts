// What the page helper (src/page/main.ts) and the side panel
// (src/panel/pageBridge.ts) share: the helper's API and the messages on
// the port between them. Types and one constant only, so importing it
// never pulls the helper's code into the panel.
import type { Rect } from "./capture";
import type { CommentContext } from "./environment";
import type { RecursicaDetection } from "./recursica";
import type { ShortcutId } from "./shortcuts";
import type { CapturedElement } from "./types";

export interface RegionResult {
  rect: Rect;
  // The page's device pixel ratio, which includes its zoom: the factor
  // between the CSS px of `rect` and the pixels of a tab capture.
  dpr: number;
  context: CommentContext;
}

export type ElementResult =
  | {
      element: CapturedElement;
      // The part of the element on screen, or null if none of it is.
      rect: Rect | null;
      dpr: number;
      context: CommentContext;
    }
  | { error: string };

export interface PageHelper {
  selectRegion(): Promise<RegionResult | null>;
  pickElement(): Promise<ElementResult | null>;
  context(): CommentContext;
  detectRecursica(): Promise<RecursicaDetection>;
  key(key: string): boolean;
  cancel(): void;
}

// Messages from the helper to the panel, and from the panel to the helper.
export type HelperMessage = { type: "shortcut"; id: ShortcutId };
export type PanelMessage = { type: "live"; live: boolean };

export const PORT_NAME = "snippy-page";

declare global {
  // Set while the helper is installed in this page (in the extension's
  // isolated world, which the panel's executeScript calls share).
  var snippyPage: PageHelper | undefined;
}
