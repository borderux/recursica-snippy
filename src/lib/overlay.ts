// The capture overlay currently on the page (region selection or element
// picking), if any. Focus is usually in the side panel while one is up, so
// the panel forwards the keys that drive it (Escape, Enter, the arrows)
// and can cancel it - when the reviewer switches tabs, or the panel closes.

export interface ActiveOverlay {
  // Handles a key as if it had been pressed on the page; true if used.
  key(key: string): boolean;
  // Ends the overlay as if the reviewer had pressed Escape.
  cancel(): void;
}

let active: ActiveOverlay | null = null;

export function setActiveOverlay(overlay: ActiveOverlay | null): void {
  active = overlay;
}

export function forwardOverlayKey(key: string): boolean {
  return active?.key(key) ?? false;
}

export function cancelOverlay(): void {
  active?.cancel();
}
