import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// Focus handling for a menu, done here rather than by the library. Focus
// moves onto the first item once the items have rendered, and back to the
// trigger when the menu closes - unless an item moved focus somewhere on
// purpose (a modal, or a new comment's text box), which then keeps it.
// Mantine's own return always goes to the trigger, even after an item
// focused a new comment (which can happen later, once the page has
// answered), so it is switched off where this is used. Tab leaves the
// menu: it closes, and focus goes back to the trigger like every other
// way of closing it.
export function useManagedMenu() {
  const [opened, setOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (opened) {
      wasOpen.current = true;
      const frame = requestAnimationFrame(() => firstItemRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const frame = requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      const focused = document.activeElement;
      // Only when focus was lost with the menu (it was on an item, which
      // is now gone, or nowhere). If an item moved focus somewhere on
      // purpose - a modal, or a new comment's text box - it stays there.
      const lost =
        !focused ||
        focused === document.body ||
        Boolean(focused.closest('[role="menu"]'));
      if (trigger && lost) trigger.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [opened]);

  const onDropdownKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    setOpened(false);
  };

  return { opened, setOpened, triggerRef, firstItemRef, onDropdownKeyDown };
}
