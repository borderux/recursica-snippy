// crypto.randomUUID() needs a secure context - fine on https, but this
// extension's whole pitch is "works on any site", including plain http
// ones, where randomUUID doesn't exist even though crypto itself does.
// getRandomValues() isn't restricted that way, so it's the fallback
// instead of reaching for Math.random().
export function generateGuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// The one place a comment's number is turned into text. Comments are
// numbered 1 to N across the session, in creation order, with no gaps -
// the stored commentNumber, renumbered after every delete. A number is a
// position, not a permanent id.
// formatCommentId is the bare number (the visible heading, and the
// report's data-comment-id); commentName is how it is referred to in words
// ("comment 3", "Comment 3").
export function formatCommentId(n: number): string {
  return String(n);
}

export function commentName(n: number, capitalized = false): string {
  return `${capitalized ? "Comment" : "comment"} ${formatCommentId(n)}`;
}
