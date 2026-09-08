export function sanitizeProjectId(raw: string) {
  const id = raw.trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "");
  if (id.length < 1) throw new Error("Project name must include letters or numbers");
  if (id.length > 40) throw new Error("Project name is too long");
  return id;
}

export function folderForProject(id: string) {
  return `Logs-${sanitizeProjectId(id)}`;
}

export function idFromFolder(folder: string) {
  return folder.replace(/^Logs-/, "");
}
