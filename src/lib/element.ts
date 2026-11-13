// Element capture: pick an element on the page, like the browser's
// element inspector, and serialize what a developer needs to find and fix
// it. The picker overlay lives in the host page's light DOM, like the
// screenshot overlay - the one approved non-Recursica surface.
//
// Everything captured here is someone else's page content: it is
// untrusted, it is always escaped where it is shown, and the report tells
// an AI reader never to treat it as instructions.
import { setActiveOverlay } from "./overlay";
import { createViewportFrame } from "./captureFrame";
import type { CapturedElement } from "./types";

export const PICKER_ID = "snippy-element-picker";

// Size caps, so one huge element can't fill the storage quota. Anything cut
// is flagged, and the panel and the report both say so.
export const HTML_CAP = 50_000; // characters
export const STYLES_CAP = 8_000; // characters, summed over "name: value"

// A compact set of computed properties that explain how an element looks
// and lays out - not all ~350, most of which are defaults.
export const STYLE_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "margin",
  "padding",
  "border",
  "border-radius",
  "outline",
  "overflow",
  "flex-direction",
  "flex-wrap",
  "flex",
  "justify-content",
  "align-items",
  "align-self",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "color",
  "background-color",
  "background-image",
  "opacity",
  "box-shadow",
  "transform",
  "visibility",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "white-space",
  "text-overflow",
  "cursor",
] as const;

export type PickResult =
  | { element: Element }
  | { frame: true } // the reviewer chose something inside a frame
  | null; // cancelled

// ---------- Picking ----------

