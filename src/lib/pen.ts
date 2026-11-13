export const PEN_COLORS = [
  "red",
  "white",
  "black",
  "green",
  "blue",
  "yellow",
] as const;
export type PenColor = (typeof PEN_COLORS)[number];

// The annotation pen's colours. They are drawn into the screenshot itself,
// so they are fixed values: a theme colour would be baked in as whatever
// the theme happened to be at the time. Every stroke also gets a thin
// outline in the opposite tone, so white and black (and every other
// colour) stay visible on both light and dark screenshots.
export const PEN: Record<
  PenColor,
  { name: string; stroke: string; outline: string }
> = {
  red: { name: "Red", stroke: "#ff1f1f", outline: "#ffffff" },
  white: { name: "White", stroke: "#ffffff", outline: "#000000" },
  black: { name: "Black", stroke: "#000000", outline: "#ffffff" },
  green: { name: "Green", stroke: "#00c853", outline: "#000000" },
  blue: { name: "Blue", stroke: "#2979ff", outline: "#ffffff" },
  yellow: { name: "Yellow", stroke: "#ffea00", outline: "#000000" },
};

// Visual widths in CSS px, scaled to the image's natural resolution when
// drawn so a stroke looks the same however small the image displays.
export const STROKE_PX = 3;
export const OUTLINE_PX = 1;
