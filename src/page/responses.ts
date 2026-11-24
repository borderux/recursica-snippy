// Response controls in a downloaded Snippy report. When the page helper
// finds itself in a report (src/lib/report.ts builds them), it adds Mark
// Resolved and Respond to every comment; the panel shows the collected
// responses (View Responses, Copy Responses). The report file has no JavaScript of its own and
// never changes: these controls exist only while Snippy's panel is open,
// are removed when it closes, and keep their state in the extension's
// storage (src/lib/responses.ts).
//
// Owner decision: the report is exempt from the Recursica rules. Its
// controls are the browser's own buttons and text areas, with almost no
// styling, like the rest of the report.
import {
  hasResponseText,
  type ReportSummary,
  responsesStorageKey,
  sanitizeResponses,
  type CommentResponse,
  type ReportResponses,
} from "../lib/responses";

// Every element this adds carries the attribute, so all of it can be
// removed again.
const UI_ATTR = "data-snippy-response-ui";
const SAVE_DELAY_MS = 400;

const STYLE = `
.snippy-response-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px}
.snippy-response-text{display:block;box-sizing:border-box;width:100%;margin-top:6px;font:inherit;font-size:13px}
.snippy-response-text[hidden],[${UI_ATTR}] [hidden],[${UI_ATTR}][hidden]{display:none}
.snippy-check{display:inline-block;width:12px;height:12px;vertical-align:-1px}
.snippy-mark{margin-right:4px;font-size:12px}
.snippy-mark-responded{color:#2563eb}
.snippy-resolve-btn .snippy-check{margin-right:4px}
.snippy-responses-status{margin:8px 0 0;font-size:13px;color:#b42318}
@media print{.snippy-response-actions,.snippy-responses-status{display:none}}
`;

export interface FoundReport {
  summary: ReportSummary;
  // The comments' elements, in the order of summary.comments.
  els: HTMLElement[];
}

const metaOf = (name: string) =>
  document
    .querySelector(`meta[name="${CSS.escape(name)}"]`)
    ?.getAttribute("content")
    ?.trim() ?? "";

// Whether this page is a Snippy report, and which one. A report carries
// its format and session meta tags (format 1.0 had only the session id)
// and the report header; anything else is an ordinary page.
export function findReport(): FoundReport | null {
  if (!document.querySelector(".report-header")) return null;
  // The session id is a report's unique id: every report of a session
  // shares one set of responses.
  const sessionId = metaOf("snippy-session-id");
  if (!/^[\w-]{8,100}$/.test(sessionId)) return null;
  // A comment's key is its number (data-comment-id), its permanent id in
  // the session.
  const els = [
    ...document.querySelectorAll<HTMLElement>(".page-section .comment"),
  ].filter((el) => /^\d{1,9}$/.test(el.dataset.commentId ?? ""));
  if (els.length === 0) return null;
  const comments = els.map((el) => {
    const key = String(Number(el.dataset.commentId));
    return {
      label:
        el.querySelector(".comment-id")?.textContent?.trim() ||
        `Comment ${key}`,
      key,
    };
  });
  return {
    els,
    summary: {
      key: `session:${sessionId}`,
      file: decodeURIComponent(location.pathname.split("/").pop() ?? ""),
      sessionId,
      comments,
    },
  };
}

// The green check, the same drawing in the Mark Resolved button and before
// the comment's number (a font's ✓ differs with the font and size around
// it). Decorative: its container says what it means.
function checkIcon(): HTMLSpanElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M2.5 8.5l3.5 3.5 7.5-8");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#1a7f37");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return make("span", { className: "snippy-check" }, svg);
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.setAttribute(UI_ATTR, "");
  el.append(...children);
  return el;
}

