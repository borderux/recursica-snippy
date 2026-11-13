// The annotation editor's tab (annotate.html?page=<key>&id=<id>). The
// side panel opens it beside the page being reviewed, so the screenshot
// is drawn on with the main window's room rather than the side panel's.
// It reads the comment from storage (the panel writes any pending typing
// before opening it), and on closing hands what to store back to the
// panel - see annotateApi.ts - then closes itself.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Stack, Text, Toast } from "@recursica/adapter-mantine-v8";
import { boot } from "./boot";
import {
  DELETE_SCREENSHOT_FIELDS,
  toWire,
  type AnnotateDone,
  type AnnotateReply,
} from "./annotateApi";
import { AnnotationEditor } from "./components/AnnotationEditor";
import { useModalPortal } from "./modalPortal";
import { patchComment, type CommentFields } from "./useReviewSession";
import { commentName } from "../lib/ids";
import {
  loadStoredState,
  savePenColor,
  saveSession,
  type PenColor,
  type StoredState,
} from "../lib/storage";

const params = new URLSearchParams(location.search);
const pageKey = params.get("page") ?? "";
const commentId = Number(params.get("id"));

async function closeThisTab(): Promise<void> {
  const self = await chrome.tabs.getCurrent();
  if (self?.id != null) await chrome.tabs.remove(self.id);
}

// No side panel took the change (it was closed while the editor was
// open): store it here instead. Nothing else is writing the session then.
async function storeDirectly(
  base: string,
  fields: CommentFields,
): Promise<void> {
  const { session, loadFailed } = await loadStoredState();
  if (loadFailed) throw new Error("the saved comments could not be read");
  const page = session?.pages[pageKey];
  const comment = page?.comments.find((c) => c.id === commentId);
  if (!session || !page || !comment) return;
  if ((comment.screenshotClean ?? comment.screenshot) !== base) return;
  await saveSession({
    ...session,
    pages: {
      ...session.pages,
      [pageKey]: {
        ...page,
        comments: page.comments.map((c) =>
          c.id === commentId ? patchComment(c, fields) : c,
        ),
      },
    },
  });
}

function AnnotatePage({ stored }: { stored: StoredState }) {
  const modalPortal = useModalPortal();
  const comment =
    stored.session?.pages[pageKey]?.comments.find((c) => c.id === commentId) ??
    null;
  const screenshot = comment?.screenshot ?? null;
  const base = comment?.screenshotClean ?? screenshot ?? "";
  const [penColor, setPenColor] = useState<PenColor>(stored.penColor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = comment
      ? `Screenshot for ${commentName(comment.commentNumber)} - Snippy`
      : "Snippy annotations";
  }, [comment]);

  // Leaving the tab some other way (its close button, a reload, another
  // address) with unsaved annotations asks first, as Cancel does.
  const dirty = useRef(false);
  const closing = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current && !closing.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const finish = async (fields: CommentFields | null) => {
    closing.current = true;
    setError(null);
    const message: AnnotateDone = {
      type: "snippy-annotate-done",
      pageKey,
      id: commentId,
      base,
      change: fields && toWire(fields),
    };
    let reply: AnnotateReply | undefined;
    try {
      reply = (await chrome.runtime.sendMessage(message)) as
        AnnotateReply | undefined;
    } catch {
      // No side panel is open to receive it.
    }
    if (!reply?.ok && fields) {
      try {
        await storeDirectly(base, fields);
      } catch (err) {
        console.error("Snippy: could not save the annotations.", err);
        closing.current = false;
        setError(
          `Changes not saved: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }
    await closeThisTab();
  };

  return (
    <>
      {comment && screenshot ? (
        <AnnotationEditor
          comment={{ ...comment, screenshot }}
          penColor={penColor}
          onPenColorChange={(color) => {
            setPenColor(color);
            void savePenColor(color).catch((err: unknown) =>
              console.error("Snippy: could not save the pen color.", err),
            );
          }}
          onDirtyChange={(next) => (dirty.current = next)}
          onCancel={() => void finish(null)}
          onSave={(fields) => void finish(fields)}
          // Confirmed in the editor, which asks first.
          onDeleteScreenshot={() => void finish(DELETE_SCREENSHOT_FIELDS)}
        />
      ) : (
        <Stack gap="rec-default" align="flex-start">
          <Text role="alert">
            {stored.loadFailed
              ? "Your saved comments could not be loaded, so this screenshot can't be opened."
              : "This screenshot is no longer there: its comment or the screenshot was deleted."}
          </Text>
          <Button variant="solid" onClick={() => void closeThisTab()}>
            Close tab
          </Button>
        </Stack>
      )}
      {/* The live region is always in the DOM, so a message put into it is
          announced (a MUST in the toast rules). It renders with the editor
          (layer 1), above it. */}
      {modalPortal &&
        createPortal(
          <div aria-live="assertive" aria-atomic>
            {error && (
              <Toast
                variant="error"
                withCloseButton
                closeButtonProps={{ "aria-label": "Dismiss message" }}
                onClose={() => setError(null)}
                role="group"
                aria-label="Message"
              >
                {error}
              </Toast>
            )}
          </div>,
          modalPortal,
        )}
    </>
  );
}

// Workaround (adapter bug): the published adapter's RecursicaThemeProvider
// wraps the page in a painted, padded layer-0 Layer, where its docs and
// types say it marks <body> instead. This page has nothing in that Layer
// (the editor is a modal), so it would show as an empty rounded strip
// across the top. Without it, the theme's stylesheet still applies layer
// 0 wherever only the theme is set.
boot(({ stored }) => <AnnotatePage stored={stored} />, { initLayer0: false });
