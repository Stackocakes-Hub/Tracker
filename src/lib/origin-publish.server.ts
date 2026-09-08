import { commitVaultFiles, readVaultBytes } from "./github-vault.server";

export const TRACKER_ORIGIN_PATH = "TRACKER_ORIGIN.txt";

function firstHttps(text: string) {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("https://") && !t.includes(" ")) return t.replace(/\/+$/, "");
  }
  return "";
}

export function publicOriginFromRequest(request: Request): string | null {
  const vite = String(process.env.VITE_PUBLIC_HOSTNAME || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (vite.endsWith(".grok.me")) return `https://${vite}`;
  const raw =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const host = raw.split(",")[0].trim().split(":")[0];
  if (host.endsWith(".grok.me")) return `https://${host}`;
  return null;
}

let lastWritten = "";
let inflight: Promise<void> | null = null;

export async function maybePublishOrigin(request: Request) {
  const origin = publicOriginFromRequest(request);
  if (!origin || origin === lastWritten) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const existing = await readVaultBytes(TRACKER_ORIGIN_PATH);
      const current = existing ? firstHttps(existing.bytes.toString("utf8")) : "";
      if (current === origin) {
        lastWritten = origin;
        return;
      }
      await commitVaultFiles(
        [{ path: TRACKER_ORIGIN_PATH, content: `${origin}\n` }],
        "Publish TRACKER_ORIGIN",
      );
      lastWritten = origin;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
