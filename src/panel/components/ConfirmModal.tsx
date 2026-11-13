import { Button, Modal, Text } from "@recursica/adapter-mantine-v8";
import { useModalPortal } from "../modalPortal";

interface ConfirmModalProps {
  opened: boolean;
  title: string;
  // What happens, in words - there is no destructive button style, so the
  // text is the only channel for the consequence.
  consequence: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// One confirmation for every destructive action in the panel: deleting a
// comment, deleting a screenshot, starting over. Cancel is the outline
// button; the confirm is the one solid button. Rendered on layer 1.
export function ConfirmModal({
  opened,
  title,
  consequence,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const target = useModalPortal();
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={title}
      portalProps={{ target }}
      // Focus return is done by the panel, to the opener or what replaced
      // it (see ARCHITECTURE.md, "Adapter workarounds").
      returnFocus={false}
      closeButtonAriaLabel={`Cancel: ${title}`}
    >
      <Text>{consequence}</Text>
      <Modal.Footer>
        {/* Initial focus: the safe choice, not the header's close button. */}
        <Button variant="outline" data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="solid" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
