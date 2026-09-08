import { createServerFn } from "@tanstack/react-start";
import type { TrackerSnapshot } from "./tracker-types";

export const fetchTrackerSnapshot = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const x = d as { project?: string; force?: boolean };
    if (!x?.project) throw new Error("project required");
    return { project: String(x.project), force: Boolean(x.force) };
  })
  .handler(async ({ data }): Promise<TrackerSnapshot> => {
    const { loadTrackerSnapshot } = await import("./load-tracker-logs.server");
    return loadTrackerSnapshot(data.project, data.force);
  });

export const fetchProjectList = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ force: Boolean((d as { force?: boolean } | null)?.force) }))
  .handler(async ({ data }) => {
    const { listVaultProjects } = await import("./github-vault.server");
    return listVaultProjects(data.force);
  });
