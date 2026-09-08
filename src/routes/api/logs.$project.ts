import { createFileRoute } from "@tanstack/react-router";
import { logsJsonResponse, projectFromRequest } from "@/lib/logs-response.server";

export const Route = createFileRoute("/api/logs/$project")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const extra = projectFromRequest(request, params.project);
          return await logsJsonResponse(params.project || extra.project, extra.force);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "log read failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