// Finds the deepest element under a point, following open shadow roots.
// Closed shadow roots can't be entered; their host is the deepest pick.
function elementAt(
  x: number,
  y: number,
  frameBlockers: Map<Element, Element>,
): Element | null {
  let el = document.elementFromPoint(x, y);
  // A blocker lying over a frame stands for that frame.
  if (el && frameBlockers.has(el)) return frameBlockers.get(el) ?? null;
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

// The parent, stepping out of an open shadow root to its host.
function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const cls = [...el.classList]
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

// Lets the reviewer choose one element: the mouse highlights what is under
// it and a click chooses; the keyboard works on its own too - arrow up and
// down move to the parent and first child, Enter chooses, Escape cancels.
// While picking, the page's own handlers never see the clicks or keys.
export function pickElement(): Promise<PickResult> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.id = PICKER_ID;
    root.style.all = "initial";

    const box = document.createElement("div");
    box.dataset.snippyPicker = "outline";
    box.style.all = "initial";
    box.style.position = "fixed";
    box.style.zIndex = "2147483647";
    box.style.pointerEvents = "none";
    box.style.border = "2px solid #4f9dff";
    box.style.background = "rgba(79, 157, 255, 0.15)";
    box.style.display = "none";

    const tag = document.createElement("div");
    tag.dataset.snippyPicker = "label";
    tag.style.all = "initial";
    tag.style.position = "fixed";
    tag.style.zIndex = "2147483647";
    tag.style.pointerEvents = "none";
    tag.style.font = "12px/1.4 system-ui, sans-serif";
    tag.style.color = "#fff";
    tag.style.background = "#1b2a41";
    tag.style.padding = "2px 6px";
    tag.style.borderRadius = "3px";
    tag.style.display = "none";

    const help = document.createElement("div");
    help.style.all = "initial";
    help.style.position = "fixed";
    help.style.top = "12px";
    help.style.left = "50%";
    help.style.transform = "translateX(-50%)";
    help.style.zIndex = "2147483647";
    help.style.pointerEvents = "none";
    help.style.font = "13px/1.4 system-ui, sans-serif";
    help.style.color = "#fff";
    help.style.background = "#1b2a41";
    help.style.padding = "6px 12px";
    help.style.borderRadius = "4px";
    // A live region, inserted empty and filled a frame later so screen
    // readers announce it; keyboard moves are announced through it too.
    help.setAttribute("role", "status");
    const HELP_TEXT = "Click an element, or use ↑ ↓ and Enter. Escape cancels.";
    requestAnimationFrame(() => (help.textContent = HELP_TEXT));

    // Crosshair cursor over the whole page while picking.
    const cursor = document.createElement("style");
    cursor.textContent = "* { cursor: crosshair !important; }";

    // Mouse events over a frame go to the framed page, not this one: the
    // picker would never see the frame, and a click would reach the framed
    // page. A transparent blocker over each frame keeps every event here.
    const frameBlockers = new Map<Element, Element>();
    for (const frame of document.querySelectorAll("iframe, frame")) {
      const blocker = document.createElement("div");
      blocker.style.all = "initial";
      blocker.style.position = "fixed";
      blocker.style.zIndex = "2147483646";
      frameBlockers.set(blocker, frame);
      root.appendChild(blocker);
    }
    function placeBlockers() {
      for (const [el, frame] of frameBlockers) {
        const blocker = el as HTMLElement;
        const r = frame.getBoundingClientRect();
        blocker.style.left = `${r.left}px`;
        blocker.style.top = `${r.top}px`;
        blocker.style.width = `${r.width}px`;
        blocker.style.height = `${r.height}px`;
      }
    }
    placeBlockers();

    // The same frame as screenshot selection, so both capture modes look
    // alike. The element's own hover outline stays as it is.
    root.append(createViewportFrame(), box, tag, help, cursor);
    document.documentElement.appendChild(root);

    // Keyboard picking starts at the body.
    let current: Element | null = document.body;
    // The child last stepped up from, so down goes back the same way.
    const trail: Element[] = [];

    function show(el: Element | null) {
      current = el;
      if (!el) {
        box.style.display = "none";
        tag.style.display = "none";
        return;
      }
      const r = el.getBoundingClientRect();
      box.style.display = "block";
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      tag.style.display = "block";
      tag.textContent =
        el.tagName === "IFRAME" || el.tagName === "FRAME"
          ? "Frame: its content can't be captured"
          : describe(el);
      tag.style.left = `${Math.max(0, r.left)}px`;
      tag.style.top = `${r.top > 24 ? r.top - 22 : r.bottom + 4}px`;
    }

    function finish(result: PickResult) {
      cleanup();
      resolve(result);
    }

    function choose() {
      if (!current) return;
      if (current.tagName === "IFRAME" || current.tagName === "FRAME")
        finish({ frame: true });
      else finish({ element: current });
    }

    function block(event: Event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    function onMove(event: MouseEvent) {
      trail.length = 0;
      show(elementAt(event.clientX, event.clientY, frameBlockers));
    }

    function onClick(event: MouseEvent) {
      block(event);
      show(elementAt(event.clientX, event.clientY, frameBlockers));
      choose();
    }

    function onKey(event: KeyboardEvent) {
      if (handleKey(event.key)) block(event);
    }

    // Shared by keys pressed on the page and keys the side panel forwards
    // while focus is there. True if the key was used.
    function handleKey(key: string): boolean {
      if (key === "Escape") {
        finish(null);
        return true;
      }
      if (key === "Enter") {
        choose();
        return true;
      }
      if (key === "ArrowUp" && current) {
        const parent = parentOf(current);
        if (parent && parent !== document.documentElement) {
          trail.push(current);
          show(parent);
          help.textContent = `${describe(parent)}. ${HELP_TEXT}`;
        }
        return true;
      }
      if (key === "ArrowDown" && current) {
        const next =
          trail.pop() ??
          current.firstElementChild ??
          current.shadowRoot?.firstElementChild ??
          null;
        if (next) {
          next.scrollIntoView({ block: "nearest", inline: "nearest" });
          placeBlockers();
          show(next);
          help.textContent = `${describe(next)}. ${HELP_TEXT}`;
        }
        return true;
      }
      return false;
    }

    function onBlur() {
      finish(null);
    }

    const pointerEvents = ["mousedown", "mouseup", "pointerdown", "pointerup"];
    function cleanup() {
      setActiveOverlay(null);
      root.remove();
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      for (const type of pointerEvents)
        document.removeEventListener(type, block, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
    }

    function onScroll() {
      placeBlockers();
      if (current) show(current);
    }

    setActiveOverlay({ key: handleKey, cancel: () => finish(null) });
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    for (const type of pointerEvents)
      document.addEventListener(type, block, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);
    show(current);
  });
}

// ---------- Serializing ----------

