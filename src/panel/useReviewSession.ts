import { useCallback, useEffect, useRef, useState } from "react";
import {
  sessionEnvironmentNow,
  type SessionEnvironment,
} from "../lib/environment";
import { generateGuid } from "../lib/ids";
import { renumberComments, saveReviewer, saveSession } from "../lib/storage";
import type { RecursicaDetection } from "../lib/recursica";
import type { ReviewComment, Session } from "../lib/types";

// The fields of a comment other than its id and number.
export type CommentFields = Partial<
  Omit<ReviewComment, "id" | "commentNumber">
>;

// Structural changes (a new, deleted or duplicated comment, a capture, a
// start over) save immediately. Plain typing saves after a pause instead,
// so chrome.storage.local isn't written on every keystroke.
const TYPING_SAVE_DELAY_MS = 400;

function newSession(): Session {
  return {
    startedAt: Date.now(),
    guid: generateGuid(),
    commentCounter: 0,
    pages: {},
    details: "",
    environment: sessionEnvironmentNow(),
  };
}

function withPageComments(
  session: Session,
  pageKey: string,
  update: (comments: ReviewComment[]) => ReviewComment[],
  title = "",
): Session {
  // Each page entry carries its own title (the tab's), captured the first
  // time a comment touches that page, while it is still accurate.
  const page = session.pages[pageKey] ?? { title, comments: [] };
  return {
    ...session,
    pages: {
      ...session.pages,
      [pageKey]: { ...page, comments: update(page.comments) },
    },
  };
}

// A comment with a patch applied. A field set to undefined is removed.
export function patchComment(
  comment: ReviewComment,
  patch: CommentFields,
): ReviewComment {
  const next: ReviewComment = { ...comment, ...patch };
  for (const [key, value] of Object.entries(patch))
    if (value === undefined) delete next[key as keyof CommentFields];
  return next;
}

interface Options {
  initialSession: Session | null;
  initialUserName: string;
  initialUserEmail: string;
  // Called when a write to storage fails, with the browser's reason. The
  // panel shows no "saved" status (an approved exception); a failure is
  // the one save outcome it reports.
  onSaveError: (reason: string) => void;
}

