import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Group,
  Panel,
  Stack,
  Text,
  Toast,
  Tooltip,
} from "@recursica/adapter-mantine-v8";
import { AddMenu } from "./components/AddMenu";
import {
  CommentList,
  type CaptureTarget,
  type PageGroup,
} from "./components/CommentList";
import { ConfirmModal } from "./components/ConfirmModal";
import { DownloadModal, type ReportDetails } from "./components/DownloadModal";
import { ViewOptions } from "./components/ViewOptions";
import { plural } from "../lib/format";
import { commentName } from "../lib/ids";
import { sessionEnvironment, sessionEnvironmentNow } from "../lib/environment";
import { matchShortcut, type ShortcutId } from "../lib/shortcuts";
import { findInPanel, makeBehindModalInert, markPanelNonModal } from "./dom";
import {
  cancelCapture,
  captureElement,
  captureRegion,
  forwardKey,
  pageContext,
  pageRecursica,
} from "./pageBridge";
import { downloadReport, totalCommentCount } from "../lib/report";
import { savePageOnly, saveShowImages, type StoredState } from "../lib/storage";
import type { ReviewComment } from "../lib/types";
import { useActiveTab } from "./useActiveTab";
import { useAnnotationTabs } from "./useAnnotationTabs";
import { usePagePorts } from "./usePagePorts";
import { useReviewSession } from "./useReviewSession";

// Keys that drive a capture overlay on the page. While one is up, these
// pressed with focus in the panel go to the page (see pageBridge.ts).
const OVERLAY_KEYS = new Set(["Escape", "Enter", "ArrowUp", "ArrowDown"]);

// Every form in a panel stacks its labels above its fields, at every
// panel width: the panels rule names this surface, so it outranks the
// general container-width test in the forms rule. One placement for every
// field in the panel.
export type FormLayout = "stacked";

export function fieldLayout(formLayout: FormLayout) {
  return { formLayout, labelAlignment: "left" } as const;
}

// The one panel confirmation that can be open, if any. (The annotation
// editor, in its own tab, asks its own questions.)
type Confirmation =
  | { kind: "delete-comment"; pageKey: string; comment: ReviewComment }
  | { kind: "start-over" };

// The id of the element holding the failed-load message, which is also
// the disabled Add button's description.
const LOAD_ERROR_ID = "art-load-error";
// The id of the message saying this page can't be commented on, which is
// then the disabled Add button's description.
const NO_ACCESS_ID = "art-no-access";
// The id of the text that describes the Download report button.
const SUMMARY_ID = "art-report-summary";

interface ReviewPanelProps {
  portalEl: HTMLElement;
  stored: StoredState;
}