// Adds the controls and returns what removes them again.
export function mountResponses(report: FoundReport): () => void {
  const storageKey = responsesStorageKey(report.summary.key);
  let state: ReportResponses = { updatedAt: "", comments: {} };
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSaved = "";
  let mounted = true;
  // Nothing can be changed until the saved responses have loaded, so a
  // load that fails never leads to them being written over.
  let ready = false;

  const style = make("style", { textContent: STYLE });
  document.head.append(style);

  // Saving or loading failing is said in the header, below the version
  // line; the line is empty otherwise.
  const status = make("p", {
    className: "snippy-responses-status",
    hidden: true,
  });
  status.setAttribute("role", "alert");
  const showStatus = (message: string) => {
    status.textContent = message;
    status.hidden = false;
  };
  const header = document.querySelector(".report-header")!;
  const anchor =
    header.querySelector(".snippy-version") ??
    [...header.querySelectorAll(".report-meta")].pop();
  if (anchor) anchor.after(status);
  else header.append(status);

  // Each comment: a mark before its number, and the buttons and reply box
  // under its text.
  const rows = report.summary.comments.map((c, i) => {
    const el = report.els[i];
    const k = c.key;
    const resolvedMark = make(
      "span",
      { className: "snippy-mark snippy-mark-resolved" },
      checkIcon(),
    );
    resolvedMark.setAttribute("role", "img");
    resolvedMark.setAttribute("aria-label", "Resolved");
    const respondedMark = make(
      "span",
      { className: "snippy-mark snippy-mark-responded" },
      "●",
    );
    respondedMark.setAttribute("role", "img");
    respondedMark.setAttribute("aria-label", "Has a response");
    const body = el.querySelector(".comment-body") ?? el;
    const idLabel = body.querySelector(".comment-id");
    if (idLabel) idLabel.before(resolvedMark, respondedMark);
    else body.prepend(resolvedMark, respondedMark);

    const check = checkIcon();
    const resolveBtn = make(
      "button",
      { type: "button", className: "snippy-resolve-btn" },
      check,
      "Mark Resolved",
    );
    const respondBtn = make("button", { type: "button" });
    const text = make("textarea", {
      className: "snippy-response-text",
      rows: 3,
      hidden: true,
    });
    text.setAttribute("aria-label", `Response to ${c.label}`);
    // Last in the comment, below its element details and screenshots: Mark
    // Resolved and Respond side by side, and the reply box beneath them.
    el.append(
      make(
        "div",
        { className: "snippy-response" },
        make(
          "div",
          { className: "snippy-response-actions" },
          resolveBtn,
          respondBtn,
        ),
        text,
      ),
    );

    const entry = (): CommentResponse =>
      state.comments[k] ?? { resolved: false, response: null };
    const put = (next: CommentResponse) => {
      if (!next.resolved && next.response === null) delete state.comments[k];
      else state.comments[k] = next;
    };

    // Only the responder's own clicks and typing count: a script in a
    // crafted "report" could fire synthetic events.
    resolveBtn.addEventListener("click", (event) => {
      if (!event.isTrusted || !ready) return;
      put({ ...entry(), resolved: !entry().resolved });
      render();
      save();
    });
    respondBtn.addEventListener("click", (event) => {
      if (!event.isTrusted || !ready) return;
      const current = entry();
      if (current.response === null) {
        put({ ...current, response: "" });
        render();
        save();
        text.focus();
        return;
      }
      if (
        current.response.trim() &&
        !window.confirm("Delete this response? This can't be undone.")
      )
        return;
      put({ ...current, response: null });
      render();
      save();
      respondBtn.focus();
    });
    text.addEventListener("input", (event) => {
      if (!event.isTrusted || !ready) return;
      put({ ...entry(), response: text.value });
      render();
      save(SAVE_DELAY_MS);
    });
    text.addEventListener("blur", () => flush());

    const renderRow = () => {
      const e = entry();
      resolvedMark.hidden = !e.resolved;
      respondedMark.hidden = !hasResponseText(e);
      check.hidden = !e.resolved;
      resolveBtn.disabled = !ready;
      respondBtn.disabled = !ready;
      resolveBtn.setAttribute("aria-pressed", String(e.resolved));
      respondBtn.textContent =
        e.response === null ? "Respond" : "Delete Response";
      text.hidden = e.response === null;
      // The box being typed in keeps what is in it.
      if (document.activeElement !== text) text.value = e.response ?? "";
    };
    return { renderRow };
  });

  const render = () => {
    for (const row of rows) row.renderRow();
  };

  // Saving: at once for a click, shortly after typing pauses.
  const write = () => {
    saveTimer = null;
    const empty = Object.keys(state.comments).length === 0;
    if (!empty) state.updatedAt = new Date().toISOString();
    lastSaved = JSON.stringify(state);
    const done = empty
      ? chrome.storage.local.remove(storageKey)
      : chrome.storage.local.set({ [storageKey]: state });
    done.catch((err: unknown) => {
      console.error("Snippy: could not save the responses.", err);
      showStatus(
        `Responses not saved: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };
  const save = (delay = 0) => {
    if (saveTimer) clearTimeout(saveTimer);
    if (delay === 0) write();
    else saveTimer = setTimeout(write, delay);
  };
  const flush = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      write();
    }
  };

  // The same report open in another tab: take its changes, except while
  // this tab has typing of its own still to save.
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !(storageKey in changes) || saveTimer) return;
    const next = sanitizeResponses(changes[storageKey].newValue);
    if (JSON.stringify(next) === lastSaved) return;
    state = next;
    lastSaved = JSON.stringify(next);
    render();
  };
  const onPageHide = () => flush();

  render();
  void chrome.storage.local.get(storageKey).then(
    (stored) => {
      if (!mounted) return;
      state = sanitizeResponses(stored[storageKey]);
      lastSaved = JSON.stringify(state);
      ready = true;
      render();
      chrome.storage.onChanged.addListener(onChanged);
    },
    (err: unknown) => {
      console.error("Snippy: could not load the responses.", err);
      showStatus("Saved responses could not be loaded.");
    },
  );
  window.addEventListener("pagehide", onPageHide);

  return () => {
    mounted = false;
    flush();
    chrome.storage.onChanged.removeListener(onChanged);
    window.removeEventListener("pagehide", onPageHide);
    for (const el of document.querySelectorAll(`[${UI_ATTR}]`)) el.remove();
  };
}
