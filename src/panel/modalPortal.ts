import { createContext, useContext } from "react";

// Where modals render: a container inside the shadow root that declares
// layer 1, so every modal sits on layer 1 as the adapter's Layer guide
// asks. Tooltips, menus and the toast use the layer-0 portal instead (the
// Portal default in App.tsx).
export const ModalPortalContext = createContext<HTMLElement | undefined>(
  undefined,
);

export function useModalPortal(): HTMLElement | undefined {
  return useContext(ModalPortalContext);
}