export function useReviewSession({
  initialSession,
  initialUserName,
  initialUserEmail,
  onSaveError,
}: Options) {
  const [session, setSessionState] = useState<Session | null>(initialSession);
  const [userName, setUserNameState] = useState(initialUserName);
  const [userEmail, setUserEmailState] = useState(initialUserEmail);

  // Handlers need the latest session synchronously (for example, to hand
  // a new comment's id to focus), so it is mirrored in a ref that only
  // event handlers read.
  const latest = useRef<Session | null>(initialSession);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewer = useRef({
    userName: initialUserName,
    userEmail: initialUserEmail,
  });

  const onSaveErrorRef = useRef(onSaveError);
  useEffect(() => {
    onSaveErrorRef.current = onSaveError;
  }, [onSaveError]);

  // Every write goes through here, so a failure is reported the same way
  // whichever key was written. The unlimitedStorage permission lifts the
  // quota that screenshots would otherwise fill, but a write can still
  // fail.
  const track = useCallback((write: Promise<void>) => {
    write.catch((err: unknown) => {
      console.error("Snippy: could not save.", err);
      onSaveErrorRef.current(String(err instanceof Error ? err.message : err));
    });
  }, []);

  const commit = useCallback(
    (next: Session | null, mode: "now" | "typing") => {
      latest.current = next;
      setSessionState(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (mode === "now") {
        saveTimer.current = null;
        track(saveSession(next));
        return;
      }
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        track(saveSession(latest.current));
      }, TYPING_SAVE_DELAY_MS);
    },
    [track],
  );

  // Writes anything still waiting on the typing delay. Called when the
  // panel closes, so closing mid-sentence never loses the sentence.
  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void saveSession(latest.current);
    }
    if (reviewerTimer.current) {
      clearTimeout(reviewerTimer.current);
      reviewerTimer.current = null;
      void saveReviewer(reviewer.current.userName, reviewer.current.userEmail);
    }
  }, []);

  useEffect(() => flush, [flush]);

  // Creates a comment at the top of the page's list (newest first) and
  // returns its id. Comments are numbered 1 to N across the whole session,
  // in creation order, so a new one is always N + 1 (commentCounter is N).
  const addComment = useCallback(
    (pageKey: string, title: string, fields: CommentFields = {}) => {
      const base = latest.current ?? newSession();
      const commentNumber = base.commentCounter + 1;
      // Ids are creation times; never reuse one, even within a millisecond.
      const lastId = Math.max(
        0,
        ...Object.values(base.pages).flatMap((p) =>
          p.comments.map((c) => c.id),
        ),
      );
      const comment: ReviewComment = {
        text: "",
        screenshot: null,
        // The page's context at the moment it was made (viewport, scroll
        // and so on) comes in `fields`, read from the page by the caller.
        ...fields,
        id: Math.max(Date.now(), lastId + 1),
        commentNumber,
      };
      commit(
        withPageComments(
          { ...base, commentCounter: commentNumber },
          pageKey,
          (list) => [comment, ...list],
          title,
        ),
        "now",
      );
      return comment.id;
    },
    [commit],
  );

  // A copy of everything but the id and the number.
  const duplicateComment = useCallback(
    (pageKey: string, source: ReviewComment) => {
      const fields: CommentFields = structuredClone(source);
      delete (fields as Partial<ReviewComment>).id;
      delete (fields as Partial<ReviewComment>).commentNumber;
      // The source's page already exists, with its title.
      return addComment(pageKey, "", fields);
    },
    [addComment],
  );

  const updateComment = useCallback(
    (
      pageKey: string,
      id: number,
      // A field set to undefined is removed.
      patch: CommentFields,
      mode: "now" | "typing",
    ) => {
      const current = latest.current;
      if (!current) return;
      commit(
        withPageComments(current, pageKey, (list) =>
          list.map((c) => (c.id === id ? patchComment(c, patch) : c)),
        ),
        mode,
      );
    },
    [commit],
  );

  // Records (or refreshes) the reviewer's environment on the session.
  const setEnvironment = useCallback(
    (environment: SessionEnvironment) => {
      const current = latest.current;
      if (!current) return;
      if (JSON.stringify(current.environment) === JSON.stringify(environment))
        return;
      commit({ ...current, environment }, "now");
    },
    [commit],
  );

  // Records the page's Recursica detection. Saved at once; nothing else
  // on the page changes.
  const setPageRecursica = useCallback(
    (pageKey: string, recursica: RecursicaDetection) => {
      const current = latest.current;
      const page = current?.pages[pageKey];
      if (!current || !page) return;
      commit(
        {
          ...current,
          pages: { ...current.pages, [pageKey]: { ...page, recursica } },
        },
        "now",
      );
    },
    [commit],
  );

  // Deleting renumbers every remaining comment, so the numbers stay 1 to
  // N with no gaps: a deleted number is not kept back.
  const deleteComment = useCallback(
    (pageKey: string, id: number) => {
      const current = latest.current;
      if (!current?.pages[pageKey]) return;
      const without = withPageComments(current, pageKey, (comments) =>
        comments.filter((c) => c.id !== id),
      );
      // Fresh comment objects, so the renumbering never changes anything
      // React is still holding.
      const pages = Object.fromEntries(
        Object.entries(without.pages).map(([key, page]) => [
          key,
          { ...page, comments: page.comments.map((c) => ({ ...c })) },
        ]),
      );
      commit(renumberComments({ ...without, pages }), "now");
    },
    [commit],
  );

  // The first keystroke into session details with no session yet starts
  // one.
  const setDetails = useCallback(
    (details: string) => {
      commit({ ...(latest.current ?? newSession()), details }, "typing");
    },
    [commit],
  );

  const startOver = useCallback(() => commit(null, "now"), [commit]);

  const scheduleReviewerSave = useCallback(() => {
    if (reviewerTimer.current) clearTimeout(reviewerTimer.current);
    reviewerTimer.current = setTimeout(() => {
      reviewerTimer.current = null;
      track(
        saveReviewer(reviewer.current.userName, reviewer.current.userEmail),
      );
    }, TYPING_SAVE_DELAY_MS);
  }, [track]);

  const setUserName = useCallback(
    (value: string) => {
      reviewer.current.userName = value;
      setUserNameState(value);
      scheduleReviewerSave();
    },
    [scheduleReviewerSave],
  );

  const setUserEmail = useCallback(
    (value: string) => {
      reviewer.current.userEmail = value;
      setUserEmailState(value);
      scheduleReviewerSave();
    },
    [scheduleReviewerSave],
  );

  // Anything still waiting on the typing delay is written as soon as the
  // panel is being hidden or closed, so closing it never loses typing.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  return {
    track,
    session,
    userName,
    userEmail,
    addComment,
    duplicateComment,
    updateComment,
    deleteComment,
    setPageRecursica,
    setEnvironment,
    setDetails,
    startOver,
    setUserName,
    setUserEmail,
    flush,
  };
}

export type ReviewSession = ReturnType<typeof useReviewSession>;
