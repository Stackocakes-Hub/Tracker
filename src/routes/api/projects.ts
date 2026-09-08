import { createFileRoute } from "@tanstack/react-router";
import { createVaultProject } from "@/lib/create-project.server";
import { listVaultProjects } from "@/lib/github-vault.server";
import { maybePublishOrigin } from "@/lib/origin-publish.server";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const force = url.searchParams.get("force") === "1";
        try {
          void maybePublishOrigin(request).catch(() => {});
          const data = await listVaultProjects(force);
          return Response.json(data, {
            headers: { "cache-control": "no-store" },
          });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "project list failed" },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { name?: string };
          if (!body.name) return Response.json({ ok: false, error: "name required" }, { status: 400 });
          const result = await createVaultProject(body.name);
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "create failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