export function ReviewPanel({ portalEl, stored }: ReviewPanelProps) {
  const [toast, setToast] = useState<string | null>(null);
  const review = useReviewSession({
    initialSession: stored.session,
    initialUserName: stored.userName,
    initialUserEmail: stored.userEmail,
    // One message at a time: a repeat replaces the one already showing.
    onSaveError: (reason) => setToast(`Changes not saved: ${reason}`),
  });
  const { session } = review;

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  // Where the Add menu renders: a slot at the start of the panel header,
  // before the title (see below).
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [pageOnly, setPageOnly] = useState(stored.pageOnly);
  const [showImages, setShowImages] = useState(stored.showImages);
  const loadFailed = Boolean(stored.loadFailed);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>(null);

  // The page the panel is showing: the active tab of its window. Comments
  // can be added only where the page helper could be installed.
  const tab = useActiveTab();
  const pageKey = tab?.pageKey ?? null;

  // Focus goes back to whatever opened a modal once it closes - or, when
  // that control is gone or disabled, to the control that replaced it
  // (the first selector that matches). Mantine's own focus return can
  // only go back to the element that had focus, which may no longer exist.
  const returnFocus = (...selectors: string[]) => {
    requestAnimationFrame(() => {
      for (const selector of selectors) {
        const el = findInPanel(selector);
        if (el && !el.hasAttribute("disabled")) {
          el.focus();
          return;
        }
      }
    });
  };
  // Where focus goes when the control that had it is gone: the Add menu,
  // the one control that is always there.
  const ADD_MENU = "[data-add-menu]";

  // The annotation editor opens in a tab of its own, beside the page, with
  // the main window's room (see annotateApi.ts). When it closes, focus in
  // the panel goes back to the comment's screenshot - or, with the
  // screenshot deleted, to its Add screenshot button.
  const { openEditor, editorTabs } = useAnnotationTabs({
    windowId: tab?.windowId,
    session,
    apply: (key, id, fields) => review.updateComment(key, id, fields, "now"),
    onClosed: (id, fields) =>
      returnFocus(
        fields && "screenshot" in fields && fields.screenshot === null
          ? `[data-shot-add="${id}"]`
          : `[data-shot-edit="${id}"]`,
        ADD_MENU,
      ),
    flush: review.flush,
  });
  const annotate = (key: string, comment: ReviewComment) =>
    void openEditor(key, comment, tab?.tabId ?? null);
  // With an editor tab active, the panel keeps showing its page's
  // comments; nothing can be added there.
  const editorPage =
    editorTabs.find((editor) => editor.tabId === tab?.tabId)?.pageKey ?? null;

  const canComment = !loadFailed && tab?.access === "ok" && pageKey != null;
  const pageKeyRef = useRef(pageKey);
  useEffect(() => {
    pageKeyRef.current = pageKey;
  });
  const total = totalCommentCount(session);
  const pagesWithComments = Object.values(session?.pages ?? {}).filter(
    (page) => page.comments.length > 0,
  ).length;
  // "12 comments across 3 pages", for the whole session.
  const reportSummary = `${plural(total, "comment", "comments")} across ${plural(pagesWithComments, "page", "pages")}`;

  // What the list shows. This page only: the current page's comments.
  // Otherwise every page's, grouped by page: the current page first, then
  // the others, most recently commented first (a comment's id is its
  // creation time).
  // The current page is the active tab's - or, with an annotation editor
  // tab active, the page that editor belongs to. On a page with no key (a
  // browser page) there is no current group.
  const shownKey = pageKey ?? editorPage;
  const currentGroups: PageGroup[] =
    shownKey == null
      ? []
      : [
          {
            pageKey: shownKey,
            title:
              session?.pages[shownKey]?.title ??
              (shownKey === pageKey ? tab?.title : undefined) ??
              "",
            comments: session?.pages[shownKey]?.comments ?? [],
            current: true,
          },
        ];
  const groups: PageGroup[] = pageOnly
    ? currentGroups
    : [
        ...currentGroups,
        ...Object.entries(session?.pages ?? {})
          .filter(([key, page]) => key !== shownKey && page.comments.length > 0)
          .map(([key, page]) => ({
            pageKey: key,
            title: page.title,
            comments: page.comments,
            current: false,
          }))
          .sort(
            (a, b) =>
              Math.max(...b.comments.map((c) => c.id)) -
              Math.max(...a.comments.map((c) => c.id)),
          ),
      ];
  const formLayout: FormLayout = "stacked";

  useEffect(() => {
    markPanelNonModal();
  }, []);

  // Workaround (adapter gap): the kit's panel header has a title and a
  // close button and no slot for actions, and its compound parts
  // (Panel.Header, Panel.Title) carry none of the panel's styling, so a
  // custom header can't be composed either. Putting the button inside the
  // title would make the panel's accessible name "Add Snippy". So a slot
  // element is placed first in the header and the Add menu is rendered
  // into it. Header order: Add, title, Close.
  useEffect(() => {
    const header = findInPanel(".mantine-Drawer-header");
    if (!header) return;
    const slot = document.createElement("div");
    slot.className = "art-header-slot";
    header.prepend(slot);
    const frame = requestAnimationFrame(() => setHeaderSlot(slot));
    return () => {
      cancelAnimationFrame(frame);
      slot.remove();
    };
  }, []);

  // While a modal is open, everything behind it in the panel is inert, so
  // a screen reader's reading cursor can't wander out of the modal either.
  // The prior setting is put back after.
  const modalOpen = confirmation != null || downloadOpen;
  useEffect(() => {
    if (!modalOpen) return;
    return makeBehindModalInert();
  }, [modalOpen]);

  // While a capture overlay is up on the page, the keys that drive it
  // work with focus in the panel too: they are forwarded to the page.
  const capturing = captureTarget != null;
  const tabId = tab?.tabId;
  useEffect(() => {
    if (!capturing || tabId == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (!OVERLAY_KEYS.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      forwardKey(tabId, event.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, tabId]);

  // A capture is for the tab it started on: switching tabs (or closing
  // the panel, which disconnects the helper) ends it, as Escape would.
  const capturingRef = useRef(false);
  useEffect(() => {
    capturingRef.current = capturing;
  });
  useEffect(() => {
    if (tabId == null) return;
    return () => {
      if (capturingRef.current) cancelCapture(tabId);
    };
  }, [tabId]);

  const showCaptureError = (reason: string) =>
    setToast(`Screenshot not captured: ${reason}`);

  // Once a page has a comment, check whether it is built with Recursica
  // (and which versions) for the report - again on later comments while
  // nothing has been found yet. Runs in the background after the comment
  // exists; never blocks or throws (see lib/recursica.ts).
  const detectPage = (key: string, onTab: number) => {
    const known = review.session?.pages[key]?.recursica;
    if (known?.recursica) return;
    void pageRecursica(onTab).then((result) => {
      if (result && pageKeyRef.current === key)
        review.setPageRecursica(key, result);
    });
  };

  // Where the next comment goes: the page showing now, and its tab.
  const target = () =>
    canComment && tab && pageKey
      ? { pageKey, title: tab.title, tabId: tab.tabId, windowId: tab.windowId }
      : null;

  // Each Add menu item creates a new comment at the top with focus in its
  // text box. A comment stays until it is deleted on purpose, even blank
  // (owner decision).
  const handleAddComment = () => {
    const t = target();
    if (!t) return;
    setToast(null);
    // The comment exists, with focus in it, at once, so typing that starts
    // right away is never lost. The page's context (viewport, scroll and
    // so on) arrives from the page a moment later.
    const id = review.addComment(t.pageKey, t.title);
    setFocusId(id);
    void pageContext(t.tabId).then((context) => {
      if (context) review.updateComment(t.pageKey, id, { context }, "now");
    });
    detectPage(t.pageKey, t.tabId);
  };

  const handleAddScreenshot = async () => {
    const t = target();
    if (!t) return;
    setToast(null);
    setCaptureTarget("screenshot");
    const result = await captureRegion(t);
    setCaptureTarget(null);
    // Cancelled or failed: no comment, and focus goes back to Add rather
    // than being left nowhere.
    if (!result || "error" in result) {
      if (result) showCaptureError(result.error);
      returnFocus(ADD_MENU);
      return;
    }
    setFocusId(
      review.addComment(t.pageKey, t.title, {
        screenshot: result.dataUrl,
        screenshotScale: result.scale,
        context: result.context,
      }),
    );
    detectPage(t.pageKey, t.tabId);
  };

  const handleAddElement = async () => {
    const t = target();
    if (!t) return;
    setToast(null);
    setCaptureTarget("element");
    const result = await captureElement(t);
    setCaptureTarget(null);
    if (!result || "error" in result) {
      if (result) setToast(`Element not captured: ${result.error}`);
      returnFocus(ADD_MENU);
      return;
    }
    setFocusId(
      review.addComment(t.pageKey, t.title, {
        screenshot: result.dataUrl,
        screenshotScale: result.scale,
        element: result.element,
        context: result.context,
      }),
    );
    detectPage(t.pageKey, t.tabId);
  };

  const handleAddScreenshotTo = async (
    commentPage: string,
    comment: ReviewComment,
  ) => {
    const t = target();
    if (!t) return;
    setToast(null);
    setCaptureTarget(comment.id);
    const result = await captureRegion(t);
    setCaptureTarget(null);
    // Cancelled or failed: focus goes back to this row's Add screenshot
    // button, which is still there.
    if (!result || "error" in result) {
      if (result) showCaptureError(result.error);
      returnFocus(`[data-shot-add="${comment.id}"]`, ADD_MENU);
      return;
    }
    review.updateComment(
      commentPage,
      comment.id,
      {
        screenshot: result.dataUrl,
        screenshotScale: result.scale,
        screenshotClean: undefined,
        annotations: undefined,
        context: result.context,
      },
      "now",
    );
    setFocusId(comment.id);
  };

  // From the row menu: focus goes back to the menu's trigger, not into
  // the new comment (the menu rule).
  // A duplicate belongs to the same page as the comment it copies.
  // The new copy takes focus, scrolled into view, with the caret at the
  // end of its text (owner decision).
  const handleDuplicate = (commentPage: string, comment: ReviewComment) => {
    setToast(null);
    setFocusId(review.duplicateComment(commentPage, comment));
  };

  // The comment whose text box has focus, if any (the shortcuts that act
  // on one comment act on it).
  const focusedComment = (): {
    pageKey: string;
    comment: ReviewComment;
  } | null => {
    const el = document.activeElement;
    if (!(el instanceof HTMLTextAreaElement)) return null;
    const id = Number(
      el.closest("li[data-comment-row]")?.getAttribute("data-comment-row"),
    );
    for (const [key, page] of Object.entries(session?.pages ?? {})) {
      const comment = page.comments.find((c) => c.id === id);
      if (comment) return { pageKey: key, comment };
    }
    return null;
  };

  const runShortcut = (id: ShortcutId) => {
    if (id === "addComment") handleAddComment();
    else if (id === "addScreenshot") void handleAddScreenshot();
    else if (id === "addElement") void handleAddElement();
    else if (id === "pageOnly" && total > 0) {
      setPageOnly(!pageOnly);
      review.track(savePageOnly(!pageOnly));
    } else if (id === "showImages" && total > 0) {
      setShowImages(!showImages);
      review.track(saveShowImages(!showImages));
    } else if (id === "duplicate") {
      const f = focusedComment();
      if (f) handleDuplicate(f.pageKey, f.comment);
    } else if (id === "annotate") {
      const f = focusedComment();
      if (f?.comment.screenshot) annotate(f.pageKey, f.comment);
    }
  };
  const shortcutRef = useRef(runShortcut);
  useEffect(() => {
    shortcutRef.current = runShortcut;
  });
  // Whether a shortcut may run now: never while a modal (a confirmation,
  // the download dialog) is open, while a capture
  // is under way, or when saved data could not be loaded.
  const shortcutsLive = !modalOpen && captureTarget == null && !loadFailed;

  // Shortcuts pressed with focus on the page come from the page helper.
  usePagePorts(tabId, shortcutsLive, (id) => shortcutRef.current(id));

  // With focus in the panel: one listener for the panel's window, in the
  // capture phase. Only a matching combination is consumed.
  useEffect(() => {
    if (!shortcutsLive) return;
    const onKey = (event: KeyboardEvent) => {
      const id = matchShortcut(event);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      shortcutRef.current(id);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shortcutsLive]);

  // The reviewer's environment, with the full browser and OS versions the
  // browser offers (asynchronously), recorded once a session exists.
  const sessionGuid = session?.guid;
  useEffect(() => {
    if (!sessionGuid || loadFailed) return;
    let cancelled = false;
    void sessionEnvironment().then((env) => {
      if (!cancelled) review.setEnvironment(env);
    });
    return () => {
      cancelled = true;
    };
    // Once per session and panel open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionGuid, loadFailed]);

  // Download report: save what the reviewer entered (name and email under
  // their own keys, session details in the session, as before), then build
  // the report from exactly those values.
  const downloadWith = (values: ReportDetails) => {
    review.setUserName(values.userName);
    review.setUserEmail(values.userEmail);
    if (session && values.details !== session.details)
      review.setDetails(values.details);
    downloadReport({
      // Sessions from before the environment existed get it now.
      session: session
        ? {
            ...session,
            details: values.details,
            environment: session.environment ?? sessionEnvironmentNow(),
          }
        : session,
      userName: values.userName,
      userEmail: values.userEmail,
    });
    setDownloadOpen(false);
    returnFocus("[data-download]", ADD_MENU);
  };

  const cancelConfirmation = () => {
    const current = confirmation;
    setConfirmation(null);
    if (current?.kind === "delete-comment")
      returnFocus(`[data-delete="${current.comment.id}"]`, ADD_MENU);
    else returnFocus("[data-start-over]", ADD_MENU);
  };

  const confirm = () => {
    const current = confirmation;
    setConfirmation(null);
    if (!current) return;
    if (current.kind === "delete-comment") {
      review.deleteComment(current.pageKey, current.comment.id);
      // The comment and its menu are gone; the Add menu is the nearest
      // place to continue.
      returnFocus(ADD_MENU);
    } else {
      review.startOver();
      // Start over is disabled now there is no session.
      returnFocus(ADD_MENU);
    }
  };

  const confirmationCopy = (() => {
    if (!confirmation) return null;
    if (confirmation.kind === "start-over")
      return {
        title: "Delete all comments?",
        consequence: `All ${plural(total, "comment", "comments")} and their screenshots, on every page, will be deleted. This can't be undone.`,
        confirmLabel: "Delete all comments",
      };
    const id = commentName(confirmation.comment.commentNumber);
    const Id = commentName(confirmation.comment.commentNumber, true);
    return {
      title: `Delete ${id}?`,
      consequence: confirmation.comment.screenshot
        ? `${Id} and its screenshot will be deleted. This can't be undone.`
        : `${Id} will be deleted. This can't be undone.`,
      confirmLabel: "Delete comment",
    };
  })();

  // The kit's Panel always has a Close button and always closes on Escape
  // (adapter 1.3.3 and 1.4.0). Here the Panel is the whole side panel, so
  // closing it closes Chrome's side panel, which window.close() does from
  // the side panel's own page. Pending typing is written first.
  //
  // Workaround (adapter gap): the Panel hears Escape anywhere in the window,
  // even while a modal or a capture has it - so the Escape that cancels a
  // confirmation, the download dialog or a capture would close Snippy as
  // well. Those Escapes belong to the modal or the capture alone.
  const closeSidePanel = () => {
    if (modalOpen || capturing) return;
    review.flush();
    window.close();
  };

  return (
    <div className="art-panel">
      {/*
        The kit's Panel fills Chrome's side panel, which is the real panel:
        Chrome opens, resizes and closes it. The Panel is always open; its
        width is the kit's max-width token capped at the viewport, so it
        fills the side panel at any width. The kit's Panel always has a
        Close button and always closes on Escape: closing it closes the
        side panel (see closeSidePanel).
      */}
      <Panel
        opened
        onClose={closeSidePanel}
        // Rendered in place, inside the page's layer-0 body, not portaled.
        withinPortal={false}
        // The product name, in sentence case. The version is not shown in
        // the panel (the browser's extension details show it); it is in the
        // report's hidden metadata.
        title="Snippy"
      >
        {/* Storage could not be read: say so where the list would be. The
            one text in the panel body, and the reason Add is disabled. */}
        {loadFailed ? (
          <Text id={LOAD_ERROR_ID} role="alert">
            Your saved comments could not be loaded, so adding comments is
            turned off. Close Snippy and open it again to try again.
          </Text>
        ) : (
          // The view options at the top of the scrolling area, above the
          // comments they filter, then the comment list. The whole
          // block ends with space of its own (a spacing token, as its
          // bottom margin), so at the end of the scroll it clears the
          // pinned footer: the panel body's own bottom padding sits below
          // the footer, not above it.
          <Stack gap="rec-lg" mb="rec-lg">
            {/* The view options first, above everything they affect. */}
            <ViewOptions
              disabled={total === 0}
              pageOnly={pageOnly}
              showImages={showImages}
              onPageOnlyChange={(next) => {
                setPageOnly(next);
                review.track(savePageOnly(next));
              }}
              onShowImagesChange={(next) => {
                setShowImages(next);
                review.track(saveShowImages(next));
              }}
            />
            {/* A page Snippy can't reach (a browser page, the Web Store):
                say so above the list. Other pages' comments still show. */}
            {tab?.access === "blocked" && (
              <Text id={NO_ACCESS_ID}>
                {editorPage != null
                  ? "This tab is Snippy's annotation editor. Switch to a web page to add comments there."
                  : "Snippy can't add comments on this page. Browser pages, the Chrome Web Store and some others can't be reviewed."}
              </Text>
            )}
            <CommentList
              onOpenPage={(href) => {
                if (tabId != null)
                  void chrome.tabs.update(tabId, { url: href });
              }}
              review={review}
              grouped={!pageOnly}
              groups={groups}
              showImages={showImages}
              formLayout={formLayout}
              focusId={focusId}
              onFocused={() => setFocusId(null)}
              captureTarget={captureTarget}
              onAddScreenshotTo={handleAddScreenshotTo}
              onDuplicate={handleDuplicate}
              onRequestDelete={(commentPage, comment) =>
                setConfirmation({
                  kind: "delete-comment",
                  pageKey: commentPage,
                  comment,
                })
              }
              onAnnotate={(comment) => {
                const group = groups.find((g) => g.comments.includes(comment));
                if (group) annotate(group.pageKey, comment);
              }}
            />
          </Stack>
        )}

        {/*
          No save-status text (an approved exception to the autosave
          status rule): saving is silent, and only a failure is reported,
          as a toast.
        */}
        {/* Buttons only, no text (owner decision). */}
        <Panel.Footer>
          <Group justify="space-between" wrap="nowrap" gap="rec-sm" w="100%">
            {/* The footer's two buttons are the default size; every other
                button in the panel is small (owner decision). */}
            <Button
              variant="text"
              disabled={!session}
              data-start-over="true"
              onClick={() => setConfirmation({ kind: "start-over" })}
            >
              Start over
            </Button>
            {/* What the report holds - every comment on every page, not only
                the ones showing - is in a tooltip (on hover and keyboard
                focus) and, for assistive technology, the button's
                description. With no comments the button is disabled and
                has none: a disabled button gets no pointer or focus events,
                and there is nothing to summarise. */}
            {total > 0 ? (
              <Tooltip label={reportSummary}>
                <Button
                  variant="solid"
                  data-download="true"
                  aria-describedby={SUMMARY_ID}
                  onClick={() => setDownloadOpen(true)}
                >
                  Download report
                </Button>
              </Tooltip>
            ) : (
              <Button variant="solid" disabled data-download="true">
                Download report
              </Button>
            )}
            {total > 0 && (
              <span id={SUMMARY_ID} className="art-sr-only">
                {reportSummary}
              </span>
            )}
          </Group>
        </Panel.Footer>
      </Panel>

      {/*
        The toast's live region is always in the DOM, so a message inserted
        into it is announced; a region created together with its message
        often is not (a MUST in the toast rules). It renders in the layer-0
        portal. The kit's Toast has no placement of its own, so it shows
        wherever that container is - the top-left corner of the viewport;
        the hand-set position it used to have was removed in the adapter
        workaround audit.
      */}
      {createPortal(
        <div aria-live="assertive" aria-atomic>
          {toast && (
            <Toast
              variant="error"
              withCloseButton
              closeButtonProps={{ "aria-label": "Dismiss message" }}
              onClose={() => setToast(null)}
              // The wrapper is the live region; a second one here would
              // announce the message twice.
              role="group"
              aria-label="Message"
            >
              {toast}
            </Toast>
          )}
        </div>,
        portalEl,
      )}

      <ConfirmModal
        opened={confirmationCopy != null}
        title={confirmationCopy?.title ?? ""}
        consequence={confirmationCopy?.consequence ?? ""}
        confirmLabel={confirmationCopy?.confirmLabel ?? ""}
        onCancel={cancelConfirmation}
        onConfirm={confirm}
      />
      {headerSlot &&
        createPortal(
          <AddMenu
            disabled={!canComment}
            describedBy={
              loadFailed
                ? LOAD_ERROR_ID
                : tab?.access === "blocked"
                  ? NO_ACCESS_ID
                  : undefined
            }
            busy={captureTarget === "screenshot" || captureTarget === "element"}
            onAddComment={handleAddComment}
            onAddScreenshot={handleAddScreenshot}
            onAddElement={handleAddElement}
          />,
          headerSlot,
        )}

      {downloadOpen && (
        <DownloadModal
          initial={{
            userName: review.userName,
            userEmail: review.userEmail,
            details: session?.details ?? "",
          }}
          onCancel={() => {
            setDownloadOpen(false);
            returnFocus("[data-download]", ADD_MENU);
          }}
          onDownload={downloadWith}
        />
      )}
    </div>
  );
}
