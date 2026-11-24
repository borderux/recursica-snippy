// Responses to a downloaded Snippy report: whether each comment is marked
// resolved, and the responder's reply to it. The report file itself never
// changes and has no JavaScript; the page helper adds the response
// controls to a report open in a tab while Snippy's panel is open (see
// src/page/responses.ts), and both the helper and the panel read and write
// what is here.
//
// A report's unique id is its session id: a comment's number is its
// permanent id within the session, never reused (lib/storage.ts,
// ensureUniqueNumbers), so the session plus a comment's number is the same
// comment in every report of that session. Responses are therefore kept
// per session, by comment number, and every report of a session shares
// them. Nothing here touches the review session itself.

export const RESPONSES_KEY_PREFIX = "snippyResponses:";

export interface CommentResponse {
  resolved: boolean;
  // The reply, or null when the Respond box isn't open. An empty string is
  // an open, empty box.
  response: string | null;
}

export interface ReportResponses {
  updatedAt: string;
  // Keyed by the comment's key (see ReportSummary): its number.
  comments: Record<string, CommentResponse>;
}

// What the panel learns about a report open in a tab (from the page
// helper's report()): plain data, read from the report's page.
export interface ReportSummary {
  // Where its responses are stored: "session:<session id>".
  key: string;
  // The report's file name, and its session id ("" when absent).
  file: string;
  sessionId: string;
  // In report order: each comment's label ("Comment 3") and key - its
  // number ("3").
  comments: { label: string; key: string }[];
}

const COMMENT_KEY = /^\d{1,9}$/;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";

// The summary comes from the page, which could be anything that looks like
// a report: only the expected shape is let through.
export function sanitizeSummary(raw: unknown): ReportSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = str(r.key, 200);
  if (!key || !Array.isArray(r.comments)) return null;
  return {
    key,
    file: str(r.file, 500),
    sessionId: str(r.sessionId, 100),
    comments: r.comments.slice(0, 5000).flatMap((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<
        string,
        unknown
      >;
      const key = str(o.key, 20);
      if (!COMMENT_KEY.test(key)) return [];
      return [{ label: str(o.label, 100) || `Comment ${key}`, key }];
    }),
  };
}

export const responsesStorageKey = (reportKey: string) =>
  RESPONSES_KEY_PREFIX + reportKey;

// Stored data is never trusted to have the expected shape: anything that
// doesn't is dropped rather than allowed to break the page or the panel.
export function sanitizeResponses(raw: unknown): ReportResponses {
  const out: ReportResponses = { updatedAt: "", comments: {} };
  if (!raw || typeof raw !== "object") return out;
  const value = raw as Partial<ReportResponses>;
  if (typeof value.updatedAt === "string") out.updatedAt = value.updatedAt;
  if (value.comments && typeof value.comments === "object")
    for (const [index, entry] of Object.entries(value.comments)) {
      if (!COMMENT_KEY.test(index) || !entry || typeof entry !== "object")
        continue;
      const e = entry as Partial<CommentResponse>;
      const response = typeof e.response === "string" ? e.response : null;
      const resolved = e.resolved === true;
      if (resolved || response !== null)
        out.comments[index] = { resolved, response };
    }
  return out;
}

export const hasResponseText = (entry: CommentResponse | undefined) =>
  Boolean(entry?.response?.trim());

export function responseCounts(responses: ReportResponses) {
  const entries = Object.values(responses.comments);
  return {
    resolved: entries.filter((e) => e.resolved).length,
    responded: entries.filter(hasResponseText).length,
  };
}

// The responses as plain text, to send back to the reviewer and to paste
// into another Snippy (Copy Responses, Paste Responses). Its own format,
// versioned separately from the report's:
//
//   ----------(Start)          the start: 10 dashes and (Start)
//   Snippy Response (v1)       the format version
//   File: snippy-report-1.html
//   Session: <session id>      the report's unique id
//   -----                      exactly 5 dashes, before every comment
//   Comment 1 - Resolved       the label; "- Resolved" when resolved
//   -----
//   Comment 3
//   The reply, any number of lines,
//   blank ones included.
//   ----------(End)            the end: 10 dashes and (End)
//
// Only comments that are resolved or have a reply are written. Bump the
// version for any change a reader of older text could misread.
export const RESPONSE_FORMAT_VERSION = 1;
const DASHES = "----------";
const START = `${DASHES}(Start)`;
const END = `${DASHES}(End)`;
const DIVIDER = "-----";

