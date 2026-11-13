// The annotation editor opens in its own tab (annotate.html, from
// annotate.tsx), beside the page being reviewed, so the screenshot gets
// the main window's room instead of the side panel's. The side panel
// stays the one place the session is changed: when the editor closes, it
// sends the panel what to store, and the panel applies it (see
// useAnnotationTabs.ts). Only if no panel answers - it was closed - does
// the editor write the change to storage itself.
import type { CommentFields } from "./useReviewSession";

export const ANNOTATE_PAGE = "annotate.html";

// The editor's address for one comment's screenshot.
export function annotateUrl(pageKey: string, id: number): string {
  const params = new URLSearchParams({ page: pageKey, id: String(id) });
  return `${chrome.runtime.getURL(ANNOTATE_PAGE)}?${params}`;
}

// For the editor's own messages (a sender's address is always known).
export function isAnnotateUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(chrome.runtime.getURL(ANNOTATE_PAGE)));
}

// Sent by the editor tab as it closes. `change` is what to store on the
// comment (see toWire), or null when the reviewer left without saving.
// `base` is the screenshot the editor drew on: a change is applied only
// while the comment still has that screenshot.
export interface AnnotateDone {
  type: "snippy-annotate-done";
  pageKey: string;
  id: number;
  base: string;
  change: WireChange | null;
}

// A patch as it crosses between pages. A field set to undefined means
// "remove it", but messages are JSON, which drops undefined values - so
// the fields to remove travel as a list of names.
export interface WireChange {
  set: CommentFields;
  remove: (keyof CommentFields)[];
}

export function toWire(fields: CommentFields): WireChange {
  const set: Record<string, unknown> = {};
  const remove: (keyof CommentFields)[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) remove.push(key as keyof CommentFields);
    else set[key] = value;
  }
  return { set: set as CommentFields, remove };
}

export function fromWire({ set, remove }: WireChange): CommentFields {
  const fields: CommentFields = { ...set };
  for (const key of remove) fields[key] = undefined;
  return fields;
}

// The panel's answer: it has applied the change (or there was none).
export interface AnnotateReply {
  ok: true;
}

// What Delete screenshot stores. On an element comment the screenshot is
// the element's, so the captured element (selector, HTML, styles) goes
// with it: what is left is a plain comment, not an element summary with
// no picture.
export const DELETE_SCREENSHOT_FIELDS: CommentFields = {
  screenshot: null,
  screenshotScale: undefined,
  screenshotClean: undefined,
  annotations: undefined,
  element: undefined,
};
