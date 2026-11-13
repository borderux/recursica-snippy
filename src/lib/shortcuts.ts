// The panel's keyboard shortcuts. They work while the panel is open,
// whether focus is in the panel or on the reviewed page.
//
// One modifier pair per platform, chosen so the shortcuts never take a
// browser's, the operating system's or a text field's own keys (see the
// audit in ARCHITECTURE.md, "Keyboard shortcuts"):
// - macOS: Control+Shift+key. Command combos belong to the browser and
//   macOS, and Option combos type characters (Option+Shift+C is Ç).
// - Windows, Linux and ChromeOS: Alt+Shift+key, with Control not held -
//   AltGr arrives as Control+Alt, so AltGr characters never match.
// Keys are matched by physical key (event.code), so they work the same on
// every keyboard layout; key repeat and IME composition are ignored.

export type ShortcutId =
  | "addComment"
  | "addScreenshot"
  | "addElement"
  | "duplicate"
  | "annotate"
  | "pageOnly"
  | "showImages";

const KEYS: Record<ShortcutId, string> = {
  addComment: "C",
  addScreenshot: "S",
  addElement: "L",
  duplicate: "D",
  annotate: "O",
  pageOnly: "U",
  showImages: "M",
};

export function isMac(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(platform);
}

// The shortcut as shown after a label, e.g. "⌃⇧C" or "Alt+Shift+C".
export function shortcutText(id: ShortcutId): string {
  return isMac() ? `⌃⇧${KEYS[id]}` : `Alt+Shift+${KEYS[id]}`;
}

// A label with its shortcut in parentheses after it.
export function withShortcut(label: string, id: ShortcutId): string {
  return `${label} (${shortcutText(id)})`;
}

// The value for aria-keyshortcuts.
export function ariaShortcut(id: ShortcutId): string {
  return isMac() ? `Control+Shift+${KEYS[id]}` : `Alt+Shift+${KEYS[id]}`;
}

// Which shortcut a key press is, if any.
export function matchShortcut(event: KeyboardEvent): ShortcutId | null {
  if (event.repeat || event.isComposing || event.keyCode === 229) return null;
  const mods = isMac()
    ? event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
    : event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
  if (!mods) return null;
  for (const [id, key] of Object.entries(KEYS) as [ShortcutId, string][])
    if (event.code === `Key${key}`) return id;
  return null;
}
