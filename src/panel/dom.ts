// Small DOM helpers for the panel's own document (the side panel page).

// Finds an element in the panel.
export function findInPanel(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

// Makes everything behind an open modal inert, and returns the function
// that undoes it: the whole panel, and the layer-0 portal with the toast,
// tooltips and menus. Only the modal portal stays live. Prior values are
// restored, never assumed.
export function makeBehindModalInert(): () => void {
  const targets = [
    document.querySelector<HTMLElement>(".art-panel"),
    document.querySelector<HTMLElement>(
      ".art-portal:not([data-recursica-layer])",
    ),
  ].filter((el): el is HTMLElement => Boolean(el));
  const previous = targets.map((el) => el.inert);
  for (const el of targets) el.inert = true;
  return () => targets.forEach((el, i) => (el.inert = previous[i]));
}

// Defect workaround: the adapter's Panel (Mantine's Drawer) always marks
// its content role="dialog" aria-modal="true", even with every modal
// behaviour switched off. This panel is not a dialog - it is the whole
// side panel - so it is announced as a named region instead. Remove when
// the adapter lets a non-modal panel say so.
export function markPanelNonModal(): void {
  const content = document.querySelector(".mantine-Drawer-content");
  if (!content) return;
  content.removeAttribute("aria-modal");
  content.setAttribute("role", "region");
}
