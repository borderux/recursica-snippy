// Region selection: a drag-select overlay on the page itself. Runs in the
// page (see src/page/main.ts); the side panel then captures the visible
// tab and crops it to the rectangle. The overlay lives in the host page's
// light DOM, where no Recursica component or token reaches - it is the one
// deliberately hand-built surface, approved as such.

import { applyTwoToneEdge, createViewportFrame } from "./captureFrame";
import { setActiveOverlay } from "./overlay";

export const OVERLAY_ID = "snippy-selection-overlay";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Lets the user drag a rectangle directly on the page and resolves with
// its viewport coordinates, or null if they cancel (Escape, leaving the
// window, or too small a drag to count as intentional).
export function selectRegion(): Promise<Rect | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.all = "initial";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.zIndex = "2147483647";
    overlay.style.cursor = "crosshair";
    // No tint: the page stays fully visible. The frame around the
    // viewport says capture mode is on instead.
    overlay.style.background = "transparent";
    const frame = createViewportFrame();
    overlay.appendChild(frame);
    document.documentElement.appendChild(overlay);

    // What to do, announced: a live region inserted empty and filled a
    // frame later, so screen readers read it.
    const help = document.createElement("div");
    help.style.all = "initial";
    help.style.position = "fixed";
    help.style.top = "12px";
    help.style.left = "50%";
    help.style.transform = "translateX(-50%)";
    help.style.font = "13px/1.4 system-ui, sans-serif";
    help.style.color = "#fff";
    help.style.background = "#1b2a41";
    help.style.padding = "6px 12px";
    help.style.borderRadius = "4px";
    help.style.pointerEvents = "none";
    help.setAttribute("role", "status");
    overlay.appendChild(help);
    requestAnimationFrame(
      () => (help.textContent = "Drag to select an area. Escape cancels."),
    );

    const box = document.createElement("div");
    box.style.all = "initial";
    box.style.position = "fixed";
    // An edge only, no fill, so the area being captured stays fully
    // visible.
    applyTwoToneEdge(box);
    box.style.background = "transparent";
    box.style.display = "none";
    overlay.appendChild(box);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    function currentRect(event: MouseEvent): Rect {
      const x = Math.min(event.clientX, startX);
      const y = Math.min(event.clientY, startY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      return { x, y, width, height };
    }

    function onMouseDown(event: MouseEvent) {
      dragging = true;
      // Once the drag starts, only the selection rectangle stays on screen:
      // the instructions and the viewport frame go, so the reviewer never
      // wonders whether they will be in the picture. (They never are - the
      // whole overlay is removed before any pixels are taken.)
      help.style.display = "none";
      frame.style.display = "none";
      startX = event.clientX;
      startY = event.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.display = "block";
    }

    function onMouseMove(event: MouseEvent) {
      if (!dragging) return;
      if (event.buttons === 0) {
        // The mouseup that should have ended this drag never reached us -
        // most likely the button was released outside the browser window.
        // A mousemove with no buttons held means it's already released, so
        // finish here instead of leaving the drag stuck forever.
        onMouseUp(event);
        return;
      }
      const rect = currentRect(event);
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }

    function onMouseUp(event: MouseEvent) {
      if (!dragging) return;
      dragging = false;
      const rect = currentRect(event);
      cleanup();
      resolve(rect.width < 4 || rect.height < 4 ? null : rect);
    }

    function onKeyDown(event: KeyboardEvent) {
      // This Escape belongs to the overlay alone, not to the page.
      if (handleKey(event.key)) event.stopPropagation();
    }

    function handleKey(key: string): boolean {
      if (key !== "Escape") return false;
      cleanup();
      resolve(null);
      return true;
    }

    // The other half of the stuck-drag safety net: focus leaving the window
    // entirely (alt-tab) means no mousemove will ever arrive.
    function onWindowBlur() {
      cleanup();
      resolve(null);
    }

    function cleanup() {
      setActiveOverlay(null);
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onWindowBlur);
    }

    setActiveOverlay({
      key: handleKey,
      cancel: () => handleKey("Escape"),
    });
    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
  });
}
