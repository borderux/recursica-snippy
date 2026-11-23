// Whether a newer Snippy has been released. Snippy is installed unpacked
// from a GitHub release zip, and Chrome never updates an unpacked
// extension, so the panel asks GitHub for the latest release and, when it
// is newer than this build, links to it. Installing it stays the
// reviewer's job (README, "Updating").

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/borderux/recursica-snippy/releases/latest";

export interface Release {
  version: string;
  url: string;
}

// "v1.2.3" or "1.2.3" as numbers; null for anything else (a pre-release
// tag, say), which is never counted as newer.
function parseVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// The latest published release (GitHub leaves drafts and pre-releases out
// of "latest"), if it is newer than `current`. Null when it isn't, or when
// GitHub can't be reached or answers with anything unexpected: the check
// is a courtesy and never an error the reviewer sees.
export async function fetchNewerRelease(
  current: string,
  signal?: AbortSignal,
): Promise<Release | null> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
    };
    const tag = typeof data.tag_name === "string" ? data.tag_name : "";
    const url = typeof data.html_url === "string" ? data.html_url : "";
    // Only ever a link into this repository's releases.
    if (
      !url.startsWith("https://github.com/borderux/recursica-snippy/releases/")
    )
      return null;
    if (!isNewerVersion(tag, current)) return null;
    return { version: tag.replace(/^v/, ""), url };
  } catch {
    return null;
  }
}
