import { createFileRoute } from "@tanstack/react-router";
import { logsJsonResponse, projectFromRequest } from "@/lib/logs-response.server";

export const Route = createFileRoute("/api/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { project, force } = projectFromRequest(request);
          return await logsJsonResponse(project, force);
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
