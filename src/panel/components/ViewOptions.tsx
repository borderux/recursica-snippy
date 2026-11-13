import { Checkbox } from "@recursica/adapter-mantine-v8";
import { ariaShortcut, withShortcut } from "../../lib/shortcuts";

interface ViewOptionsProps {
  // No comments in the session: nothing to filter (owner decision).
  disabled: boolean;
  pageOnly: boolean;
  showImages: boolean;
  onPageOnlyChange: (pageOnly: boolean) => void;
  onShowImagesChange: (showImages: boolean) => void;
}

const PAGE_ONLY = "page-only";
const SHOW_IMAGES = "show-images";

// The two view preferences, as a checkbox group at the top of the
// scrolling list, above the comments: "Only view comments for this url" (checked:
// the current page's comments; unchecked: every page's, grouped by page)
// and "Show screenshot thumbnails" (unchecked hides screenshots in the
// panel only, never in the report). Each is saved the moment it changes,
// under its own key, and never cleared by Start over.
//
// The group has a visible label ("View"): the checkbox rules require a
// real group label, and the label rules forbid a visually hidden one.
export function ViewOptions({
  disabled,
  pageOnly,
  showImages,
  onPageOnlyChange,
  onShowImagesChange,
}: ViewOptionsProps) {
  const value = [
    ...(pageOnly ? [PAGE_ONLY] : []),
    ...(showImages ? [SHOW_IMAGES] : []),
  ];
  return (
    <Checkbox.Group
      label="View"
      formLayout="stacked"
      value={value}
      onChange={(next: string[]) => {
        const nextPageOnly = next.includes(PAGE_ONLY);
        const nextShowImages = next.includes(SHOW_IMAGES);
        if (nextPageOnly !== pageOnly) onPageOnlyChange(nextPageOnly);
        if (nextShowImages !== showImages) onShowImagesChange(nextShowImages);
      }}
    >
      <Checkbox
        value={PAGE_ONLY}
        label={withShortcut("Only view comments for this url", "pageOnly")}
        aria-label="Only view comments for this url"
        aria-keyshortcuts={ariaShortcut("pageOnly")}
        disabled={disabled}
      />
      <Checkbox
        value={SHOW_IMAGES}
        label={withShortcut("Show screenshot thumbnails", "showImages")}
        aria-label="Show screenshot thumbnails"
        aria-keyshortcuts={ariaShortcut("showImages")}
        disabled={disabled}
      />
    </Checkbox.Group>
  );
}
