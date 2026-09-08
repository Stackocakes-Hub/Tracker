import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { head, list, put } from "@vercel/blob";
import { sanitizeProjectId } from "./project-id";
import { contentTypeForName, sanitizePictureName, type PictureScope } from "./picture-names";

const mem = new Map<string, Buffer>();
const urlMem = new Map<string, string>();

function blobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    ""
  ).trim();
}

export function blobConfigured() {
  return Boolean(blobToken());
}

function idKey(project: string, scope: PictureScope, name: string) {
  return `${project}/${scope}/${name}`;
}

export function blobPathname(project: string, scope: PictureScope, name: string) {
  return `pictures/${sanitizeProjectId(project)}/${scope}/${name}`;
}

function dirFor(project: string, scope: PictureScope) {
  return join(process.cwd(), "data", "tracker-pictures", sanitizeProjectId(project), scope);
}

function fileFor(project: string, scope: PictureScope, name: string) {
  return join(dirFor(project, scope), name);
}

function saveLocal(project: string, scope: PictureScope, name: string, bytes: Buffer) {
  const id = sanitizeProjectId(project);
  mem.set(idKey(id, scope, name), bytes);
  try {
    mkdirSync(dirFor(id, scope), { recursive: true });
    writeFileSync(fileFor(id, scope, name), bytes);
  } catch {
    /* memory still holds it for this process */
  }
}

export async function savePictureBytes(project: string, scope: PictureScope, name: string, bytes: Buffer) {
  const safe = sanitizePictureName(name);
  if (!safe) throw new Error("Could not name picture");
  const id = sanitizeProjectId(project);
  const token = blobToken();
  saveLocal(id, scope, safe, bytes);
  if (!token) {
    return { name: safe, project: id, scope, store: "local" as const, url: null as string | null };
  }
  const pathname = blobPathname(id, scope, safe);
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentTypeForName(safe),
    token,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  urlMem.set(idKey(id, scope, safe), blob.url);
  return { name: safe, project: id, scope, store: "blob" as const, url: blob.url };
}

async function blobUrlFor(project: string, scope: PictureScope, name: string): Promise<string | null> {
  const id = sanitizeProjectId(project);
  const hit = urlMem.get(idKey(id, scope, name));
  if (hit) return hit;
  const token = blobToken();
  if (!token) return null;
  const pathname = blobPathname(id, scope, name);
  try {
    const meta = await head(pathname, { token });
    if (meta?.url) {
      urlMem.set(idKey(id, scope, name), meta.url);
      return meta.url;
    }
  } catch {
    /* try list */
  }
  try {
    const listed = await list({ prefix: pathname, token, limit: 8 });
    const found = listed.blobs.find((b) => b.pathname === pathname || b.pathname.endsWith(`/${name}`));
    if (found?.url) {
      urlMem.set(idKey(id, scope, name), found.url);
      return found.url;
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadPictureBytes(project: string, name: string) {
  const safe = sanitizePictureName(name);
  if (!safe) return null;
  let id = "";
  try {
    id = sanitizeProjectId(project);
  } catch {
    return null;
  }
  const scopes: PictureScope[] = ["discussion", "log"];
  for (const scope of scopes) {
    const memHit = mem.get(idKey(id, scope, safe));
    if (memHit) {
      return {
        bytes: memHit,
        name: safe,
        contentType: contentTypeForName(safe),
        path: `memory:${scope}/${safe}`,
        url: urlMem.get(idKey(id, scope, safe)) ?? null,
        store: "local" as const,
      };
    }
    try {
      const bytes = readFileSync(fileFor(id, scope, safe));
      if (bytes.length) {
        mem.set(idKey(id, scope, safe), bytes);
        return {
          bytes,
          name: safe,
          contentType: contentTypeForName(safe),
          path: fileFor(id, scope, safe),
          url: urlMem.get(idKey(id, scope, safe)) ?? null,
          store: "local" as const,
        };
      }
    } catch {
      /* next */
    }
  }
  for (const scope of scopes) {
    const url = await blobUrlFor(id, scope, safe);
    if (url) {
      return {
        bytes: null as Buffer | null,
        name: safe,
        contentType: contentTypeForName(safe),
        path: blobPathname(id, scope, safe),
        url,
        store: "blob" as const,
      };
    }
  }
  return null;
}
