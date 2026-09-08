import { createHash } from "node:crypto";
import { aiUsagePrompt, picturesDoc, projectProtocol, projectReadme, rootProtocol, rootReadme } from "./project-docs";
import { folderForProject, sanitizeProjectId } from "./project-id";
import { commitVaultFiles, listVaultProjects } from "./github-vault.server";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

export async function createVaultProject(rawName: string) {
  const id = sanitizeProjectId(rawName);
  const folder = folderForProject(id);
  const existing = await listVaultProjects(true);
  if (existing.projects.some((p) => p.id.toLowerCase() === id.toLowerCase())) {
    throw new Error(`Project ${id} already exists`);
  }

  const written = new Date().toISOString();
  const logBody =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<trackerLog schema="1" writer="design" written="${xmlEscape(written)}">\n` +
    `  <app>Tracker</app>\n` +
    `  <subject>${xmlEscape(id)}</subject>\n` +
    `  <revision>1</revision>\n` +
    `  <bug id="BUG-001" filed="${written.slice(0, 10)}" phase="0" severity="low" status="closed">\n` +
    `    <title>Project ${xmlEscape(id)} created</title>\n` +
    `    <notes>Folder ${xmlEscape(folder)} created. This creation log is closed.</notes>\n` +
    `  </bug>\n` +
    `</trackerLog>\n`;
  const hash = createHash("sha256").update(logBody).digest("hex").slice(0, 8);
  const stamp = written.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dated = `${stamp}-${hash}.xml`;
  const prompt = aiUsagePrompt(id);

  await commitVaultFiles(
    [
      { path: "README.md", content: rootReadme() },
      { path: "PROTOCOL.md", content: rootProtocol() },
      { path: `${folder}/README.md`, content: projectReadme(id) },
      { path: `${folder}/PROTOCOL.md`, content: projectProtocol(id) },
      { path: `${folder}/PICTURES.md`, content: picturesDoc(id) },
      { path: `${folder}/HEAD.xml`, content: logBody },
      { path: `${folder}/${dated}`, content: logBody },
      { path: `${folder}/MANIFEST.txt`, content: `${dated}\nHEAD.xml\n` },
      {
        path: `${folder}/ID-Discussion/README.md`,
        content: `# ID-Discussion\n\nOne XML file per message for ${id}. Pictures: POST /api/picture, then <image name> in XML. Never GitHub binaries.\n`,
      },
      { path: `${folder}/ID-Discussion/MANIFEST.txt`, content: "" },
    ],
    `Create project ${id}`,
  );

  return { ok: true, id, folder, prompt };
}
