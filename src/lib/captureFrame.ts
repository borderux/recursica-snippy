// The frame shown around the whole viewport while a capture mode is on
// (screenshot selection or element picking), so the reviewer knows they
// are in it - instead of a tint over the page, which hid what was being
// captured. Part of the hand-built overlay in the host page's light DOM,
// the one approved non-Recursica surface.
//
// A 2px black line with 2px white dashes on top of it: one of the two
// always contrasts with the page, light or dark. It is fixed to the
// viewport, sits inside it, ignores the pointer and never affects layout.
// Like every overlay element, it is removed before any pixels are taken.

export const FRAME_ATTR = "data-snippy-capture-frame";

// A two-tone dashed edge: a solid black border with white dashes drawn
// over it. Also used for the region-selection rectangle.
export function applyTwoToneEdge(el: HTMLElement): void {
  el.style.boxSizing = "border-box";
  el.style.border = "2px solid #000";
  el.style.outline = "2px dashed #fff";
  el.style.outlineOffset = "-2px";
}

export function createViewportFrame(): HTMLElement {
  const frame = document.createElement("div");
  frame.setAttribute(FRAME_ATTR, "");
  frame.setAttribute("aria-hidden", "true");
  frame.style.all = "initial";
  frame.style.position = "fixed";
  frame.style.inset = "0";
  frame.style.pointerEvents = "none";
  frame.style.zIndex = "2147483647";
  applyTwoToneEdge(frame);
  return frame;
}
