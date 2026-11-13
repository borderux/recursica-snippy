import { generateGuid } from "./ids";
import { sanitizeAnnotations } from "./annotations";
import { sanitizeContext, sanitizeEnvironment } from "./environment";
import { sanitizeDetection } from "./recursica";
import type {
  CapturedElement,
  ReviewComment,
  ReviewPage,
  Session,
} from "./types";

export const SESSION_STORAGE_KEY = "snippySession";
export const USER_STORAGE_KEY = "snippyUser";
export const EMAIL_STORAGE_KEY = "snippyEmail";
// The annotation pen's last colour: a preference, so it is never cleared
// by Start over.
export const PEN_COLOR_STORAGE_KEY = "snippyPenColor";
// The two view switches above the comment list: preferences too, each
// under its own key, never cleared by Start over. Both default to on.
export const PAGE_ONLY_STORAGE_KEY = "snippyPageOnly";
export const SHOW_IMAGES_STORAGE_KEY = "snippyShowImages";
// Keys no current version reads, deleted on load: the New comment field's
// draft, from before the panel had a single Add menu, and the panel width
// (under each generation's name), from before Chrome's side panel owned
// the width.
const OBSOLETE_KEYS = [
  "snippyDraft",
  "taggerDraft",
  "snippyPanelWidth",
  "taggerPanelWidth",
  "alanReviewToolPanelWidth",
];

// The same values under the names of earlier generations of the product,
// newest first: Tagger (a working name, only ever on the development
// branch), then the original Alan Review Tool. Real users' storage still
// holds data under the old keys (see migrateStorageKeys).
const LEGACY_KEYS: Record<string, string[]> = {
  [SESSION_STORAGE_KEY]: ["taggerSession", "alanReviewToolSession"],
  [USER_STORAGE_KEY]: ["taggerUser", "alanReviewToolUser"],
  [EMAIL_STORAGE_KEY]: ["taggerEmail", "alanReviewToolEmail"],
  [PEN_COLOR_STORAGE_KEY]: ["taggerPenColor"],
};

import { PEN_COLORS, type PenColor } from "./pen";
export { PEN_COLORS, type PenColor };
export const DEFAULT_PEN_COLOR: PenColor = "red";

export interface StoredState {
  session: Session | null;
  userName: string;
  userEmail: string;
  penColor: PenColor;
  pageOnly: boolean;
  showImages: boolean;
  // True when storage could not be read at all. The panel still opens,
  // with nothing loaded, Add disabled and a message saying so. With Add
  // disabled no session can start, so the session that could not be read
  // is never written over.
  loadFailed?: boolean;
}

// What the panel opens with when storage can't be read.
export const FAILED_LOAD_STATE: StoredState = {
  session: null,
  userName: "",
  userEmail: "",
  penColor: DEFAULT_PEN_COLOR,
  pageOnly: true,
  showImages: true,
  loadFailed: true,
};

// The storage keys were renamed with the product, twice: alanReviewTool*
// to tagger* to snippy*. For each current key that is missing, the value is
// taken from the newest older generation that has it - the Tagger key, else
// the Alan key. Then every older key is deleted. A current key that already
// exists always wins, so running this twice, or after the user has already
// used this version, never overwrites newer data. Runs before anything
// reads storage; a copied session still goes through migrateSession, so an
// old array-shaped session is normalized as well.
export async function migrateStorageKeys(): Promise<void> {
  const olderKeys = [...Object.values(LEGACY_KEYS).flat(), ...OBSOLETE_KEYS];
  const stored = await chrome.storage.local.get([
    ...Object.keys(LEGACY_KEYS),
    ...olderKeys,
  ]);
  const copies: Record<string, unknown> = {};
  for (const [key, older] of Object.entries(LEGACY_KEYS)) {
    if (key in stored) continue;
    const source = older.find((oldKey) => oldKey in stored);
    if (source) copies[key] = stored[source];
  }
  const toRemove = olderKeys.filter((oldKey) => oldKey in stored);
  if (Object.keys(copies).length > 0) await chrome.storage.local.set(copies);
  if (toRemove.length > 0) await chrome.storage.local.remove(toRemove);
}

