import { folderForProject } from "./project-id";

export function rootReadme() {
  return `# Tracker-Vault

Shared XML log vault for multiple software projects.

This repository is **not** application source. Tracker (the website) reads and writes it.

Each project is a folder named \`Logs-<ProjectName>/\`.

**Write contract:** [PROTOCOL.md](PROTOCOL.md). Every project folder has a copy.

| Path | Role |
|---|---|
| \`Logs-<ProjectName>/\` | Status XML, HEAD, MANIFEST |
| \`Logs-<ProjectName>/ID-Discussion/\` | One XML file per question or reply |
| \`TRACKER_ORIGIN.txt\` | Live Tracker website URL (humans). Grok does not POST pictures there. |
| \`PROTOCOL.md\` | Hash names, three-file commit, revision, writers, pictures |

Grok pictures: host the file yourself, \`<image href="https://…"/>\`. Do not POST to Tracker.

Rename a ticket: new XML, same id, new \`<title>\`. See PROTOCOL.md. Do not mint a new id.

Repo: https://github.com/Stackocakes-Hub/Tracker-Vault
`;
}

export function projectReadme(id: string) {
  const folder = folderForProject(id);
  return `# ${folder}

XML logs for **${id}**.

Read [PROTOCOL.md](PROTOCOL.md) in this folder before writing. That file is the write contract (hash names, three-file commit, revision, writers, pictures).

- Newest delta: \`HEAD.xml\`
- Discovery list: \`MANIFEST.txt\` — every dated xml in this folder must be listed
- Discussions: \`ID-Discussion/\`
- Pictures: Grok hosts on https they control, then \`<image href="https://…"/>\`. Not this repo. Not POST to Tracker.
- Rename: new dated XML, same id, new \`<title>\`. Ids never change. See PROTOCOL.md.
- Subject string: \`${id}\` (exact)

Do not put application source here.
`;
}

export function picturesDoc(id: string) {
  return `# Pictures — ${id}

Grok: do **not** POST to Tracker (login wall). Do **not** store bytes in this GitHub vault.

Host the file on https you control, then in discussion XML:

\`<image href="https://your-host.example/file.jpg"/>\`

Website compose still uses the Tracker picture store. That is not the Grok path.

See PROTOCOL.md.
`;
}

