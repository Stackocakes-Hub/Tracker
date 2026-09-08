import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitVaultFiles, readVaultBytes } from "./github-vault.server";
import { folderForProject } from "./project-id";
import { loadTrackerSnapshot, localLogDir } from "./load-tracker-logs.server";
import { sanitizePictureName } from "./picture-names";
import { uploadPicture, type IncomingPicture } from "./pictures.server";
import type { TicketKind } from "./tracker-types";

export type { TicketKind };

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

function pad(n: number) {
  return String(n).padStart(3, "0");
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

async function remoteLines(path: string, fallback: string) {
  try {
    const remote = await readVaultBytes(path);
    if (remote) {
      return remote.bytes
        .toString("utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    }
  } catch {
    /* local */
  }
  return readLines(fallback);
}

export async function createTicket(opts: {
  project: string;
  kind: TicketKind;
  title: string;
  notes: string;
  writer: "design" | "impl";
  phase?: string;
  severity?: string;
  expected?: string;
  actual?: string;
  size?: string;
  intent?: string;
  exit?: string;
  risk?: string;
  watch?: string;
  images?: IncomingPicture[];
  imageNames?: string[];
}) {
  const project = opts.project.trim();
  const folder = folderForProject(project);
  const title = opts.title.trim();
  if (!title) throw new Error("Title is required");
  const kind = opts.kind;
  const writer = opts.writer === "impl" ? "impl" : "design";
  const snap = await loadTrackerSnapshot(project, false);
  const next = { ...snap.nextIds };
  let id = "";
  if (kind === "bug") {
    id = `BUG-${pad(next.bug)}`;
    next.bug += 1;
  } else if (kind === "feature") {
    id = `FEAT-${pad(next.feat)}`;
    next.feat += 1;
  } else if (kind === "compat") {
    id = `COMP-${pad(next.comp)}`;
    next.comp += 1;
  } else {
    const nums = snap.sets.map((s) => Number((s.id.match(/(\d+)(?:\.\d+)?$/) || [])[1] || 0));
    id = `SET-${Math.max(0, ...nums) + 1}`;
  }

  const written = new Date().toISOString();
  const stamp = utcStamp();
  const names: string[] = [];
  for (const n of opts.imageNames ?? []) {
    const s = sanitizePictureName(n);
    if (s && !names.includes(s)) names.push(s);
  }
  if (opts.images?.length) {
    for (const img of opts.images) {
      const up = await uploadPicture({
        project,
        scope: "log",
        target: id,
        data: img.data,
        mime: img.mime,
      });
      if (!names.includes(up.name)) names.push(up.name);
    }
  }
  const imageLines = names.map((n) => `    <image name="${xmlEscape(n)}"/>`).join("\n");
  const notes = opts.notes.trim();
  const phase = (opts.phase || "1").trim() || "1";
  let inner = "";
  if (kind === "bug") {
    inner =
      `  <bug id="${xmlEscape(id)}" filed="${written.slice(0, 10)}" phase="${xmlEscape(phase)}" severity="${xmlEscape(opts.severity || "normal")}" status="open">\n` +
      `    <title>${xmlEscape(title)}</title>\n` +
      `    <expected>${xmlEscape(opts.expected || "")}</expected>\n` +
      `    <actual>${xmlEscape(opts.actual || "")}</actual>\n` +
      `    <notes>${xmlEscape(notes)}</notes>\n` +
      (imageLines ? `${imageLines}\n` : "") +
      `  </bug>`;
  } else if (kind === "feature") {
    inner =
      `  <feature id="${xmlEscape(id)}" phase="${xmlEscape(phase)}" size="${xmlEscape(opts.size || "S")}" status="specified">\n` +
      `    <title>${xmlEscape(title)}</title>\n` +
      `    <notes>${xmlEscape(notes)}</notes>\n` +
      (imageLines ? `${imageLines}\n` : "") +
      `  </feature>`;
  } else if (kind === "compat") {
    inner =
      `  <compat id="${xmlEscape(id)}" status="open">\n` +
      `    <risk>${xmlEscape(opts.risk || title)}</risk>\n` +
      `    <watch>${xmlEscape(opts.watch || notes)}</watch>\n` +
      (imageLines ? `${imageLines}\n` : "") +
      `  </compat>`;
  } else {
    inner =
      `  <set id="${xmlEscape(id)}" phase="${xmlEscape(phase)}" status="open" order="${snap.sets.length + 1}">\n` +
      `    <title>${xmlEscape(title)}</title>\n` +
      `    <intent>${xmlEscape(opts.intent || notes)}</intent>\n` +
      `    <exit>${xmlEscape(opts.exit || "")}</exit>\n` +
      (imageLines ? `${imageLines}\n` : "") +
      `  </set>`;
  }

  const revision = (snap.revision || 0) + 1;
  const logBody =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<trackerLog schema="1" writer="${writer}" written="${xmlEscape(written)}">\n` +
    `  <app>Tracker</app>\n` +
    `  <subject>${xmlEscape(project)}</subject>\n` +
    `  <revision>${revision}</revision>\n` +
    `  <nextIds bug="${next.bug}" feat="${next.feat}" comp="${next.comp}"/>\n` +
    `${inner}\n` +
    `</trackerLog>\n`;
  const logName = `${stamp}-${createHash("sha256").update(logBody).digest("hex").slice(0, 8)}.xml`;
  const logDir = localLogDir(project);
  const ghFiles = snap.files.map((f) => f.name.replace(/^github:/, "").replace(/^local:/, ""));
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
    ],
    `${project} create ${id}`,
  );

  tryMkdir(logDir);
  tryWrite(join(logDir, logName), logBody);
  tryWrite(join(logDir, "HEAD.xml"), logBody);
  tryWrite(join(logDir, "MANIFEST.txt"), logManText);

  return { ok: true, id, revision, nextIds: next, project, folder };
}
