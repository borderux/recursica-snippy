import { Plus, X } from "@phosphor-icons/react";
import { Button, Menu, Tooltip } from "@recursica/adapter-mantine-v8";
import { ariaShortcut, withShortcut } from "../../lib/shortcuts";
import { useManagedMenu } from "./useManagedMenu";

interface AddMenuProps {
  busy: boolean;
  // Off when saved data could not be loaded; describedBy then points at
  // the message in the panel body that says why.
  disabled: boolean;
  describedBy?: string;
  onAddComment: () => void;
  onAddScreenshot: () => void;
  onAddElement: () => void;
}

// The one add control, in the panel header to the left of the title: a
// small, icon-only, outline button that opens a menu - Comment,
// Screenshot, Element. Each
// item creates a new numbered comment at the top of the list, with focus in
// its text box; a cancelled capture returns focus here.
export function AddMenu({
  busy,
  disabled,
  describedBy,
  onAddComment,
  onAddScreenshot,
  onAddElement,
}: AddMenuProps) {
  const { opened, setOpened, triggerRef, firstItemRef, onDropdownKeyDown } =
    useManagedMenu();
  return (
    // returnFocus off: Mantine's Menu always sends focus back to the
    // trigger after closing, which would pull it out of the new comment's
    // text box. useManagedMenu returns it only when it was lost.
    <Menu
      trapFocus={false}
      returnFocus={false}
      opened={opened}
      onChange={setOpened}
    >
      <Tooltip label="Add">
        <Menu.Target>
          <Button
            ref={triggerRef}
            // Solid (owner decision: several solid buttons on the panel).
            variant="solid"
            size="small"
            // While the menu is open the icon is an X (owner decision); the
            // name stays "Add" and aria-expanded carries the open state.
            icon={opened ? <X /> : <Plus />}
            aria-label="Add"
            aria-describedby={describedBy}
            disabled={disabled}
            loading={busy}
            data-add-menu="true"
          />
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown onKeyDown={onDropdownKeyDown}>
        {/* Each item shows its shortcut after its label; the accessible
            name stays the plain label, and aria-keyshortcuts carries it. */}
        <Menu.Item
          ref={firstItemRef}
          aria-label="Comment"
          aria-keyshortcuts={ariaShortcut("addComment")}
          onClick={onAddComment}
        >
          {withShortcut("Comment", "addComment")}
        </Menu.Item>
        <Menu.Item
          aria-label="Screenshot"
          aria-keyshortcuts={ariaShortcut("addScreenshot")}
          onClick={onAddScreenshot}
        >
          {withShortcut("Screenshot", "addScreenshot")}
        </Menu.Item>
        <Menu.Item
          aria-label="Element"
          aria-keyshortcuts={ariaShortcut("addElement")}
          onClick={onAddElement}
        >
          {withShortcut("Element", "addElement")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
