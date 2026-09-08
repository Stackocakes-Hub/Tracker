import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { folderForProject, idFromFolder } from "./project-id";
import { TRACKER_VAULT_TOKEN } from "./vault-token.server";

const exec = promisify(execFile);
export const OWNER = "Stackocakes-Hub";
export const REPO = "Tracker-Vault";
export const BRANCH = "main";
export const VAULT_HTML = `https://github.com/${OWNER}/${REPO}`;

let cachedToken: string | null | undefined;

function tokenFromEnv() {
  return (
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_PAT ||
    process.env.TRACKER_GH_TOKEN ||
    TRACKER_VAULT_TOKEN ||
    ""
  ).trim();
}

function tokenFromFiles() {
  const files = [
    join(process.cwd(), "data/tracker-vault.token"),
    "/workspace/data/tracker-vault.token",
    join(homedir(), ".config/gh/hosts.yml"),
    join(homedir(), ".config/gh/hosts.yaml"),
    "/root/.config/gh/hosts.yml",
  ];
  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8").trim();
      if (!text) continue;
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        const m = text.match(/oauth_token:\s*(\S+)/);
        if (m?.[1]) return m[1].trim();
        continue;
      }
      if (text.length >= 20 && !text.includes(" ")) return text;
    } catch {
      /* next */
    }
  }
  return "";
}

async function githubToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const envTok = tokenFromEnv();
  if (envTok) {
    cachedToken = envTok;
    return envTok;
  }
  const fileTok = tokenFromFiles();
  if (fileTok) {
    cachedToken = fileTok;
    return fileTok;
  }
  const ghPaths = ["/usr/local/bin/gh", "/usr/bin/gh", "gh"];
  const errors: string[] = [];
  for (const bin of ghPaths) {
    try {
      const { stdout, stderr } = await exec(bin, ["auth", "token"], {
        timeout: 20000,
        env: { ...process.env, PATH: `${process.env.PATH || ""}:/usr/local/bin:/usr/bin` },
      });
      const t = stdout.trim();
      if (t) {
        cachedToken = t;
        return t;
      }
      if (stderr) errors.push(`${bin}: ${stderr.trim().slice(0, 80)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${bin}: ${msg.slice(0, 80)}`);
    }
  }
  throw new Error(
    "GitHub write token missing on this host (not Tracker login). Need GH_TOKEN/GITHUB_TOKEN, or the gh CLI. " +
      (errors[0] ? `Detail: ${errors[0]}` : "No token env and gh was not found."),
  );
}

async function headers(write: boolean): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Tracker-Vault",
  };
  try {
    h.Authorization = `Bearer ${await githubToken()}`;
  } catch (e) {
    if (write) throw e;
  }
  return h;
}