// Normalizes a session read from storage, in place, before anything else
// touches it. Real users' storage holds sessions from every version of
// this extension they have had installed, and old-shape data reaching new
// code has already crashed the panel on load once. The stored shape itself
// has not changed since the pre-React panel; only optional fields were
// added, and comment numbers are now kept gapless (see renumberComments).
export function migrateSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Session;
  // A session with no usable pages object can't be read at all; start its
  // pages over rather than crash the panel on load.
  if (!session.pages || typeof session.pages !== "object") session.pages = {};
  // Sessions saved before pages gained a `title` (back when
  // session.pages[key] was just a comments array) - normalize them to the
  // { title, comments } shape.
  for (const key of Object.keys(session.pages)) {
    const page = session.pages[key] as ReviewPage | ReviewComment[];
    if (Array.isArray(page)) {
      session.pages[key] = { title: key, comments: page };
    }
  }
  // Sessions saved before the guid and the comment counter existed have
  // neither. Backfill a guid, and number every existing comment oldest
  // first (each page's array is newest-first, from unshift), so numbering
  // approximates real creation order.
  // Pages may carry an optional `recursica` detection (added later): kept
  // only if well-formed, field by field; anything else is dropped.
  for (const page of Object.values(session.pages)) {
    if (!("recursica" in page)) continue;
    const clean = sanitizeDetection(page.recursica);
    if (clean) page.recursica = clean;
    else delete page.recursica;
  }
  // Screenshots may carry the device pixel ratio they were captured at
  // (`screenshotScale`, added later). Kept only if it is a plausible ratio;
  // missing or bad, the panel uses the current ratio instead.
  for (const page of Object.values(session.pages)) {
    for (const comment of page.comments) {
      if (!("screenshotScale" in comment)) continue;
      const scale = comment.screenshotScale;
      if (typeof scale !== "number" || !(scale > 0 && scale <= 8))
        delete comment.screenshotScale;
    }
  }
  // Annotated screenshots (added later) keep the clean image and the
  // annotation objects beside the annotated `screenshot`. Both or neither:
  // a malformed clean image drops both, malformed objects are dropped one
  // by one, and with none left the clean image goes too (the comment keeps
  // its one image).
  for (const page of Object.values(session.pages)) {
    for (const comment of page.comments) {
      if (!("screenshotClean" in comment) && !("annotations" in comment))
        continue;
      const clean = comment.screenshotClean;
      const list = sanitizeAnnotations(comment.annotations);
      if (
        typeof clean !== "string" ||
        !clean.startsWith("data:image/") ||
        list.length === 0 ||
        !comment.screenshot
      ) {
        delete comment.screenshotClean;
        delete comment.annotations;
      } else comment.annotations = list;
    }
  }
  // Element comments (added later) carry an optional `element` field. Old
  // sessions simply don't have it; a malformed one - anything without a
  // selector and HTML - is dropped rather than reaching the UI.
  for (const page of Object.values(session.pages)) {
    for (const comment of page.comments) {
      const el = comment.element as Partial<CapturedElement> | undefined;
      if (el === undefined) continue;
      if (
        !el ||
        typeof el !== "object" ||
        typeof el.selector !== "string" ||
        typeof el.html !== "string"
      ) {
        delete comment.element;
        continue;
      }
      el.htmlTruncated = Boolean(el.htmlTruncated);
      el.stylesTruncated = Boolean(el.stylesTruncated);
      el.screenshotClipped = Boolean(el.screenshotClipped);
      if (!el.styles || typeof el.styles !== "object") el.styles = {};
      // Older element comments carry their viewport; newer ones keep it
      // in the comment's context instead. A malformed one is dropped.
      if (
        "viewport" in el &&
        (!el.viewport ||
          typeof el.viewport !== "object" ||
          typeof el.viewport.width !== "number" ||
          typeof el.viewport.height !== "number")
      )
        delete el.viewport;
    }
  }
  // The reviewer's environment (session) and each comment's context
  // (added later): kept field by field when well-formed, else dropped.
  if ("environment" in session) {
    const env = sanitizeEnvironment(session.environment);
    if (env) session.environment = env;
    else delete session.environment;
  }
  for (const page of Object.values(session.pages)) {
    for (const comment of page.comments) {
      if (!("context" in comment)) continue;
      const ctx = sanitizeContext(comment.context);
      if (ctx) comment.context = ctx;
      else delete comment.context;
    }
  }
  if (!session.guid) session.guid = generateGuid();
  if (typeof session.commentCounter !== "number") session.commentCounter = 0;
  for (const page of Object.values(session.pages)) {
    for (const comment of [...page.comments].reverse()) {
      if (comment.commentNumber == null) {
        session.commentCounter += 1;
        comment.commentNumber = session.commentCounter;
      }
    }
  }
  // Comments are numbered 1 to N with no gaps. Sessions saved before that
  // rule kept a deleted comment's number unused, so they are renumbered
  // here, in the order the old numbers give (which was creation order).
  renumberComments(session);
  return session;
}

