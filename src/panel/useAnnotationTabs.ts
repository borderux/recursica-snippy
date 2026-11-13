import { useCallback, useEffect, useRef, useState } from "react";
import {
  annotateUrl,
  fromWire,
  isAnnotateUrl,
  type AnnotateDone,
  type AnnotateReply,
} from "./annotateApi";
import type { CommentFields } from "./useReviewSession";
import type { ReviewComment, Session } from "../lib/types";

// The annotation editor tabs this panel opened, and the panel's half of
// their conversation (see annotateApi.ts). One tab per comment: asking to
// annotate a comment whose editor is already open switches to that tab.

interface OpenEditor {
  tabId: number;
  pageKey: string;
  // The screenshot the editor is drawing on.
  base: string;
  // The tab to go back to when the editor closes: the page under review.
  returnTabId: number | null;
}

interface Options {
  windowId: number | undefined;
  session: Session | null;
  // Stores what the editor sent on the comment.
  apply: (pageKey: string, id: number, fields: CommentFields) => void;
  // Called once an editor has closed, saved or not, for focus to go back
  // to the comment in the panel.
  onClosed: (id: number, fields: CommentFields | null) => void;
  // Called before an editor opens, so it reads everything typed so far.
  flush: () => void;
}

const baseOf = (comment: ReviewComment | undefined) =>
  comment ? (comment.screenshotClean ?? comment.screenshot) : null;

export function useAnnotationTabs(options: Options) {
  // Keyed by comment id.
  const open = useRef(new Map<number, OpenEditor>());
  const opening = useRef(new Set<number>());
  // The open editor tabs and their pages, for the panel to recognise one
  // as the active tab. (Without the tabs permission Chrome doesn't tell
  // the panel an extension page's address, so the address can't be used.)
  const [editorTabs, setEditorTabs] = useState<
    { tabId: number; pageKey: string }[]
  >([]);
  const sync = useCallback(
    () =>
      setEditorTabs(
        [...open.current.values()].map(({ tabId, pageKey }) => ({
          tabId,
          pageKey,
        })),
      ),
    [],
  );
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const findComment = (pageKey: string, id: number) =>
    latest.current.session?.pages[pageKey]?.comments.find((c) => c.id === id);

  // The editor's answer, as it closes.
  useEffect(() => {
    const onMessage = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (reply: AnnotateReply) => void,
    ) => {
      const done = message as AnnotateDone | undefined;
      if (done?.type !== "snippy-annotate-done" || !isAnnotateUrl(sender.url))
        return;
      const entry = open.current.get(done.id);
      const ours = entry != null && entry.tabId === sender.tab?.id;
      // An editor this panel didn't open (the panel was reopened since) is
      // taken only by the panel of the window it is in.
      if (!ours && sender.tab?.windowId !== latest.current.windowId) return;
      if (ours) {
        open.current.delete(done.id);
        sync();
      }
      // Stored only while the comment still has the screenshot the editor
      // drew on.
      const fields = done.change && fromWire(done.change);
      if (fields && baseOf(findComment(done.pageKey, done.id)) === done.base)
        latest.current.apply(done.pageKey, done.id, fields);
      if (entry?.returnTabId != null)
        void chrome.tabs
          .update(entry.returnTabId, { active: true })
          .catch(() => {});
      latest.current.onClosed(done.id, fields);
      sendResponse({ ok: true });
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [sync]);

  // An editor tab closed or sent elsewhere by the reviewer is forgotten.
  useEffect(() => {
    const forget = (tabId: number) => {
      for (const [id, entry] of open.current)
        if (entry.tabId === tabId) open.current.delete(id);
      sync();
    };
    const onUpdated = (tabId: number, change: { url?: string }) => {
      if (change.url && !isAnnotateUrl(change.url)) forget(tabId);
    };
    chrome.tabs.onRemoved.addListener(forget);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onRemoved.removeListener(forget);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [sync]);

  // An editor whose screenshot has gone from the panel - the comment
  // deleted, the screenshot deleted or replaced, Start over - is closed:
  // what it was drawing on no longer exists.
  const { session } = options;
  useEffect(() => {
    for (const [id, entry] of open.current) {
      const pageComment = session?.pages[entry.pageKey]?.comments.find(
        (c) => c.id === id,
      );
      if (baseOf(pageComment) === entry.base) continue;
      open.current.delete(id);
      void chrome.tabs.remove(entry.tabId).catch(() => {});
      sync();
    }
  }, [session, sync]);

  // Opens the comment's screenshot in an editor tab beside `from` (the
  // page being reviewed), or switches to its editor if one is open.
  const openEditor = async (
    pageKey: string,
    comment: ReviewComment,
    from: number | null,
  ) => {
    const base = baseOf(comment);
    if (!base || opening.current.has(comment.id)) return;
    const existing = open.current.get(comment.id);
    if (existing) {
      try {
        const tab = await chrome.tabs.update(existing.tabId, { active: true });
        if (tab?.windowId != null)
          await chrome.windows.update(tab.windowId, { focused: true });
        return;
      } catch {
        open.current.delete(comment.id);
        sync();
      }
    }
    opening.current.add(comment.id);
    try {
      latest.current.flush();
      const fromTab =
        from == null ? null : await chrome.tabs.get(from).catch(() => null);
      const created = await chrome.tabs.create({
        url: annotateUrl(pageKey, comment.id),
        windowId: fromTab?.windowId ?? latest.current.windowId,
        ...(fromTab
          ? { index: fromTab.index + 1, openerTabId: fromTab.id }
          : {}),
        active: true,
      });
      if (created.id != null)
        open.current.set(comment.id, {
          tabId: created.id,
          pageKey,
          base,
          returnTabId: fromTab?.id ?? null,
        });
      sync();
    } finally {
      opening.current.delete(comment.id);
    }
  };

  return { openEditor, editorTabs };
}
