import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { folderForProject } from "./project-id";
import { readProjectFiles, VAULT_HTML } from "./github-vault.server";
import {
  mergeDiscussions,
  mergeParsed,
  parseDiscussionXml,
  parseTrackerXml,
  type ParsedLog,
} from "./parse-tracker-xml";
import type { DiscussionPost, LogFile, TrackerSnapshot } from "./tracker-types";

export function localLogDir(projectId: string) {
  return join("/workspace/artifacts", folderForProject(projectId));
}

export function localDiscussionDir(projectId: string) {
  return join(localLogDir(projectId), "ID-Discussion");
}

function xmlNamesIn(dir: string, extraManifest?: string): string[] {
  let listed: string[] = [];
  try {
    listed = readdirSync(dir).filter((n) => n.endsWith(".xml"));
  } catch {
    listed = [];
  }
  const forced: string[] = [];
  if (extraManifest && existsSync(join(dir, extraManifest))) {
    try {
      for (const line of readFileSync(join(dir, extraManifest), "utf8").split(/\r?\n/)) {
        const n = line.trim();
        if (n.endsWith(".xml")) forced.push(n);
      }
    } catch {
      /* none */
    }
  }
  return [...new Set([...listed, ...forced])].filter((n) => existsSync(join(dir, n))).sort();
}

function filesFromDisk(projectId: string): { parsed: ParsedLog[]; files: LogFile[]; discussions: DiscussionPost[] } {
  const logDir = localLogDir(projectId);
  const discDir = localDiscussionDir(projectId);
  const parsed: ParsedLog[] = [];
  const files: LogFile[] = [];
  const discussions: DiscussionPost[] = [];

  const logNames = xmlNamesIn(logDir, "MANIFEST.txt");
  const ordered = logNames.filter((n) => n !== "HEAD.xml");
  if (logNames.includes("HEAD.xml")) ordered.push("HEAD.xml");
  for (const name of ordered) {
    const path = join(logDir, name);
    const buf = readFileSync(path);
    const xml = buf.toString("utf8");
    const p = parseTrackerXml(xml);
    parsed.push(p);
    const st = statSync(path);
    files.push({
      name: `local:${name}`,
      written: p.written || st.mtime.toISOString(),
      writer: p.writer || "unknown",
      bytes: st.size,
      hash: createHash("sha256").update(buf).digest("hex").slice(0, 8),
    });
    const stray = parseDiscussionXml(xml, name);
    if (stray) discussions.push(stray);
  }

  for (const name of xmlNamesIn(discDir, "MANIFEST.txt")) {
    const path = join(discDir, name);
    const buf = readFileSync(path);
    const xml = buf.toString("utf8");
    const post = parseDiscussionXml(xml, name);
    if (post) discussions.push(post);
    const st = statSync(path);
    files.push({
      name: `local:ID-Discussion/${name}`,
      written: post?.written || st.mtime.toISOString(),
      writer: post?.writer || "unknown",
      bytes: st.size,
      hash: createHash("sha256").update(buf).digest("hex").slice(0, 8),
    });
  }

  return { parsed, files, discussions };
}

function packedFromVault(
  projectId: string,
  sha: string,
  vaultFiles: { path: string; content: string }[],
) {
  const folder = folderForProject(projectId);
  const prefix = `${folder}/`;
  const logs = vaultFiles.filter(
    (f) => f.path.startsWith(prefix) && f.path.endsWith(".xml") && !f.path.includes("/ID-Discussion/"),
  );
  const talks = vaultFiles.filter((f) => f.path.includes("/ID-Discussion/") && f.path.endsWith(".xml"));
  const dated = logs.filter((f) => !f.path.endsWith("/HEAD.xml")).sort((a, b) => a.path.localeCompare(b.path));
  const head = logs.filter((f) => f.path.endsWith("/HEAD.xml"));

  const parsed: ParsedLog[] = [];
  const files: LogFile[] = [];
  const discussions: DiscussionPost[] = [];

  for (const f of [...dated, ...head]) {
    const name = f.path.slice(prefix.length);
    const p = parseTrackerXml(f.content);
    parsed.push(p);
    files.push({
      name: `github:${name}`,
      written: p.written,
      writer: p.writer || "unknown",
      bytes: f.content.length,
      hash: createHash("sha256").update(f.content).digest("hex").slice(0, 8),
    });
  }
  for (const f of talks.sort((a, b) => a.path.localeCompare(b.path))) {
    const name = f.path.split("/").pop() || f.path;
    const post = parseDiscussionXml(f.content, name);
    if (post) discussions.push(post);
    files.push({
      name: `github:ID-Discussion/${name}`,
      written: post?.written || "",
      writer: post?.writer || "unknown",
      bytes: f.content.length,
      hash: createHash("sha256").update(f.content).digest("hex").slice(0, 8),
    });
  }
  return { parsed, files, discussions, sha };
}

export async function loadTrackerSnapshot(projectId: string, force = false): Promise<TrackerSnapshot> {
  const folder = folderForProject(projectId);
  let parsed: ParsedLog[] = [];
  let files: LogFile[] = [];
  let discussions: DiscussionPost[] = [];
  let source = "github-unavailable";
  try {
    const vault = await readProjectFiles(projectId, force);
    const packed = packedFromVault(projectId, vault.sha, vault.files);
    parsed = packed.parsed;
    files = packed.files;
    discussions = packed.discussions;
    source = `${VAULT_HTML}/tree/${vault.sha.slice(0, 7)}/${folder}`;
  } catch {
    const disk = filesFromDisk(projectId);
    parsed = disk.parsed;
    files = disk.files;
    discussions = disk.discussions;
    source = `${localLogDir(projectId)} (github read failed)`;
  }

  const merged = mergeParsed(parsed);
  return {
    app: "Tracker",
    subject: merged.subject || projectId,
    project: projectId,
    folder,
    revision: merged.revision ?? files.length,
    focusPhase: merged.focusPhase || "—",
    focusLabel: merged.focusLabel || "",
    nextIds: merged.nextIds || { bug: 1, feat: 1, comp: 1 },
    bugs: merged.bugs,
    features: merged.features,
    sets: merged.sets,
    compat: merged.compat,
    decisions: merged.decisions,
    notes: merged.notes,
    discussions: mergeDiscussions(discussions),
    files,
    polledAt: new Date().toISOString(),
    logDir: source,
  };
}