export function responsesText(
  report: ReportSummary,
  state: ReportResponses,
): string {
  const lines = [
    START,
    `Snippy Response (v${RESPONSE_FORMAT_VERSION})`,
    report.file && `File: ${report.file}`,
    report.sessionId && `Session: ${report.sessionId}`,
  ].filter(Boolean);
  report.comments.forEach((c) => {
    const entry = state.comments[c.key];
    if (!entry || (!entry.resolved && !hasResponseText(entry))) return;
    lines.push(DIVIDER, `${c.label}${entry.resolved ? " - Resolved" : ""}`);
    if (hasResponseText(entry)) lines.push(entry.response!.trim());
  });
  lines.push(END);
  return lines.join("\n") + "\n";
}

// Reads responsesText()'s text - copied from this report, perhaps by
// someone else - back into responses for `report`. Anything before the
// start ("----------(Start)") is ignored, even on the same line (a pasted
// email's greeting, say), and so is anything after the end
// ("----------(End)", a signature), which may be missing. The 5-dash lines separate the
// header from each comment; a comment's first line is its label, and the
// rest is its reply. Text for another session - the session is the
// report's unique id - or without one, or from a newer format, is refused.
export function parseResponsesText(
  text: string,
  report: ReportSummary,
): { responses: ReportResponses; count: number } | { error: string } {
  // Everything up to and including the start is dropped, even mid-line,
  // along with the rest of that line. Text whose start lost its "(Start)"
  // still counts: then the first 10 dashes are the start.
  const marked = text.indexOf(START);
  const at = marked >= 0 ? marked : text.indexOf(DASHES);
  if (at < 0)
    return {
      error:
        "that isn't Snippy responses text. Copy it with Copy Responses first.",
    };
  const after = text
    .slice(at + DASHES.length)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(1);
  // Split at the dividers: the header, then one part per comment, up to
  // the end - a line starting with 10 dashes ("(End)", or not) - if any.
  const parts: string[][] = [[]];
  for (const line of after) {
    if (line.trim().startsWith(DASHES)) break;
    if (line.trim() === DIVIDER) parts.push([]);
    else parts[parts.length - 1].push(line);
  }
  const [head, ...blocks] = parts;
  const headLines = head.map((line) => line.trim()).filter(Boolean);
  const version = /^Snippy Response \(v(\d+)\)$/.exec(headLines[0] ?? "");
  if (!version)
    return {
      error:
        "that isn't Snippy responses text. Copy it with Copy Responses first.",
    };
  if (Number(version[1]) > RESPONSE_FORMAT_VERSION)
    return {
      error:
        "those responses were copied from a newer Snippy. Update Snippy to paste them.",
    };
  const field: Record<string, string> = {};
  for (const line of headLines.slice(1)) {
    const m = /^([A-Za-z ]+): (.*)$/.exec(line);
    if (m) field[m[1]] = m[2].trim();
  }
  // The session is the report's unique id: it must be there and match.
  if (report.sessionId && !field.Session)
    return {
      error:
        "the pasted text has no Session line, so it can't be matched to this report.",
    };
  if (report.sessionId && field.Session !== report.sessionId)
    return { error: "those responses are for a different report." };

  const byLabel = new Map(report.comments.map((c) => [c.label, c.key]));
  const comments: Record<string, CommentResponse> = {};
  for (const block of blocks) {
    const first = block.findIndex((line) => line.trim() !== "");
    if (first < 0) continue;
    const m = /^(.*?)( - Resolved)?$/.exec(block[first].trim());
    const key = m ? byLabel.get(m[1]) : undefined;
    if (!m || key === undefined) continue;
    const reply = block
      .slice(first + 1)
      .join("\n")
      .trim();
    if (m[2] || reply)
      comments[key] = { resolved: Boolean(m[2]), response: reply || null };
  }
  const count = Object.keys(comments).length;
  if (count === 0)
    return { error: "no responses to this report's comments were found." };
  return { responses: { updatedAt: "", comments }, count };
}

// Writes a report's responses from the panel (Paste Responses), or removes
// them (Delete Responses). The page helper in the report's tab follows the
// change (chrome.storage.onChanged).
export function saveReportResponses(
  reportKey: string,
  responses: ReportResponses,
): Promise<void> {
  return chrome.storage.local.set({
    [responsesStorageKey(reportKey)]: {
      ...responses,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function deleteReportResponses(reportKey: string): Promise<void> {
  return chrome.storage.local.remove(responsesStorageKey(reportKey));
}