// Numbers every comment in the session 1 to N, across all pages, in
// creation order, and sets commentCounter to N. The existing numbers give
// the order (they have always increased with creation); the comment id, a
// creation timestamp, breaks any tie. Changes the session in place; the
// stored shape is unchanged. Run after every delete, and on load.
export function renumberComments(session: Session): Session {
  const all = Object.values(session.pages).flatMap((page) => page.comments);
  all.sort((a, b) => a.commentNumber - b.commentNumber || a.id - b.id);
  all.forEach((comment, i) => (comment.commentNumber = i + 1));
  session.commentCounter = all.length;
  return session;
}

export async function loadStoredState(): Promise<StoredState> {
  await migrateStorageKeys();
  const stored = await chrome.storage.local.get([
    SESSION_STORAGE_KEY,
    USER_STORAGE_KEY,
    EMAIL_STORAGE_KEY,
    PEN_COLOR_STORAGE_KEY,
    PAGE_ONLY_STORAGE_KEY,
    SHOW_IMAGES_STORAGE_KEY,
  ]);
  const storedPen = stored[PEN_COLOR_STORAGE_KEY] as PenColor | undefined;
  return {
    session: migrateSession(stored[SESSION_STORAGE_KEY]),
    // Reviewer identity lives under its own keys and is never cleared by
    // Start over - it is an identity fact, not session data.
    userName: (stored[USER_STORAGE_KEY] as string | undefined) || "",
    userEmail: (stored[EMAIL_STORAGE_KEY] as string | undefined) || "",
    penColor:
      storedPen && PEN_COLORS.includes(storedPen)
        ? storedPen
        : DEFAULT_PEN_COLOR,
    // Anything but an explicit false is the default, on.
    pageOnly: stored[PAGE_ONLY_STORAGE_KEY] !== false,
    showImages: stored[SHOW_IMAGES_STORAGE_KEY] !== false,
  };
}

// One object under one key: chrome.storage.local is shared across every
// origin this extension runs on, which is what makes "any site, one
// session" work at all.
//
// Writes return their promise so a failure can be reported. The
// unlimitedStorage permission lifts the quota that screenshots would
// otherwise fill, but a write can still fail.
export function saveSession(session: Session | null): Promise<void> {
  if (session)
    return chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
  return chrome.storage.local.remove(SESSION_STORAGE_KEY);
}

export function saveReviewer(
  userName: string,
  userEmail: string,
): Promise<void> {
  return chrome.storage.local.set({
    [USER_STORAGE_KEY]: userName,
    [EMAIL_STORAGE_KEY]: userEmail,
  });
}

export function savePenColor(color: PenColor): Promise<void> {
  return chrome.storage.local.set({ [PEN_COLOR_STORAGE_KEY]: color });
}

export function savePageOnly(pageOnly: boolean): Promise<void> {
  return chrome.storage.local.set({ [PAGE_ONLY_STORAGE_KEY]: pageOnly });
}

export function saveShowImages(showImages: boolean): Promise<void> {
  return chrome.storage.local.set({ [SHOW_IMAGES_STORAGE_KEY]: showImages });
}
