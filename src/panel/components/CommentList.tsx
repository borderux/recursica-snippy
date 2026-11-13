import { Heading, Link, Stack, Text } from "@recursica/adapter-mantine-v8";
import { pageHref } from "../../lib/links";
import type { ReviewComment } from "../../lib/types";
import type { FormLayout } from "../ReviewPanel";
import type { ReviewSession } from "../useReviewSession";
import { CommentItem } from "./CommentItem";

// What is being captured right now: a new screenshot or element comment,
// or a screenshot for an existing comment (by id).
export type CaptureTarget = "screenshot" | "element" | number | null;

// One page's comments, newest first.
export interface PageGroup {
  pageKey: string;
  title: string;
  comments: ReviewComment[];
  // The page the panel is on right now.
  current: boolean;
}

interface CommentListProps {
  review: ReviewSession;
  // "This page only" on: the current page's comments, with no page
  // heading. Off: every page's comments, each page under its own heading.
  grouped: boolean;
  groups: PageGroup[];
  showImages: boolean;
  formLayout: FormLayout;
  focusId: number | null;
  onFocused: () => void;
  captureTarget: CaptureTarget;
  onAddScreenshotTo: (pageKey: string, comment: ReviewComment) => void;
  onDuplicate: (pageKey: string, comment: ReviewComment) => void;
  onRequestDelete: (pageKey: string, comment: ReviewComment) => void;
  onAnnotate: (comment: ReviewComment) => void;
  // Opens a page in the reviewed tab. The panel is not in that tab, so a
  // link's own navigation would load the page into the side panel.
  onOpenPage: (href: string) => void;
}

// The page's address without the origin's scheme, for the line under a
// page heading: titles are often the same across a site's pages.
function shortUrl(pageKey: string): string {
  return pageKey.replace(/^https?:\/\//, "");
}

// The panel's one view: the comment list, one card per comment, newest
// first. The Add menu that creates comments lives in the panel header
// (AddMenu); the view switches sit pinned above this list. An empty list
// shows nothing.
export function CommentList({
  review,
  grouped,
  groups,
  showImages,
  formLayout,
  focusId,
  onFocused,
  captureTarget,
  onAddScreenshotTo,
  onOpenPage,
  onDuplicate,
  onRequestDelete,
  onAnnotate,
}: CommentListProps) {
  const list = (group: PageGroup, label: string) => (
    <Stack
      component="ol"
      className="art-list"
      aria-label={label}
      gap="rec-default"
    >
      {group.comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          formLayout={formLayout}
          headingOrder={grouped ? 4 : 3}
          showImages={showImages}
          canAddScreenshot={group.current}
          capturingScreenshot={captureTarget === comment.id}
          autoFocus={focusId === comment.id}
          onFocused={onFocused}
          onTextChange={(text) =>
            review.updateComment(group.pageKey, comment.id, { text }, "typing")
          }
          onDelete={() => onRequestDelete(group.pageKey, comment)}
          onDuplicate={() => onDuplicate(group.pageKey, comment)}
          onAddScreenshot={() => onAddScreenshotTo(group.pageKey, comment)}
          onAnnotate={() => onAnnotate(comment)}
        />
      ))}
    </Stack>
  );

  const visible = groups.filter((g) => g.comments.length > 0);
  if (visible.length === 0) return null;

  if (!grouped) return list(visible[0], "Comments on this page");

  // Each page heading is a link to that page, with a real href, opened in
  // the reviewed tab: the link rules forbid opening a new tab
  // automatically, and the reviewer can still choose one with a modifier
  // key or the context menu (left to the browser). The name says it is a page; when two pages share a title, the
  // address is added so the names stay distinct.
  const titleOf = (g: PageGroup) => g.title || shortUrl(g.pageKey);
  const sharedTitle = (g: PageGroup) =>
    visible.filter((o) => titleOf(o) === titleOf(g)).length > 1;
  return (
    <Stack gap="rec-xl">
      {visible.map((group) => {
        const href = pageHref(group.pageKey);
        return (
          <Stack key={group.pageKey} gap="rec-lg" component="section">
            <Stack gap="rec-none">
              <Heading order={3}>
                {href ? (
                  <Link
                    href={href}
                    onClick={(event) => {
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      onOpenPage(href);
                    }}
                    aria-label={
                      sharedTitle(group)
                        ? `Page: ${titleOf(group)}, ${shortUrl(group.pageKey)}`
                        : `Page: ${titleOf(group)}`
                    }
                  >
                    {titleOf(group)}
                  </Link>
                ) : (
                  titleOf(group)
                )}
              </Heading>
              <Text variant="caption" emphasis="low" truncate>
                {shortUrl(group.pageKey)}
              </Text>
            </Stack>
            {list(group, `Comments on ${titleOf(group)}`)}
          </Stack>
        );
      })}
    </Stack>
  );
}
