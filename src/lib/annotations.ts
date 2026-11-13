// Annotations on a comment's screenshot, kept as objects so they stay
// editable after Save: pen strokes, arrows and numbered dots. Every
// position and size is relative to the image (a fraction of its width, or
// of its height for y), so the objects survive any display scale. The
// annotated image is rendered from the clean image plus these objects.
import { OUTLINE_PX, PEN, PEN_COLORS, STROKE_PX, type PenColor } from "./pen";

export type Annotation =
  // A freehand line: its points, and its width (fraction of image width).
  | {
      kind: "stroke";
      color: PenColor;
      points: [number, number][];
      size: number;
    }
  // An arrow pointing down and to the left at 45 degrees, its head at
  // (x, y); size is its length (fraction of image width).
  | { kind: "arrow"; color: PenColor; x: number; y: number; size: number }
  // A numbered dot centred at (x, y); size is its radius (fraction of image
  // width). Its number is its place among the dots, 1 to N, so deleting
  // one renumbers the rest.
  | { kind: "dot"; color: PenColor; x: number; y: number; size: number };

export type AnnotationKind = Annotation["kind"];

// Sizes at creation, in CSS px at the editor's display scale.
export const ARROW_LENGTH_PX = 64;
export const DOT_RADIUS_PX = 13;

// The number each dot shows, by annotation index.
export function dotNumbers(list: Annotation[]): Map<number, number> {
  const numbers = new Map<number, number>();
  let n = 0;
  list.forEach((a, i) => {
    if (a.kind === "dot") numbers.set(i, (n += 1));
  });
  return numbers;
}

// The arrow's geometry in image px: shaft from the tail (up and to the
// right) to the head, and the two barbs.
export function arrowGeometry(
  a: Extract<Annotation, { kind: "arrow" }>,
  w: number,
  h: number,
) {
  const len = a.size * w;
  const tip = { x: a.x * w, y: a.y * h };
  const d = len / Math.SQRT2;
  const tail = { x: tip.x + d, y: tip.y - d };
  const barb = len * 0.32;
  // The shaft points from tail to tip at 135 degrees; barbs sit 30 degrees
  // either side of the way back up the shaft.
  const back = Math.atan2(tail.y - tip.y, tail.x - tip.x);
  const b1 = {
    x: tip.x + barb * Math.cos(back + Math.PI / 6),
    y: tip.y + barb * Math.sin(back + Math.PI / 6),
  };
  const b2 = {
    x: tip.x + barb * Math.cos(back - Math.PI / 6),
    y: tip.y + barb * Math.sin(back - Math.PI / 6),
  };
  const width = Math.max(2, len / 14);
  return { tip, tail, b1, b2, width };
}

// Moves an annotation by a fraction of the image size.
export function moveAnnotation(
  a: Annotation,
  dx: number,
  dy: number,
): Annotation {
  if (a.kind === "stroke")
    return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...a, x: a.x + dx, y: a.y + dy };
}

// A bounding box in image px, for the selection outline.
export function bounds(a: Annotation, w: number, h: number) {
  if (a.kind === "stroke") {
    const xs = a.points.map(([x]) => x * w);
    const ys = a.points.map(([, y]) => y * h);
    const pad = (a.size * w) / 2 + 4;
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
      h: Math.max(...ys) - Math.min(...ys) + 2 * pad,
    };
  }
  if (a.kind === "dot") {
    const r = a.size * w + 4;
    return { x: a.x * w - r, y: a.y * h - r, w: 2 * r, h: 2 * r };
  }
  const g = arrowGeometry(a, w, h);
  const pad = g.width + 4;
  return {
    x: g.tip.x - pad,
    y: g.tail.y - pad,
    w: g.tail.x - g.tip.x + 2 * pad,
    h: g.tip.y - g.tail.y + 2 * pad,
  };
}

// Draws every annotation onto a canvas the size of the image.
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  list: Annotation[],
  w: number,
  h: number,
): void {
  const numbers = dotNumbers(list);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  list.forEach((a, i) => {
    const pen = PEN[a.color];
    if (a.kind === "stroke") {
      const width = a.size * w;
      const outline = width + (2 * OUTLINE_PX * width) / STROKE_PX;
      for (const [color, lw] of [
        [pen.outline, outline],
        [pen.stroke, width],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        a.points.forEach(([x, y], k) =>
          k === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h),
        );
        if (a.points.length === 1)
          ctx.lineTo(a.points[0][0] * w, a.points[0][1] * h);
        ctx.stroke();
      }
    } else if (a.kind === "arrow") {
      const g = arrowGeometry(a, w, h);
      for (const [color, lw] of [
        [pen.outline, g.width + 2 * Math.max(1, g.width / 3)],
        [pen.stroke, g.width],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(g.tail.x, g.tail.y);
        ctx.lineTo(g.tip.x, g.tip.y);
        ctx.moveTo(g.b1.x, g.b1.y);
        ctx.lineTo(g.tip.x, g.tip.y);
        ctx.lineTo(g.b2.x, g.b2.y);
        ctx.stroke();
      }
    } else {
      const r = a.size * w;
      ctx.fillStyle = pen.stroke;
      ctx.strokeStyle = pen.outline;
      ctx.lineWidth = Math.max(1.5, r / 7);
      ctx.beginPath();
      ctx.arc(a.x * w, a.y * h, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pen.outline;
      ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(numbers.get(i)), a.x * w, a.y * h + r * 0.05);
    }
  });
}

// Renders the annotated image: the clean image with every annotation.
export async function renderAnnotated(
  clean: string,
  list: Annotation[],
): Promise<string> {
  const img = new Image();
  img.src = clean;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("the browser could not create a canvas");
  ctx.drawImage(img, 0, 0);
  drawAnnotations(ctx, list, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10;

// Keeps only well-formed annotations, for data read from storage.
export function sanitizeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (!PEN_COLORS.includes(o.color as PenColor)) continue;
    const color = o.color as PenColor;
    if (!finite(o.size) || (o.size as number) <= 0) continue;
    const size = o.size as number;
    if (o.kind === "stroke" && Array.isArray(o.points) && o.points.length > 0) {
      const points = o.points.filter(
        (p): p is [number, number] =>
          Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]),
      );
      if (points.length === o.points.length)
        out.push({ kind: "stroke", color, points, size });
    } else if (
      (o.kind === "arrow" || o.kind === "dot") &&
      finite(o.x) &&
      finite(o.y)
    ) {
      out.push({
        kind: o.kind,
        color,
        x: o.x as number,
        y: o.y as number,
        size,
      });
    }
  }
  return out;
}