export function rootProtocol() {
  return `# Tracker-Vault protocol

Vault: https://github.com/Stackocakes-Hub/Tracker-Vault
Branch: \`main\`

This repository is the shared log. It is **not** application source and **not** the Tracker website source.

- **Tracker** (the website) reads and writes this vault.
- **Design Grok** files bugs, sets, decisions; sets \`verified\` / \`closed\`.
- **Impl Grok** reads the vault and writes status (\`confirmed\`, \`in-progress\`, \`fixed\`).
- Both use GitHub tools on \`main\`.

Each project is \`Logs-<ProjectName>/\`. FrameField subject is **FrameField** (not Framefield). Tracker subject is **Tracker**.

See also the PROTOCOL.md inside each project folder (same rules, with that folder filled in).

## Files that matter

| Path | Role |
|---|---|
| \`PROTOCOL.md\` | This document. Read it first. |
| \`TRACKER_ORIGIN.txt\` | Live website URL for humans. Grok does not upload pictures there. |
| \`Logs-<Project>/HEAD.xml\` | Newest delta. Always read. Always overwrite on write. |
| \`Logs-<Project>/MANIFEST.txt\` | One filename per line, oldest first, \`HEAD.xml\` last. |
| \`Logs-<Project>/YYYY-MM-DDTHHmmssZ-<hash>.xml\` | Immutable dated entries. Never edit. Never delete. |
| \`Logs-<Project>/ID-Discussion/\` | One XML file per message. |

Every dated \`*.xml\` that exists in the folder **must** be listed on MANIFEST. If you write a file, list it in the same commit.

## Canonical filename (hash naming)

Do **not** edit an old dated XML file.

1. Build the XML body (UTF-8).
2. SHA-256 the **exact body**. First 8 lowercase hex chars = \`hash\`.
3. Dated name: \`YYYY-MM-DDTHHmmssZ-<hash>.xml\`
   - UTC
   - Date has hyphens: \`2026-09-05\`
   - Time has **no colons**: \`T074310Z\`
   - Then a hyphen and the 8-char hash
4. Example: \`2026-09-05T074310Z-ca1a383b.xml\`

Legacy compact names (\`20260905T072846Z-…\`) exist on Logs-Tracker. **Do not mint new files that way. Do not rename old files.**

\`written=\` on the XML root is ISO-8601 (colons allowed). Only the **filename** strips colons.

Discussion filenames: \`TARGET-YYYY-MM-DDTHHmmssZ-<hash>.xml\`

## Three-file commit (status logs)

GitHub \`push_files\` on \`main\` with **three** files in **one** commit:

1. \`Logs-<Project>/<dated>.xml\` — the new body
2. \`Logs-<Project>/HEAD.xml\` — **same** body
3. \`Logs-<Project>/MANIFEST.txt\` — previous dated names + the new dated name + \`HEAD.xml\` last

Do not drop names from MANIFEST. Insert a missed file in filename order.

## Revision

Read \`HEAD.xml\`. New \`<revision>\` is that number **plus 1**. Never reuse a revision. Never go backwards.

## Writers

| \`writer=\` | Who | May set |
|---|---|---|
| \`impl\` | implementation Grok | \`confirmed\` \`in-progress\` \`fixed\` and discussion |
| \`design\` | Tracker / design Grok | \`open\` \`verified\` \`closed\` \`wontfix\` \`done\` and discussion |

Impl never sets \`verified\`. Design never pretends a code fix is \`fixed\` unless they actually changed the app.

Either side may \`closed\` or reopen (\`open\`).

\`<app>Tracker</app>\` always. \`<subject>\` is the project id exact: \`FrameField\` or \`Tracker\`.

## nextIds

HEAD (and any minting delta) **must** include:

\`\`\`xml
<nextIds bug="3" feat="21" comp="10"/>
\`\`\`

Those numbers are the **next unused** id. FrameField current values (2026-09-05, rev 17): **bug 3, feat 21, comp 10** (BUG-001..002, FEAT-001..020, COMP-001..009). Before minting a new id, read HEAD. After minting, bump the matching number in the same delta.

## How to read (every turn, before you code)

1. \`github___get_file_contents\` owner \`Stackocakes-Hub\` repo \`Tracker-Vault\` path \`Logs-<Project>/MANIFEST.txt\`
2. Same for \`Logs-<Project>/HEAD.xml\`
3. Any dated name that was not on MANIFEST last turn is new. Fetch it.
4. Merge in **filename order**, then apply \`HEAD.xml\` last.
5. Same \`id\` → later file wins. Notes and decisions accumulate.

A log is “new” if its filename is not in your last-seen MANIFEST.

## Status words (exact strings)

### Bugs

| Status | Who | Complete? |
|---|---|---|
| \`open\` | design or impl | no (also used to reopen) |
| \`confirmed\` | impl | no |
| \`in-progress\` | impl | no |
| \`fixed\` | impl | no — waiting for design |
| \`verified\` | design | **yes** |
| \`closed\` | design or impl | **yes** |
| \`wontfix\` | design | parked |

\`fixed\` is not closed.

### Sets and features

| Status | Complete? |
|---|---|
| \`planned\` | no |
| \`specified\` | no |
| \`in-progress\` | no |
| \`blocked\` | no |
| \`done\` | **yes** (exit true and gates complete) |
| \`parked\` | n/a |

## Impl: mark a bug fixed (not verified)

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<trackerLog schema="1" writer="impl" written="2026-09-05T12:00:00-05:00">
  <app>Tracker</app>
  <subject>FrameField</subject>
  <revision>18</revision>
  <nextIds bug="3" feat="21" comp="10"/>
  <bug id="BUG-001" status="fixed">
    <notes>File: src/foo.ts. How to verify: zoom in, draw, sizes match.</notes>
  </bug>
</trackerLog>
\`\`\`

Then the three-file commit. \`writer="impl"\`. Bump revision.

## Design: verify or close

Same three-file commit, \`writer="design"\`.

## Titles (rename)

Ticket ids (\`BUG-001\`, \`FEAT-009\`, \`SET-…\`, \`COMP-…\`) **never change**. Do not mint a new id to fix a bad title. Do not edit the old dated file.

To rename, write a **new** dated XML (three-file commit) with the same \`id\` and a new \`<title>\`. **Omit \`status=\`** so the current status stays. Empty \`<title>\` is ignored and does not wipe the name.

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<trackerLog schema="1" writer="design" written="2026-09-05T12:00:00-05:00">
  <app>Tracker</app>
  <subject>Tracker</subject>
  <revision>28</revision>
  <nextIds bug="2" feat="11" comp="1"/>
  <feature id="FEAT-009">
    <title>Ticket search (/)</title>
    <notes>Renamed from "Search box and / shortcut".</notes>
  </feature>
</trackerLog>
\`\`\`

Compat items have no title; they use \`<risk>\` / \`<watch>\`. Same rule: new delta, same id, only the fields you are changing.

Optional: also post a discussion line \`Renamed: old → new\`.

## Discussion (not a status change)

One new XML per message in \`Logs-<Project>/ID-Discussion/\`.

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<discussion schema="1" target="BUG-001" writer="impl" written="2026-09-05T12:00:00-05:00">
  <app>Tracker</app>
  <body>Question or reply. Plain text. Concept art attached.</body>
  <image href="https://your-host.example/concept.jpg"/>
</discussion>
\`\`\`

Commit **two** files only (XML, never image bytes):

1. \`Logs-<Project>/ID-Discussion/<TARGET-dated-hash>.xml\`
2. Append that name to \`Logs-<Project>/ID-Discussion/MANIFEST.txt\`

Do not edit old discussion files.

## Pictures (Grok concept art, screenshots)

**Grok does not POST pictures to Tracker.** The published site is behind a Grok login; impl cannot upload there. **Do not** put image bytes in this GitHub vault either.

Host the file **yourself** (any https URL you control: GitHub raw on a repo you can write, an object store, etc.). Point at it from XML:

\`\`\`xml
<image href="https://your-host.example/path/concept.jpg"/>
\`\`\`

Rules:

- \`href\` must be \`https://\` only. No \`http\`, no \`data:\`, no SVG.
- Optional \`name\` is ignored when \`href\` is present.
- Max 4 \`<image>\` tags per message.
- Tracker displays the URL as an \`<img src>\`. If the host blocks hotlinking, the picture will not show — that is your host, not Tracker.
- Website users attaching from the Tracker UI still use the site's own picture store. That path is **not** for Grok.

If you cannot host a public https image, post the discussion **text** only.

Missing or bad pictures are skipped; they do not break the scanner.

## What not to write

- Application source
- Image bytes (png/jpg/webp/gif) or base64 pictures
- Edits to old dated xml
- \`status="verified"\` from impl
- \`status="done"\` on a set whose gates are still open
- New files using the compact \`YYYYMMDDThhmmssZ\` stamp

## GitHub tools (Grok)

Read: \`github___get_file_contents\`
Write several files: \`github___push_files\`
owner \`Stackocakes-Hub\` repo \`Tracker-Vault\` branch \`main\`
`;
}

