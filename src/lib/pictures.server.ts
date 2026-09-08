import { createHash } from "node:crypto";
import { folderForProject } from "./project-id";
import {
  MAX_PICTURE_BYTES,
  MAX_PICTURES,
  contentTypeForName,
  pictureDir,
  sanitizePictureName,
  sniffPictureExt,
  type PictureScope,
} from "./picture-names";
import { loadPictureBytes, savePictureBytes } from "./picture-store.server";
import { readVaultBytes } from "./github-vault.server";

export type IncomingPicture = { data: string; mime: string };

function utcStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function decodeBase64(data: string): Buffer {
  const clean = String(data || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!clean || clean.length > MAX_PICTURE_BYTES * 2) {
    throw new Error("Picture payload too large or empty");
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) throw new Error("Picture payload is not base64");
  return Buffer.from(clean, "base64");
}

export function preparePictures(
  id: string,
  stamp: string,
  incoming: IncomingPicture[] | undefined,
): { name: string; bytes: Buffer; encoding: "base64"; content: string }[] {
  const list = Array.isArray(incoming) ? incoming.slice(0, MAX_PICTURES) : [];
  const out: { name: string; bytes: Buffer; encoding: "base64"; content: string }[] = [];
  for (const item of list) {
    const bytes = decodeBase64(item.data);
    if (bytes.length < 32) throw new Error("Picture is empty");
    if (bytes.length > MAX_PICTURE_BYTES) throw new Error("Picture is over 2 MB");
    const ext = sniffPictureExt(bytes);
    if (!ext) throw new Error("Picture must be png, jpg, webp, or gif. On phones, use a screenshot or save as JPG.");
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    const name = sanitizePictureName(`${id}-${stamp}-${hash}.${ext}`);
    if (!name) throw new Error("Could not name picture");
    if (out.some((p) => p.name === name)) continue;
    out.push({ name, bytes, encoding: "base64", content: bytes.toString("base64") });
  }
  return out;
}

export async function uploadPicture(opts: {
  project: string;
  scope: PictureScope;
  target: string;
  data: string;
  mime: string;
}) {
  const project = opts.project.trim();
  const target = (opts.target || "IMG").toUpperCase().replace(/[^A-Z0-9._-]/g, "") || "IMG";
  const scope: PictureScope = opts.scope === "discussion" ? "discussion" : "log";
  const [pic] = preparePictures(target, utcStamp(), [{ data: opts.data, mime: opts.mime }]);
  if (!pic) throw new Error("No picture");
  const stored = await savePictureBytes(project, scope, pic.name, pic.bytes);
  return {
    ok: true as const,
    name: pic.name,
    project,
    folder: folderForProject(project),
    scope,
    store: stored.store,
    url: stored.url,
  };
}

export async function uploadPictureBytes(opts: {
  project: string;
  scope: PictureScope;
  target: string;
  bytes: Buffer;
}) {
  const project = opts.project.trim();
  const target = (opts.target || "IMG").toUpperCase().replace(/[^A-Z0-9._-]/g, "") || "IMG";
  const scope: PictureScope = opts.scope === "discussion" ? "discussion" : "log";
  if (opts.bytes.length < 32) throw new Error("Picture is empty");
  if (opts.bytes.length > MAX_PICTURE_BYTES) throw new Error("Picture is over 2 MB");
  const ext = sniffPictureExt(opts.bytes);
  if (!ext) throw new Error("Picture must be png, jpg, webp, or gif. On phones, use a screenshot or save as JPG.");
  const hash = createHash("sha256").update(opts.bytes).digest("hex").slice(0, 8);
  const name = sanitizePictureName(`${target}-${utcStamp()}-${hash}.${ext}`);
  if (!name) throw new Error("Could not name picture");
  const stored = await savePictureBytes(project, scope, name, opts.bytes);
  return {
    ok: true as const,
    name,
    project,
    folder: folderForProject(project),
    scope,
    store: stored.store,
    url: stored.url,
  };
}

export async function findPicture(projectId: string, name: string) {
  const local = await loadPictureBytes(projectId, name);
  if (local) return local;
  const safe = sanitizePictureName(name);
  if (!safe) return null;
  const folder = folderForProject(projectId);
  const scopes: PictureScope[] = ["discussion", "log"];
  for (const scope of scopes) {
    const path = `${pictureDir(folder, scope)}/${safe}`;
    try {
      const found = await readVaultBytes(path);
      if (found) {
        return { ...found, name: safe, contentType: contentTypeForName(safe), path, url: null as string | null, store: "github" as const };
      }
    } catch {
      /* vault is optional for pictures */
    }
  }
  return null;
}