function selectorStep(el: Element): string {
  const tagName = el.tagName.toLowerCase();
  if (el.id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const byId = root.querySelectorAll(`#${CSS.escape(el.id)}`);
    if (byId.length === 1) return `#${CSS.escape(el.id)}`;
  }
  const parent = el.parentElement;
  if (!parent) return tagName;
  const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
  return sameTag.length === 1
    ? tagName
    : `${tagName}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

// A selector path down to the element, stopping early at a unique id.
// Crossing into an open shadow root is written " >>> " (the host's path,
// then the path inside the shadow root).
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node) {
    const step = selectorStep(node);
    parts.unshift(step);
    if (step.startsWith("#")) break;
    const parent: Element | null = node.parentElement;
    if (parent && parent !== document.documentElement) {
      node = parent;
      continue;
    }
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      return `${selectorFor(root.host)} >>> ${parts.join(" > ")}`;
    }
    break;
  }
  return parts.join(" > ");
}

// Copies the element with all its descendants, minus anything a person
// typed or chose and anything executable: form values, textarea text,
// select choices, editable content, password values, script contents and
// inline event handlers.
export function sanitizedHtml(el: Element): {
  html: string;
  truncated: boolean;
} {
  const clone = el.cloneNode(true) as Element;
  const all = [clone, ...clone.querySelectorAll("*")];
  for (const node of all) {
    const tagName = node.tagName;
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
    if (tagName === "INPUT") {
      node.removeAttribute("value");
      node.removeAttribute("checked");
    } else if (tagName === "TEXTAREA") {
      node.textContent = "";
    } else if (tagName === "OPTION") {
      node.removeAttribute("selected");
    } else if (tagName === "SCRIPT") {
      node.textContent = "";
    }
    if (
      node.hasAttribute("contenteditable") &&
      node.getAttribute("contenteditable") !== "false"
    ) {
      node.textContent = "";
    }
  }
  const html = clone.outerHTML;
  return html.length > HTML_CAP
    ? { html: html.slice(0, HTML_CAP), truncated: true }
    : { html, truncated: false };
}

export function compactStyles(el: Element): {
  styles: Record<string, string>;
  truncated: boolean;
} {
  const computed = getComputedStyle(el);
  const styles: Record<string, string> = {};
  let size = 0;
  for (const name of STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(name).trim();
    if (!value) continue;
    size += name.length + value.length + 2;
    if (size > STYLES_CAP) return { styles, truncated: true };
    styles[name] = value;
  }
  return { styles, truncated: false };
}

// The part of the element that is on screen, in viewport coordinates, or
// null if none of it is.
export function visibleRect(el: Element): {
  rect: { x: number; y: number; width: number; height: number };
  clipped: boolean;
} | null {
  const r = el.getBoundingClientRect();
  const x = Math.max(0, r.left);
  const y = Math.max(0, r.top);
  const right = Math.min(innerWidth, r.right);
  const bottom = Math.min(innerHeight, r.bottom);
  if (right - x < 1 || bottom - y < 1) return null;
  const clipped =
    x > r.left || y > r.top || right < r.right || bottom < r.bottom;
  return {
    rect: { x, y, width: right - x, height: bottom - y },
    clipped,
  };
}

export function serializeElement(
  el: Element,
  screenshotClipped: boolean,
): CapturedElement {
  const { html, truncated: htmlTruncated } = sanitizedHtml(el);
  const { styles, truncated: stylesTruncated } = compactStyles(el);
  return {
    selector: selectorFor(el),
    html,
    htmlTruncated,
    styles,
    stylesTruncated,
    // The viewport now lives in the comment's context, with the other
    // facts about the moment of capture (older comments keep it here).
    screenshotClipped,
  };
}

// A short, human summary of a captured element for the panel: its tag plus
// its id, or else its first class - `td`, `button.primary`, `div#main`.
// Read from the stored HTML's opening tag, so it works for elements
// captured before this summary existed. Capped at 40 characters; the full
// selector path is only in the report.
const SUMMARY_CAP = 40;

export function elementSummary(el: CapturedElement): string {
  const open = /^<([a-zA-Z][\w-]*)([^>]*)>/.exec(el.html);
  if (!open) return "element";
  const tagName = open[1].toLowerCase();
  const attrs = open[2];
  const id = /\sid\s*=\s*"([^"]+)"/.exec(attrs)?.[1];
  const firstClass = /\sclass\s*=\s*"\s*([^"\s]+)/.exec(attrs)?.[1];
  const summary = id
    ? `${tagName}#${id}`
    : firstClass
      ? `${tagName}.${firstClass}`
      : tagName;
  return summary.length > SUMMARY_CAP
    ? `${summary.slice(0, SUMMARY_CAP - 1)}…`
    : summary;
}
