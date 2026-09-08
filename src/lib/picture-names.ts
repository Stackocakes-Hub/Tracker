export const PICTURE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export const MAX_PICTURES = 4;
export const MAX_PICTURE_BYTES = 2_000_000;

export type PictureScope = "log" | "discussion";

export function pictureExt(name: string): (typeof PICTURE_EXTS)[number] | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = (m?.[1] ?? "").toLowerCase();
  return (PICTURE_EXTS as readonly string[]).includes(ext) ? (ext as (typeof PICTURE_EXTS)[number]) : null;
}

export function sanitizePictureHref(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const path = u.pathname.toLowerCase();
  if (path.endsWith(".svg") || path.endsWith(".svgz") || path.includes(".svg/")) return null;
  return u.href;
}

export function sanitizePictureName(raw: string): string | null {
  const base = String(raw || "")
    .split(/[/\\]/)
    .pop()
    ?.trim() ?? "";
  if (!base || base.includes("..") || base.includes("\0")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,140}$/.test(base)) return null;
  if (!pictureExt(base)) return null;
  return base;
}

export function sniffPictureExt(bytes: Uint8Array): "png" | "jpg" | "webp" | "gif" | null {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x3c) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function mimeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export function extFromMime(mime: string): "png" | "jpg" | "webp" | "gif" | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "image/png" || m === "image/x-png") return "png";
  if (m === "image/jpeg" || m === "image/jpg" || m === "image/pjpeg") return "jpg";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return null;
}

export function contentTypeForName(name: string): string {
  const ext = pictureExt(name);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export function pictureDir(folder: string, scope: PictureScope) {
  return scope === "discussion" ? `${folder}/ID-Discussion/Pictures` : `${folder}/Pictures`;
}

export function extractImageNames(xml: string): string[] {
  const names: string[] = [];
  const pushName = (raw: string) => {
    const n = sanitizePictureName(raw);
    if (n && !names.includes(n)) names.push(n);
  };
  const pushHref = (raw: string) => {
    const u = sanitizePictureHref(raw);
    if (u && !names.includes(u)) names.push(u);
  };
  const take = (attrs: string, inner = "") => {
    const href = /(?:href|url)\s*=\s*"([^"]*)"/i.exec(attrs);
    const src = /(?:name|path|src)\s*=\s*"([^"]*)"/i.exec(attrs);
    if (href) {
      pushHref(href[1]);
      return;
    }
    const v = (src?.[1] || inner).trim();
    if (v.startsWith("https://")) pushHref(v);
    else pushName(v);
  };
  const src = String(xml || "");
  for (const m of src.matchAll(/<image\b([^>]*)\/>/gi)) take(m[1] || "");
  for (const m of src.matchAll(/<image\b([^>]*)>([^<]*)<\/image>/gi)) take(m[1] || "", m[2] || "");
  return names;
}
