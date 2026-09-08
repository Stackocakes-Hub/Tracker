import { loadTrackerSnapshot } from "./load-tracker-logs.server";

export function projectFromRequest(request: Request, fallback = ""): { project: string; force: boolean } {
  let project = fallback;
  let force = false;
  try {
    const url = new URL(request.url, "http://localhost");
    project = url.searchParams.get("project") || project;
    force = url.searchParams.get("force") === "1";
  } catch {
    /* ignore */
  }
  const header = request.headers.get("x-tracker-project");
  if (header) project = header;
  const referer = request.headers.get("referer") || "";
  const m = referer.match(/\/p\/([^/?#]+)/);
  if (!project && m) project = decodeURIComponent(m[1]);
  if (!project) throw new Error("project required");
  return { project, force };
}

export async function logsJsonResponse(project: string, force: boolean) {
  const snap = await loadTrackerSnapshot(project, force);
  return new Response(JSON.stringify(snap), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}
