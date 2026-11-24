import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Heading,
  Link,
  Stack,
  Text,
  TextArea,
  Toast,
} from "@recursica/adapter-mantine-v8";
import {
  hasResponseText,
  responsesText,
  type ReportResponses,
  type ReportSummary,
} from "../../lib/responses";

const VIEW_ID = "art-responses-text";
const LIST_HEADING_ID = "art-report-comments";

interface ReportResponsesProps {
  // The id of the banner text, which also describes the disabled Add menu.
  bannerId: string;
  report: ReportSummary;
  responses: ReportResponses | null;
  // Scrolls the report in the tab to the comment at that position.
  onOpenComment: (index: number) => void;
  // Copied Snippy responses text, from Paste Responses or pasted into the
  // Responses box, to replace this report's responses with (the panel
  // reads it, and asks first when there are responses to lose).
  onPasteText: (text: string) => void;
  // Delete Responses (the panel asks first).
  onDelete: () => void;
  onError: (message: string) => void;
  // The panel's message (a failed paste, copy or save), shown above the
  // Responses box, and dismissing it.
  message: string | null;
  onDismissMessage: () => void;
}

// What the panel shows while the active tab is a downloaded Snippy report:
// a banner saying where to respond; the collected responses as text, with
// Copy, Paste and Delete Responses below them; and the report's comments by
// title, each with what has been done about it. The response controls for
// each comment are in the report (src/page/responses.ts).
export function ReportResponses({
  bannerId,
  report,
  responses,
  onOpenComment,
  onPasteText,
  onDelete,
  onError,
  message,
  onDismissMessage,
}: ReportResponsesProps) {
  const entries = responses?.comments ?? {};
  const any = Object.values(entries).some(
    (e) => e.resolved || hasResponseText(e),
  );
  const text = responses && any ? responsesText(report, responses) : "";

  // "Copied" on the button for a moment, and said to assistive technology.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      onError(
        `Responses not copied: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  // The manifest's clipboardRead permission lets the panel read the
  // clipboard without Chrome asking. Should it fail anyway, pasting into the
  // Responses box always works.
  const paste = async () => {
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      onError(
        "Snippy couldn't read the clipboard. Click in the Responses box and paste (⌘V or Ctrl+V) instead.",
      );
      return;
    }
    onPasteText(clip);
  };

  return (
    <Stack gap="rec-lg" mb="rec-lg">
      {/* The banner: an element no component covers (the kit has no
          banner or alert), coloured from the theme (see panel.css). */}
      <div className="art-report-banner">
        <Text id={bannerId}>
          You&apos;re viewing a Snippy report. Respond using buttons in the
          report. Come back here to review your responses and copy them.
        </Text>
      </div>

      <Stack gap="rec-sm">
        <div>
          {/* The message, above the Responses box, where the reviewer is
            working. The live region is always in the DOM, so a message
            put into it is announced (a MUST in the toast rules). It
            shares one element with the box, so while empty it adds no
            space (see .art-message in panel.css). */}
          <div aria-live="assertive" aria-atomic className="art-message">
            {message && (
              <Toast
                variant="error"
                withCloseButton
                closeButtonProps={{ "aria-label": "Dismiss message" }}
                onClose={onDismissMessage}
                // The wrapper is the live region; a second one here would
                // announce the message twice.
                role="group"
                aria-label="Message"
              >
                {message}
              </Toast>
            )}
          </div>
          {
            // Workaround (adapter bug): the kit's TextArea with readOnly
            // renders a paragraph that runs the lines together, so the text is
            // unreadable. This is the editable TextArea held to the text
            // (typing changes nothing) and marked read-only for assistive
            // technology. Pasting into it replaces the responses, as Paste
            // Responses does.
            <TextArea
              id={VIEW_ID}
              label="Responses"
              aria-readonly
              value={text}
              onChange={() => {}}
              onPaste={(event) => {
                event.preventDefault();
                onPasteText(event.clipboardData.getData("text/plain"));
              }}
              rows={7}
            />
          }
        </div>
        <Group gap="rec-sm" align="center">
          {/* Solid: the main action here (owner decision). */}
          <Button
            variant="solid"
            size="small"
            disabled={!any}
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy Responses"}
          </Button>
          <Button
            variant="outline"
            size="small"
            data-paste-responses="true"
            onClick={() => void paste()}
          >
            Paste Responses
          </Button>
          <Button
            variant="outline"
            size="small"
            disabled={!any}
            data-delete-responses="true"
            onClick={onDelete}
          >
            Delete Responses
          </Button>
          <span role="status" className="art-sr-only">
            {copied ? "Responses copied" : ""}
          </span>
        </Group>
      </Stack>

      {/* Extra space above the list (a spacing token, on top of the
          stack's gap), to set it apart from the responses above. */}
      <Stack gap="rec-sm" mt="rec-lg">
        {/* A small heading: the theme's h6 style, an h3 in the panel's
            outline (under the panel's title). */}
        <Heading order={6} component="h3" id={LIST_HEADING_ID}>
          Comment List
        </Heading>
        <Stack
          component="ol"
          className="art-list"
          aria-labelledby={LIST_HEADING_ID}
          gap="rec-sm"
        >
          {report.comments.map((comment, i) => {
            const entry = entries[comment.key];
            return (
              <li key={comment.key}>
                <Group gap="rec-sm" align="center">
                  <Link
                    component="button"
                    type="button"
                    onClick={() => onOpenComment(i)}
                  >
                    {comment.label}
                  </Link>
                  {entry?.resolved && <Badge variant="success">Resolved</Badge>}
                  {hasResponseText(entry) && (
                    <Badge variant="primary-color">Responded</Badge>
                  )}
                </Group>
              </li>
            );
          })}
        </Stack>
      </Stack>
    </Stack>
  );
}
