import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitVaultFiles, readVaultBytes } from "./github-vault.server";
import { folderForProject } from "./project-id";
import { loadTrackerSnapshot, localDiscussionDir, localLogDir } from "./load-tracker-logs.server";
import { sanitizePictureName } from "./picture-names";
import { type IncomingPicture } from "./pictures.server";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function utcStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function isoNow() {
  return new Date().toISOString();
}

function hash8(body: string) {
  return createHash("sha256").update(body).digest("hex").slice(0, 8);
}

function tryMkdir(dir: string) {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function tryWrite(path: string, body: string | Buffer) {
  try {
    writeFileSync(path, body);
    return true;
  } catch {
    return false;
  }
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function appendManifestLines(lines: string[], name: string, headLast: boolean) {
  const next = lines.filter((l) => l !== name && l !== "HEAD.xml");
  if (!next.includes(name)) next.push(name);
  if (headLast) next.push("HEAD.xml");
  return next;
}

async function manifestLines(vaultPath: string, fallbackPath: string): Promise<string[]> {
  try {
    const remote = await readVaultBytes(vaultPath);
    if (remote) {
      return remote.bytes
        .toString("utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    }
  } catch {
    /* fall through */
  }
  return readLines(fallbackPath);
}

export type IssueAction = "close" | "reopen" | "reply";

export async function applyIssueAction(opts: {
  project: string;
  id: string;
  action: IssueAction;
  notes: string;
  writer: "design" | "impl";
  images?: IncomingPicture[];
  imageNames?: string[];
}) {
  const project = opts.project.trim();
  const folder = folderForProject(project);
  const id = opts.id.trim().toUpperCase();
  if (!/^(BUG|FEAT|SET|COMP)-[\w.]+$/.test(id)) {
    throw new Error("id must be BUG-/FEAT-/SET-/COMP-");
  }
  const writer = opts.writer === "impl" ? "impl" : "design";
  const notes = (opts.notes || "").trim();
  const written = isoNow();
  const stamp = utcStamp();
  const names: string[] = [];
  for (const n of opts.imageNames ?? []) {
    const s = sanitizePictureName(n);
    if (s && !names.includes(s)) names.push(s);
  }
  if (opts.action === "reply" && !notes && names.length === 0) {
    throw new Error("Reply needs a message or a picture");
  }

  const talkText =
    opts.action === "close"
      ? `Closed. ${notes || "Closed."}`
      : opts.action === "reopen"
        ? `Reopened. ${notes || "Reopened."}`
        : notes;
  const imageLines = names.map((n) => `  <image name="${xmlEscape(n)}"/>`).join("\n");
  const talkBody =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<discussion schema="1" target="${xmlEscape(id)}" writer="${writer}" written="${xmlEscape(written)}">\n` +
    `  <app>Tracker</app>\n` +
    `  <body>${xmlEscape(talkText)}</body>\n` +
    (imageLines ? `${imageLines}\n` : "") +
    `</discussion>\n`;
  const talkName = `${id}-${stamp}-${hash8(talkBody)}.xml`;

  const snap = await loadTrackerSnapshot(project, false);
  const logDir = localLogDir(project);
  const discDir = localDiscussionDir(project);
  const ghFiles = snap.files.map((f) => f.name.replace(/^github:/, "").replace(/^local:/, ""));
  const talkManFromSnap = ghFiles
    .filter((n) => n.includes("ID-Discussion/") && n.endsWith(".xml") && !n.includes("/Pictures/"))
    .map((n) => n.split("/").pop() as string);
  const talkManifest = appendManifestLines(
    talkManFromSnap.length ? talkManFromSnap : readLines(join(discDir, "MANIFEST.txt")),
    talkName,
    false,
  );
  const talkManText = talkManifest.join("\n") + "\n";

  if (opts.action === "reply") {
    await commitVaultFiles(
      [
        { path: `${folder}/ID-Discussion/${talkName}`, content: talkBody },
        { path: `${folder}/ID-Discussion/MANIFEST.txt`, content: talkManText },
      ],
      `${project} reply ${id}`,
    );
    if (tryMkdir(discDir)) {
      tryWrite(join(discDir, talkName), talkBody);
      tryWrite(join(discDir, "MANIFEST.txt"), talkManText);
    }
    return { ok: true, id, status: "", revision: snap.revision, logName: "", talkName, vault: true, project, folder };
  }

  const status = opts.action === "close" ? "closed" : "open";
  const kind = id.startsWith("SET-")
    ? "set"
    : id.startsWith("FEAT-")
      ? "feature"
      : id.startsWith("COMP-")
        ? "compat"
        : "bug";
  const revision = (snap.revision || 0) + 1;
  const noteText = notes || (opts.action === "close" ? "Closed." : "Reopened.");
  const logImageLines = names.map((n) => `    <image name="${xmlEscape(n)}"/>`).join("\n");
  const logBody =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<trackerLog schema="1" writer="${writer}" written="${xmlEscape(written)}">\n` +
    `  <app>Tracker</app>\n` +
    `  <subject>${xmlEscape(project)}</subject>\n` +
    `  <revision>${revision}</revision>\n` +
    `  <${kind} id="${xmlEscape(id)}" status="${status}">\n` +
    `    <notes>${xmlEscape(noteText)}</notes>\n` +
    (logImageLines ? `${logImageLines}\n` : "") +
    `  </${kind}>\n` +
    `</trackerLog>\n`;
  const logName = `${stamp}-${hash8(logBody)}.xml`;
  const logManFromSnap = ghFiles.filter((n) => n.endsWith(".xml") && !n.includes("ID-Discussion/"));
  const logManifest = appendManifestLines(
    logManFromSnap.length ? logManFromSnap : readLines(join(logDir, "MANIFEST.txt")),
    logName,
    true,
  );
  const logManText = logManifest.join("\n") + "\n";

  await commitVaultFiles(
    [
      { path: `${folder}/${logName}`, content: logBody },
      { path: `${folder}/HEAD.xml`, content: logBody },
      { path: `${folder}/MANIFEST.txt`, content: logManText },
      { path: `${folder}/ID-Discussion/${talkName}`, content: talkBody },
      { path: `${folder}/ID-Discussion/MANIFEST.txt`, content: talkManText },
    ],
    `${project} ${opts.action} ${id}`,
  );

  tryMkdir(logDir);
  tryWrite(join(logDir, logName), logBody);
  tryWrite(join(logDir, "HEAD.xml"), logBody);
  tryWrite(join(logDir, "MANIFEST.txt"), logManText);
  if (tryMkdir(discDir)) {
    tryWrite(join(discDir, talkName), talkBody);
    tryWrite(join(discDir, "MANIFEST.txt"), talkManText);
  }

  return { ok: true, id, status, revision, logName, talkName, vault: true, project, folder };
}
