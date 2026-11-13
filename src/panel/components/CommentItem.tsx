import { useEffect, useRef, useState } from "react";
import { Camera, Copy, Trash } from "@phosphor-icons/react";
import {
  Button,
  Card,
  Group,
  Heading,
  Stack,
  Text,
  TextArea,
  Tooltip,
} from "@recursica/adapter-mantine-v8";
import { elementSummary } from "../../lib/element";
import { commentName, formatCommentId } from "../../lib/ids";
import { ariaShortcut, withShortcut } from "../../lib/shortcuts";
import type { ReviewComment } from "../../lib/types";
import { fieldLayout, type FormLayout } from "../ReviewPanel";

interface CommentItemProps {
  comment: ReviewComment;
  formLayout: FormLayout;
  capturingScreenshot: boolean;
  // Heading level for the comment's number: one below the page headings
  // when the list is grouped by page.
  headingOrder: 3 | 4;
  // Whether the screenshot or element image shows in the panel ("Show
  // images"). Off, the element summary and Add annotations stay.
  showImages: boolean;
  // Add screenshot captures the page on screen, so it is only offered on
  // comments about that page.
  canAddScreenshot: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onTextChange: (text: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddScreenshot: () => void;
  onAnnotate: () => void;
}

// One comment, as one card (the kit's Card): its number as the card's
// heading with the row actions beside it, then the screenshot or captured
// element in its own bordered frame (the image and its Add annotations
// button only), then the single field labelled "Comment".
//
// Approved exception (owner decision): the card holds a form control. The
// card rule forbids any form control in a card; the owner wants each
// comment, text box included, on one card.
export function CommentItem({
  comment,
  formLayout,
  capturingScreenshot,
  headingOrder,
  showImages,
  canAddScreenshot,
  autoFocus,
  onFocused,
  onTextChange,
  onDelete,
  onDuplicate,
  onAddScreenshot,
  onAnnotate,
}: CommentItemProps) {
  const number = formatCommentId(comment.commentNumber);
  const name = commentName(comment.commentNumber);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const hasShot = Boolean(comment.screenshot);
  // The image's natural width in CSS px: its pixels divided by the device
  // pixel ratio it was captured at (the current one for older comments). It
  // never shows larger than that; a larger one scales down to the frame.
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);

  // A comment that was just created (or duplicated, or had a screenshot
  // added) takes focus, scrolled into view, with the cursor at the end of
  // its text.
  useEffect(() => {
    if (!autoFocus || !textRef.current) return;
    const el = textRef.current;
    rowRef.current?.scrollIntoView({ block: "nearest" });
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    onFocused();
  }, [autoFocus, onFocused]);

  const summary = comment.element && (
    <Text variant="caption" emphasis="low" truncate>
      {elementSummary(comment.element)}
    </Text>
  );
  const annotate = (
    <Button
      variant="outline"
      size="small"
      aria-label={`Add annotations to ${name}`}
      aria-keyshortcuts={ariaShortcut("annotate")}
      data-shot-edit={comment.id}
      onClick={onAnnotate}
    >
      {withShortcut("Add annotations", "annotate")}
    </Button>
  );

  return (
    <li className="art-row" ref={rowRef} data-comment-row={comment.id}>
      {/* The number and the actions share the first row inside the card's
          content, rather than a Card.Header, whose own padding and divider
          make every card much taller. Then the Comment field, then the
          screenshot or element beneath it. The parts are spaced by the
          theme's general default dimension (rec-default, 8px). */}
      <Card>
        <Card.Content>
          <Stack gap="rec-default">
            <Group justify="space-between" wrap="nowrap" gap="rec-sm">
              <Heading
                order={headingOrder}
                aria-label={commentName(comment.commentNumber, true)}
              >
                {number}
              </Heading>
              <Group gap="rec-sm" wrap="nowrap">
                {/* Solid when it's there (owner decision). */}
                {!hasShot && canAddScreenshot && (
                  <Tooltip label="Add screenshot">
                    <Button
                      variant="solid"
                      size="small"
                      icon={<Camera />}
                      loading={capturingScreenshot}
                      aria-label={`Add screenshot to ${name}`}
                      data-shot-add={comment.id}
                      onClick={onAddScreenshot}
                    />
                  </Tooltip>
                )}
                {/* Dedicated buttons instead of a menu (owner decision).
                    Delete still asks first. */}
                <Tooltip label={withShortcut("Duplicate comment", "duplicate")}>
                  <Button
                    variant="outline"
                    size="small"
                    icon={<Copy />}
                    aria-label={`Duplicate ${name}`}
                    aria-keyshortcuts={ariaShortcut("duplicate")}
                    data-duplicate={comment.id}
                    onClick={onDuplicate}
                  />
                </Tooltip>
                <Tooltip label="Delete comment">
                  <Button
                    variant="outline"
                    size="small"
                    icon={<Trash />}
                    aria-label={`Delete ${name}`}
                    data-delete={comment.id}
                    onClick={onDelete}
                  />
                </Tooltip>
              </Group>
            </Group>
            {/* The Comment field carries the kit's own 8px bottom margin
                (the form's gap between fields), so it and the material
                below it sit in a gapless Stack: the space between them is
                that 8px, not 8px plus the card's gap. */}
            <Stack gap="rec-none">
              <TextArea
                ref={textRef}
                label="Comment"
                {...fieldLayout(formLayout)}
                autosize
                minRows={1}
                placeholder={
                  comment.element
                    ? "Describe the change or feedback for this element"
                    : hasShot
                      ? "Describe the change or feedback for this screenshot"
                      : "Describe the change or feedback"
                }
                value={comment.text}
                onChange={(event) => onTextChange(event.currentTarget.value)}
              />

              {/* Below the Comment field, the supporting material, framed on its own: the image, a
                short summary for an element, and the button that acts on
                the image. The full selector, HTML and styles are in the
                report. With images hidden there is no frame: the summary
                and the button stay, so annotating still works. */}
              {hasShot && showImages && (
                <div className="art-shot-frame">
                  <img
                    className="art-thumb"
                    src={comment.screenshot ?? undefined}
                    onLoad={(event) =>
                      setNaturalWidth(
                        event.currentTarget.naturalWidth /
                          (comment.screenshotScale ??
                            (window.devicePixelRatio || 1)),
                      )
                    }
                    // Our own element (no image component): its natural
                    // width, capped by the frame's width in panel.css.
                    style={
                      naturalWidth ? { width: `${naturalWidth}px` } : undefined
                    }
                    alt={
                      comment.element
                        ? `Screenshot of the element in ${name}`
                        : `Screenshot attached to ${name}`
                    }
                  />
                  {summary}
                  {annotate}
                </div>
              )}
              {hasShot && !showImages && (
                <Stack gap="rec-default" align="flex-start">
                  {summary}
                  {annotate}
                </Stack>
              )}
              {!hasShot && summary}
            </Stack>
          </Stack>
        </Card.Content>
      </Card>
    </li>
  );
}