async function gh<T>(path: string, init: RequestInit & { write?: boolean } = {}): Promise<T> {
  const { write, ...rest } = init;
  const res = await fetch(`https://api.github.com${path}`, {
    cache: "no-store",
    ...rest,
    headers: {
      ...(await headers(Boolean(write))),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 240)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type GhRead<T> = { status: number; etag: string; data: T | null };

async function ghRead<T>(path: string, etag?: string): Promise<GhRead<T>> {
  const h = await headers(false);
  if (etag) h["If-None-Match"] = etag;
  const res = await fetch(`https://api.github.com${path}`, { cache: "no-store", headers: h });
  const next = res.headers.get("etag") || etag || "";
  if (res.status === 304) return { status: 304, etag: next, data: null };
  const text = await res.text();
  if (res.status === 404) return { status: 404, etag: "", data: null };
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 240)}`);
  return { status: res.status, etag: next, data: text ? (JSON.parse(text) as T) : null };
}

const blobCache = new Map<string, string>();
const bytesCache = new Map<string, Buffer>();

export type VaultFile = { path: string; content: string; encoding?: "utf-8" | "base64" };
export type VaultProject = { id: string; folder: string };

type DirEntry = { name: string; path: string; sha: string; type: "file" | "dir" };
type ProjectCache = { dirEtag: string; files: VaultFile[]; sha: string; at: number };
type RootCache = { etag: string; projects: VaultProject[]; sha: string; at: number };

const projectCache = new Map<string, ProjectCache>();
let rootCache: RootCache | null = null;
const COALESCE_MS = 5_000;

function contentsUrl(path: string) {
  const base = `/repos/${OWNER}/${REPO}/contents`;
  return path ? `${base}/${path}?ref=${BRANCH}` : `${base}?ref=${BRANCH}`;
}

async function blobBySha(sha: string): Promise<string> {
  const hit = blobCache.get(sha);
  if (hit != null) return hit;
  const blob = await gh<{ content?: string }>(`/repos/${OWNER}/${REPO}/git/blobs/${sha}`);
  const content = Buffer.from((blob.content || "").replace(/\n/g, ""), "base64").toString("utf8");
  blobCache.set(sha, content);
  return content;
}

function wantedFile(name: string) {
  return name.endsWith(".xml") || name === "MANIFEST.txt";
}

async function filesFromListing(entries: DirEntry[]): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  for (const e of entries) {
    if (e.type === "file" && wantedFile(e.name)) {
      files.push({ path: e.path, content: await blobBySha(e.sha) });
    }
  }
  return files;
}

export function clearGithubCache() {
  projectCache.clear();
  rootCache = null;
}

export async function listVaultProjects(force = false): Promise<{ sha: string; projects: VaultProject[] }> {
  const now = Date.now();
  if (!force && rootCache && now - rootCache.at < COALESCE_MS) {
    return { sha: rootCache.sha, projects: rootCache.projects };
  }
  const listed = await ghRead<DirEntry[]>(contentsUrl(""), force ? undefined : rootCache?.etag);
  if (listed.status === 304 && rootCache) {
    rootCache = { ...rootCache, at: now };
    return { sha: rootCache.sha, projects: rootCache.projects };
  }
  const entries = Array.isArray(listed.data) ? listed.data : [];
  const projects = entries
    .filter((e) => e.type === "dir" && e.name.startsWith("Logs-"))
    .map((e) => ({ id: idFromFolder(e.name), folder: e.name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sha = listed.etag || entries.map((e) => e.sha).join(",");
  rootCache = { etag: listed.etag, projects, sha, at: now };
  return { sha, projects };
}

export async function readProjectFiles(projectId: string, force = false): Promise<{ sha: string; files: VaultFile[] }> {
  const folder = folderForProject(projectId);
  const now = Date.now();
  const cached = projectCache.get(folder);
  if (!force && cached && now - cached.at < COALESCE_MS) {
    return { sha: cached.sha, files: cached.files };
  }

  const listed = await ghRead<DirEntry[]>(contentsUrl(folder), force ? undefined : cached?.dirEtag);
  if (listed.status === 304 && cached) {
    cached.at = now;
    return { sha: cached.sha, files: cached.files };
  }
  if (listed.status === 404) {
    const empty: ProjectCache = { dirEtag: "", files: [], sha: "missing", at: now };
    projectCache.set(folder, empty);
    return { sha: empty.sha, files: [] };
  }

  const entries = Array.isArray(listed.data) ? listed.data : [];
  const files = await filesFromListing(entries);
  const disc = entries.find((e) => e.type === "dir" && e.name === "ID-Discussion");
  if (disc) {
    const nested = await ghRead<DirEntry[]>(contentsUrl(`${folder}/ID-Discussion`));
    const dents = Array.isArray(nested.data) ? nested.data : [];
    files.push(...(await filesFromListing(dents)));
  }

  const sha = entries.map((e) => e.sha).sort().join(",") || listed.etag || folder;
  projectCache.set(folder, { dirEtag: listed.etag, files, sha, at: now });
  return { sha, files };
}

export async function readVaultBytes(path: string): Promise<{ bytes: Buffer; sha: string } | null> {
  const listed = await ghRead<{ sha?: string; content?: string; encoding?: string; size?: number }>(
    contentsUrl(path),
  );
  if (listed.status === 404 || !listed.data?.sha) return null;
  const sha = listed.data.sha;
  const hit = bytesCache.get(sha);
  if (hit) return { bytes: hit, sha };
  let bytes: Buffer;
  if (listed.data.content && listed.data.encoding === "base64") {
    bytes = Buffer.from(listed.data.content.replace(/\n/g, ""), "base64");
  } else {
    const blob = await gh<{ content?: string }>(`/repos/${OWNER}/${REPO}/git/blobs/${sha}`);
    bytes = Buffer.from((blob.content || "").replace(/\n/g, ""), "base64");
  }
  bytesCache.set(sha, bytes);
  return { bytes, sha };
}

export async function putVaultBlob(path: string, base64Content: string, message: string) {
  const apiPath = `/repos/${OWNER}/${REPO}/contents/${path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;
  const existing = await ghRead<{ sha?: string }>(`${apiPath}?ref=${BRANCH}`);
  const payload: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: String(base64Content || "").replace(/\s/g, ""),
    branch: BRANCH,
  };
  if (existing.data?.sha) payload.sha = existing.data.sha;
  try {
    await gh(apiPath, { write: true, method: "PUT", body: JSON.stringify(payload) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("413") || msg.includes("too_large") || msg.includes("too large")) {
      await commitVaultFiles([{ path, content: payload.content, encoding: "base64" }], message);
      return;
    }
    throw e;
  }
  clearGithubCache();
}

export async function putVaultText(path: string, text: string, message: string) {
  await putVaultBlob(path, Buffer.from(text, "utf8").toString("base64"), message);
}

export async function commitVaultFiles(
  files: { path: string; content: string; encoding?: "utf-8" | "base64" }[],
  message: string,
) {
  const head = await gh<{ object: { sha: string } }>(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, {
    write: true,
  });
  const parent = head.object.sha;
  const commit = await gh<{ tree: { sha: string } }>(`/repos/${OWNER}/${REPO}/git/commits/${parent}`, {
    write: true,
  });

  const treeItems: { path: string; mode: string; type: "blob"; sha: string }[] = [];
  for (const f of files) {
    const blob = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/blobs`, {
      write: true,
      method: "POST",
      body: JSON.stringify({ content: f.content, encoding: f.encoding || "utf-8" }),
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/trees`, {
    write: true,
    method: "POST",
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeItems }),
  });

  const created = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/commits`, {
    write: true,
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }),
  });

  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    write: true,
    method: "PATCH",
    body: JSON.stringify({ sha: created.sha }),
  });
  clearGithubCache();
}
