import { useRef, useState } from "react";
import {
  Button,
  Modal,
  Stack,
  TextArea,
  TextField,
} from "@recursica/adapter-mantine-v8";
import { useModalPortal } from "../modalPortal";

// Deliberately loose: something@something.something. The field is
// optional, so an empty value is never an error.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ReportDetails {
  userName: string;
  userEmail: string;
  details: string;
}

interface DownloadModalProps {
  initial: ReportDetails;
  onCancel: () => void;
  onDownload: (values: ReportDetails) => void;
}

// Opens every time Download report is clicked: the reviewer's details for
// the report, prefilled with what was saved last time. Download report (the
// one solid button) saves them and downloads; Cancel changes nothing.
// Rendered on layer 1, like every modal.
export function DownloadModal({
  initial,
  onCancel,
  onDownload,
}: DownloadModalProps) {
  const target = useModalPortal();
  const [values, setValues] = useState(initial);
  // Checked when the reviewer leaves the field, never while typing.
  const [emailInvalid, setEmailInvalid] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof ReportDetails) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const emailOk =
    values.userEmail.trim() === "" || EMAIL_SHAPE.test(values.userEmail.trim());

  return (
    <Modal
      opened
      onClose={onCancel}
      title="Download report"
      portalProps={{ target }}
      // Focus return is done by the panel, to the opener or what replaced
      // it (see ARCHITECTURE.md, "Adapter workarounds").
      returnFocus={false}
      closeButtonAriaLabel="Cancel download"
    >
      {/* One form, stacked: the modal can be as narrow as the window. The
          fields bring their own spacing. */}
      <Stack gap="rec-none">
        <TextField
          label="Reviewer name"
          formLayout="stacked"
          placeholder="First and last name"
          data-autofocus
          value={values.userName}
          onChange={(event) => set("userName")(event.currentTarget.value)}
        />
        <TextField
          ref={emailRef}
          label="Reviewer email"
          type="email"
          formLayout="stacked"
          placeholder="name@example.com"
          error={
            emailInvalid
              ? "Enter an email address like name@example.com"
              : undefined
          }
          value={values.userEmail}
          onChange={(event) => {
            set("userEmail")(event.currentTarget.value);
            if (
              emailInvalid &&
              EMAIL_SHAPE.test(event.currentTarget.value.trim())
            )
              setEmailInvalid(false);
          }}
          onBlur={() => setEmailInvalid(!emailOk)}
        />
        <TextArea
          label="Session details"
          formLayout="stacked"
          autosize
          minRows={1}
          placeholder="What's being reviewed, and any context"
          value={values.details}
          onChange={(event) => set("details")(event.currentTarget.value)}
        />
      </Stack>
      <Modal.Footer>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {/* Never disabled: disabling it as the email field loses focus would
            drop focus on the way to it. A badly formed email is caught on
            click instead - the error shows under the field and focus goes
            there - and nothing downloads. */}
        <Button
          variant="solid"
          onClick={() => {
            if (!emailOk) {
              setEmailInvalid(true);
              emailRef.current?.focus();
              return;
            }
            onDownload({
              userName: values.userName.trim(),
              userEmail: values.userEmail.trim(),
              details: values.details,
            });
          }}
        >
          Download report
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
