import { useSyncExternalStore } from "react";

// Light and dark follow the operating system, live.
export type Scheme = "light" | "dark";

const QUERY = "(prefers-color-scheme: dark)";

function initialScheme(): Scheme {
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// The current scheme, for RecursicaThemeProvider and Mantine (App.tsx).
export function useColorScheme(): Scheme {
  return useSyncExternalStore(subscribe, initialScheme);
}