export function projectProtocol(id: string) {
  const folder = folderForProject(id);
  return rootProtocol()
    .replace(/^# Tracker-Vault protocol/m, `# Protocol — ${id}`)
    .replace(/Logs-<Project>/g, folder)
    .replace(
      "Each project is `Logs-<ProjectName>/`. FrameField subject is **FrameField** (not Framefield). Tracker subject is **Tracker**.",
      `This folder is \`${folder}/\`. \`<subject>\` must be **${id}**.`,
    );
}

export function aiUsagePrompt(id: string) {
  const folder = folderForProject(id);
  return `You are working on project ${id}. Shared log vault (read + write). Not this app's source.

https://github.com/Stackocakes-Hub/Tracker-Vault
Folder: ${folder}/
Protocol (full write contract): ${folder}/PROTOCOL.md  and  PROTOCOL.md at repo root

Every turn before you code:
1. github___get_file_contents owner=Stackocakes-Hub repo=Tracker-Vault path=${folder}/MANIFEST.txt
2. same for ${folder}/HEAD.xml
3. Fetch any dated xml on MANIFEST you have not seen.

Write method (do not skip):
- Never edit old xml.
- SHA-256 the new body; first 8 hex chars = hash.
- Filename UTC: YYYY-MM-DDTHHmmssZ-<hash>.xml  (hyphens in the date, no colons in the time). Example: 2026-09-05T074310Z-ca1a383b.xml
- One commit, three files: ${folder}/<dated>.xml, ${folder}/HEAD.xml (same body), ${folder}/MANIFEST.txt (append dated name; HEAD.xml last).
- Bump <revision> by 1 from last HEAD.
- writer="impl" or writer="design".
- <subject>${id}</subject> exact.
- Include <nextIds bug="…" feat="…" comp="…"/> from HEAD; bump if you mint an id.

Impl marks bugs status="fixed" (not verified). Design sets verified / closed.
Questions: one XML per message in ${folder}/ID-Discussion/ plus that folder's MANIFEST.txt.
Pictures: NEVER POST to Tracker (Grok login blocks it). NEVER push image bytes to this vault.
Host the file on https you control, then <image href="https://your-host.example/file.jpg"/>.
Text-only is fine if you cannot host.
Rename: new dated XML, same id, new <title>. Omit status= so status stays. Never mint a new id to fix a title. Never edit old xml.
Close = status="closed". Reopen = status="open".
`;
}
